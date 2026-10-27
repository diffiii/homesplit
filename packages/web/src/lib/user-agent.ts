// Order matters: Edge and Opera also say Chrome, and Chrome also says Safari.
const BROWSERS: readonly [pattern: RegExp, name: string][] = [
  [/\bEdg(?:e|A|iOS)?\//, "Edge"],
  [/\bOPR\/|\bOpera\b/, "Opera"],
  [/\bSamsungBrowser\//, "Samsung Internet"],
  [/\bFirefox\/|\bFxiOS\//, "Firefox"],
  [/\bChrome\/|\bCriOS\//, "Chrome"],
  [/\bVersion\/[\d.]+.*\bSafari\//, "Safari"],
];

// iPads and Android also say Mac OS X and Linux.
const SYSTEMS: readonly [pattern: RegExp, name: string][] = [
  [/\biPhone\b|\biPod\b/, "iOS"],
  [/\biPad\b/, "iPadOS"],
  [/\bAndroid\b/, "Android"],
  [/\bCrOS\b/, "ChromeOS"],
  [/\bWindows\b/, "Windows"],
  [/\bMac OS X\b|\bMacintosh\b/, "macOS"],
  [/\bLinux\b/, "Linux"],
];

const MOBILE = /\bMobile\b|\biPhone\b|\bAndroid\b/;

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
