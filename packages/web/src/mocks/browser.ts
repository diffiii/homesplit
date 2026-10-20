import { setupWorker } from "msw/browser";
import type { HouseholdRole } from "@/lib/api/auth-client";
import { MockDb, type MockState } from "./db";
import { createHandlers } from "./handlers";
import { DEFAULT_NETWORK, type MockNetwork } from "./routes";
import {
  DEFAULT_SCENARIO,
  isScenarioName,
  SCENARIOS,
  type ScenarioName,
} from "./scenarios";

const STORAGE_KEY = "homesplit:mocks";
/** Bump when `MockState` changes shape, so saved data is rebuilt instead of misread. */
const STORAGE_VERSION = 1;

/** The cookie the proxy looks for; Better Auth's real one is HTTP-only. */
const SESSION_COOKIE = "better-auth.session_token";

interface Saved {
  network: MockNetwork;
  scenario: ScenarioName;
  state: MockState;
  version: number;
}

function load(): Partial<Saved> {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}");
    if (saved.version === STORAGE_VERSION && isScenarioName(saved.scenario)) {
      return saved;
    }
  } catch {
    // Unreadable data starts the scenario afresh.
  }
  return {};
}

/** Keep the session cookie in step with the mock session, so the proxy lets pages through. */
function syncSessionCookie(userId: string | null) {
  // biome-ignore lint/suspicious/noDocumentCookie: the mocks stand in for Better Auth's Set-Cookie
  document.cookie = userId
    ? `${SESSION_COOKIE}=mock-session-${userId}; path=/; SameSite=Lax`
    : `${SESSION_COOKIE}=; path=/; max-age=0`;
}

/** A mock user and where they belong, for picking whom to sign in as. */
export interface MockUserInfo {
  email: string;
  households: { name: string; role: HouseholdRole | "departed" }[];
  id: string;
  name: string;
}

function describeUsers(db: MockDb): MockUserInfo[] {
  return db.state.users.map(({ id, name, email }) => ({
    id,
    name,
    email,
    households: db.state.history
      .filter(({ userId }) => userId === id)
      .map(({ householdId }) => ({
        name: db.household(householdId)?.name ?? householdId,
        role: db.member(householdId, id)?.role ?? "departed",
      })),
  }));
}

export interface MockControls {
  network: MockNetwork;
  scenario: ScenarioName;
  scenarios: { description: string; label: string; name: ScenarioName }[];
  sessionUserId: string | null;
  setNetwork: (network: MockNetwork) => void;
  /** Sign in as a mock user, or sign out with `null`. */
  signInAs: (userId: string | null) => void;
  /** Start `scenario` afresh, dropping changes made since. */
  switchScenario: (scenario: ScenarioName) => void;
  users: MockUserInfo[];
}

let started: Promise<MockControls> | undefined;

/**
 * Start the mock service worker, once, with the saved data or the default
 * scenario. Resolves once requests are intercepted, so call it before the
 * app makes any.
 */
export function startMocks(): Promise<MockControls> {
  started ??= start();
  return started;
}

async function start(): Promise<MockControls> {
  const saved = load();
  let scenario = saved.scenario ?? DEFAULT_SCENARIO;
  let network = saved.network ?? DEFAULT_NETWORK;
  const db = new MockDb(saved.state ?? SCENARIOS[scenario].build());

  const save = () => {
    const data: Saved = {
      version: STORAGE_VERSION,
      scenario,
      network,
      state: db.state,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    syncSessionCookie(db.state.sessionUserId);
  };
  db.subscribe(save);
  save();

  const worker = setupWorker(...createHandlers(db, () => network));
  await worker.start({ onUnhandledFrame: "bypass", quiet: true });
  console.info(
    `[mocks] API mocked with the "${scenario}" scenario. Switch it on /dev/mocks.`
  );

  return {
    get network() {
      return network;
    },
    get scenario() {
      return scenario;
    },
    scenarios: Object.entries(SCENARIOS).map(
      ([name, { label, description }]) => ({
        name: name as ScenarioName,
        label,
        description,
      })
    ),
    get sessionUserId() {
      return db.state.sessionUserId;
    },
    get users() {
      return describeUsers(db);
    },
    setNetwork: (next) => {
      network = next;
      save();
    },
    signInAs: (userId) => {
      db.state.sessionUserId = userId;
      db.changed();
    },
    switchScenario: (next) => {
      scenario = next;
      db.replace(SCENARIOS[next].build());
    },
  };
}
