import { describe, expect, it } from "vitest";
import { AVATAR_MAX_CHARS, isAcceptableAvatar } from "@/lib/avatar";

describe("profile photos", () => {
  it("accepts small JPEG, PNG and WebP data URLs and https photos", () => {
    expect(isAcceptableAvatar("data:image/jpeg;base64,/9j/4AAQSkZJRgABAQ==")).toBe(true);
    expect(isAcceptableAvatar("data:image/png;base64,iVBORw0KGgo=")).toBe(true);
    expect(isAcceptableAvatar("data:image/webp;base64,UklGRg==")).toBe(true);
    expect(isAcceptableAvatar("https://lh3.googleusercontent.com/a/photo=s96-c")).toBe(true);
  });

  it("refuses scripts, other types, plain http and anything too large", () => {
    expect(isAcceptableAvatar("javascript:alert(1)")).toBe(false);
    expect(isAcceptableAvatar("data:image/svg+xml;base64,PHN2Zz4=")).toBe(false);
    expect(isAcceptableAvatar("data:text/html;base64,PGgxPg==")).toBe(false);
    expect(isAcceptableAvatar("http://example.com/me.jpg")).toBe(false);
    expect(isAcceptableAvatar('https://example.com/"onerror=alert(1)')).toBe(false);
    expect(isAcceptableAvatar(`data:image/png;base64,${"A".repeat(AVATAR_MAX_CHARS)}`)).toBe(false);
    expect(isAcceptableAvatar(42)).toBe(false);
  });
});
