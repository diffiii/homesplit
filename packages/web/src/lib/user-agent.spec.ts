import { describe, expect, it } from "vitest";
import { describeUserAgent } from "./user-agent";

const AGENTS = {
  chromeMac:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
  safariIphone:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
  chromeIphone:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/130.0.6723.90 Mobile/15E148 Safari/604.1",
  firefoxWindows:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:131.0) Gecko/20100101 Firefox/131.0",
  edgeWindows:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0",
  chromeAndroid:
    "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36",
  samsungAndroid:
    "Mozilla/5.0 (Linux; Android 14; SM-S921B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/26.0 Chrome/122.0.0.0 Mobile Safari/537.36",
  safariIpad:
    "Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
  operaLinux:
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 OPR/115.0.0.0",
  chromebook:
    "Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
};

describe("describeUserAgent", () => {
  it.each([
    [AGENTS.chromeMac, "Chrome on macOS", false],
    [AGENTS.safariIphone, "Safari on iOS", true],
    [AGENTS.chromeIphone, "Chrome on iOS", true],
    [AGENTS.firefoxWindows, "Firefox on Windows", false],
    [AGENTS.edgeWindows, "Edge on Windows", false],
    [AGENTS.chromeAndroid, "Chrome on Android", true],
    [AGENTS.samsungAndroid, "Samsung Internet on Android", true],
    [AGENTS.safariIpad, "Safari on iPadOS", true],
    [AGENTS.operaLinux, "Opera on Linux", false],
    [AGENTS.chromebook, "Chrome on ChromeOS", false],
  ])("names %s", (userAgent, label, mobile) => {
    expect(describeUserAgent(userAgent)).toEqual({ label, mobile });
  });

  it("says what it can of an unusual user agent", () => {
    expect(describeUserAgent("curl/8.7.1").label).toBe("Unknown device");
    expect(describeUserAgent("SomeBot/1.0 (Windows NT 10.0)").label).toBe(
      "Windows"
    );
    expect(describeUserAgent(null)).toEqual({
      label: "Unknown device",
      mobile: false,
    });
  });
});
