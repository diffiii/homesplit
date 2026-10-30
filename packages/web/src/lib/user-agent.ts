// Order matters: Edge and Opera also say Chrome, and Chrome also says Safari.
const BROWSERS: readonly [pattern: RegExp, name: string][] = [
  [/\bEdg(?:e|A|iOS)?\//u, "Edge"],
  [/\bOPR\/|\bOpera\b/u, "Opera"],
  [/\bSamsungBrowser\//u, "Samsung Internet"],
  [/\bFirefox\/|\bFxiOS\//u, "Firefox"],
  [/\bChrome\/|\bCriOS\//u, "Chrome"],
  [/\bVersion\/[\d.]+.*\bSafari\//u, "Safari"],
];

// iPads and Android also say Mac OS X and Linux.
const SYSTEMS: readonly [pattern: RegExp, name: string][] = [
  [/\biPhone\b|\biPod\b/u, "iOS"],
  [/\biPad\b/u, "iPadOS"],
  [/\bAndroid\b/u, "Android"],
  [/\bCrOS\b/u, "ChromeOS"],
  [/\bWindows\b/u, "Windows"],
  [/\bMac OS X\b|\bMacintosh\b/u, "macOS"],
  [/\bLinux\b/u, "Linux"],
];

const MOBILE = /\bMobile\b|\biPhone\b|\bAndroid\b/u;

export interface DeviceDescription {
  /** `Chrome on macOS`, or as much of it as the user agent tells. */
  label: string;
  mobile: boolean;
}

const find = (
  candidates: readonly [RegExp, string][],
  userAgent: string
): string | undefined =>
  candidates.find(([pattern]) => pattern.test(userAgent))?.[1];

/**
 * A device as people name it, from the user agent Better Auth stored with the
 * session. Good enough to tell your own devices apart, not to identify them.
 */
export function describeUserAgent(
  userAgent: string | null | undefined
): DeviceDescription {
  const browser = userAgent ? find(BROWSERS, userAgent) : undefined;
  const system = userAgent ? find(SYSTEMS, userAgent) : undefined;
  let label = "Unknown device";
  if (browser && system) {
    label = `${browser} on ${system}`;
  } else if (browser || system) {
    label = browser ?? system ?? label;
  }
  return { label, mobile: userAgent ? MOBILE.test(userAgent) : false };
}
