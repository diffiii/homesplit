import type { MockState } from "./db";
import type { MockNetwork } from "./routes";
import type { ScenarioName } from "./scenarios";

/** The `localStorage` key the browser mocks keep their data under between page loads. */
export const MOCK_STORAGE_KEY = "homesplit:mocks";

/** Bump when `MockState` changes shape, so saved data is rebuilt instead of misread. */
export const MOCK_STORAGE_VERSION = 3;

export interface SavedMocks {
  network: MockNetwork;
  scenario: ScenarioName;
  state: MockState;
  version: number;
}

/** The cookie the proxy looks for; Better Auth's real one is HTTP-only. */
export const MOCK_SESSION_COOKIE = "better-auth.session_token";

/** The session cookie's value while `userId` is signed in to the mocks. */
export function mockSessionToken(userId: string): string {
  return `mock-session-${userId}`;
}
