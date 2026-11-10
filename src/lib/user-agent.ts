/** A readable name for a browser's user-agent string, e.g. "Chrome on macOS". Best effort; never throws. */
export type DeviceKind = "desktop" | "mobile" | "tablet";

export interface DeviceDescription {
  browser: string;
  os: string;
  kind: DeviceKind;
  label: string;
}

const BROWSERS: [RegExp, string][] = [
  [/\bEdg(?:e|A|iOS)?\//, "Edge"],
  [/\b(?:OPR|Opera)\//, "Opera"],
  [/\bSamsungBrowser\//, "Samsung Internet"],
  [/\b(?:Firefox|FxiOS)\//, "Firefox"],
  [/\bCriOS\//, "Chrome"],
  [/\b(?:Headless)?Chrome\//, "Chrome"],
  [/\bVersion\/[\d.]+.*\bSafari\//, "Safari"],
  [/\bcurl\//, "curl"],
];

const SYSTEMS: [RegExp, string][] = [
  [/\biPhone\b/, "iPhone"],
  [/\biPad\b/, "iPad"],
  [/\bAndroid\b/, "Android"],
  [/\bWindows NT\b/, "Windows"],
  [/\bCrOS\b/, "ChromeOS"],
  [/\bMac OS X\b|\bMacintosh\b/, "macOS"],
  [/\bLinux\b/, "Linux"],
];

export function describeUserAgent(ua: string | null | undefined): DeviceDescription {
  const value = ua ?? "";
  const browser = BROWSERS.find(([re]) => re.test(value))?.[1] ?? "Unknown browser";
  const os = SYSTEMS.find(([re]) => re.test(value))?.[1] ?? "";
  const kind: DeviceKind = /\biPad\b|\bTablet\b/.test(value) || (/\bAndroid\b/.test(value) && !/\bMobile\b/.test(value))
    ? "tablet"
    : /\bMobi|\biPhone\b/.test(value)
      ? "mobile"
      : "desktop";
  return { browser, os, kind, label: os ? `${browser} on ${os}` : browser };
}
