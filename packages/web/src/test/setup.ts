import "@testing-library/jest-dom/vitest";
import { File as NodeFile } from "node:buffer";
import { cleanup } from "@testing-library/react";
import { toast } from "sonner";
import { afterAll, afterEach, beforeEach, vi } from "vitest";
import { DEFAULT_SCENARIO } from "@/mocks/scenarios";
import { loadScenario, server } from "./mock-server";
import { resetNavigation } from "./navigation";

// Before any test file loads: Better Auth keeps the `fetch` it's created
// with, so it has to be the one MSW patched.
server.listen({ onUnhandledFrame: "error" });

vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/navigation")>()),
  ...(await import("./navigation")).navigationMock,
}));

// jsdom has no media queries; every query is false, as on a light desktop.
window.matchMedia ??= (query: string): MediaQueryList => ({
  matches: false,
  media: query,
  onchange: null,
  addEventListener: () => undefined,
  removeEventListener: () => undefined,
  addListener: () => undefined,
  removeListener: () => undefined,
  dispatchEvent: () => false,
});

// Node's multipart parser builds files with the global `File`, which jsdom
// replaces with one Node's `FormData` refuses, so mocks reading an upload
// would fail. Parse with Node's own instead.
const parseFormData = Request.prototype.formData;
const JsdomFile = globalThis.File;
Request.prototype.formData = async function formData(this: Request) {
  globalThis.File = NodeFile as typeof File;
  try {
    return await parseFormData.call(this);
  } finally {
    globalThis.File = JsdomFile;
  }
};

// jsdom has no canvas and logs whenever axe asks it for one to check icon fonts.
HTMLCanvasElement.prototype.getContext = () => null;

beforeEach(() => loadScenario(DEFAULT_SCENARIO));

afterEach(() => {
  cleanup();
  // Sonner keeps toasts in module state and replays them to the next test's toaster.
  toast.dismiss();
  server.resetHandlers();
  resetNavigation();
  localStorage.clear();
});

afterAll(() => server.close());
