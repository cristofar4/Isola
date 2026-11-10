import { describe, expect, it } from "vitest";
import { initialsOf } from "@/lib/initials";
import { describeUserAgent } from "@/lib/user-agent";

describe("describeUserAgent", () => {
  it.each([
    ["Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36", "Chrome on macOS", "desktop"],
    ["Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0", "Edge on Windows", "desktop"],
    ["Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1", "Safari on iPhone", "mobile"],
    ["Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1", "Safari on iPad", "tablet"],
    ["Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36", "Chrome on Android", "mobile"],
    ["Mozilla/5.0 (Linux; Android 13; SM-X700) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/23.0 Chrome/115.0.0.0 Safari/537.36", "Samsung Internet on Android", "tablet"],
    ["Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:132.0) Gecko/20100101 Firefox/132.0", "Firefox on Linux", "desktop"],
    ["Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/131.0.0.0 Safari/537.36", "Chrome on Linux", "desktop"],
  ])("%s", (ua, label, kind) => {
    const d = describeUserAgent(ua);
    expect(d.label).toBe(label);
    expect(d.kind).toBe(kind);
  });

  it("copes with a missing or unknown user agent", () => {
    expect(describeUserAgent(null).label).toBe("Unknown browser");
    expect(describeUserAgent("node").label).toBe("Unknown browser");
  });
});


describe("initialsOf", () => {
  it("uses the first and last word of the name", () => {
    expect(initialsOf("Ada Lovelace", "a@x.com")).toBe("AL");
    expect(initialsOf("Free Then Pro", "a@x.com")).toBe("FP");
    expect(initialsOf("Grace", "g@x.com")).toBe("GR");
  });
  it("falls back to the email's name part", () => {
    expect(initialsOf("", "ada.lovelace@example.com")).toBe("AL");
    expect(initialsOf("  ", "x@example.com")).toBe("X");
  });
});
