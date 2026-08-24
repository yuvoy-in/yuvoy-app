import { describe, it, expect } from "vitest";
import { readTokenFromFragment, bookingUrl } from "./token-store";

/**
 * The IndexedDB half is exercised by the booking screen's own tests against a
 * fake store; these cover the fragment contract, which is where the token is
 * most easily mishandled.
 */
describe("readTokenFromFragment", () => {
  it("reads the token from a fragment", () => {
    expect(readTokenFromFragment("#t=abc123")).toBe("abc123");
  });

  it("reads it alongside other fragment parameters", () => {
    expect(readTokenFromFragment("#t=abc123&ref=YV-1")).toBe("abc123");
  });

  it("returns null when there is no token", () => {
    expect(readTokenFromFragment("#destinations")).toBeNull();
    expect(readTokenFromFragment("")).toBeNull();
    expect(readTokenFromFragment("#t=")).toBeNull();
  });

  it("decodes a token that was percent-encoded", () => {
    const token = "abc/123+xyz=";
    const url = bookingUrl(token);
    expect(readTokenFromFragment(url.slice(url.indexOf("#")))).toBe(token);
  });
});

describe("bookingUrl", () => {
  it("puts the token in the FRAGMENT, never a path or query", () => {
    // This API logs request URIs. A query string would be written to access
    // logs and leaked in a Referer header on the first subresource load.
    const url = bookingUrl("secret", "https://yuvoy.in");
    expect(url).toBe("https://yuvoy.in/booking#t=secret");
    expect(url.split("#")[0]).not.toContain("secret");
  });

  it("percent-encodes so a token cannot break out of the fragment", () => {
    expect(bookingUrl("a&b=c")).toBe("/booking#t=a%26b%3Dc");
  });
});
