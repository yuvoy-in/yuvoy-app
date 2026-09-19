import { describe, it, expect } from "vitest";
import {
  readTokenFromFragment,
  bookingUrl,
  canonicalFragment,
} from "./token-store";

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

  /*
    The production defect, as a unit.

    Hard-load a booking link and Next's router remembers that URL, fragment
    included; every later client-side navigation back to /booking APPENDS its
    fragment instead of replacing it, and pushes `/booking#t=A#t=B` itself.

    `URLSearchParams` has no concept of `#`, so the old reader answered
    `A#t=B` — a token the server has never issued. It replied 401, the screen
    said "This link no longer opens anything", and the traveller was offered a
    replacement for a link that was fine. Tapping a trip in Trips did it.
  */
  it("reads the NEWEST token when the URL carries two fragments", () => {
    expect(readTokenFromFragment("#t=stale#t=fresh")).toBe("fresh");
  });

  it("never returns a token with a fragment delimiter inside it", () => {
    // The shape that reached the API as `Authorization: Bearer <token>`.
    expect(readTokenFromFragment("#t=stale#t=fresh")).not.toContain("#");
  });

  it("survives more than one appended fragment", () => {
    expect(readTokenFromFragment("#t=a#t=b#t=c")).toBe("c");
  });

  it("still reads other parameters beside the newest token", () => {
    expect(readTokenFromFragment("#t=stale#t=fresh&ref=YV-1")).toBe("fresh");
  });

  it("answers null when the newest fragment has no token", () => {
    expect(readTokenFromFragment("#t=stale#somewhere")).toBeNull();
  });
});

describe("canonicalFragment", () => {
  it("answers null when the fragment is already the one we wrote", () => {
    expect(canonicalFragment("#t=abc123")).toBeNull();
    expect(canonicalFragment("")).toBeNull();
  });

  it("collapses a doubled fragment to the newest token", () => {
    expect(canonicalFragment("#t=stale#t=fresh")).toBe("#t=fresh");
  });

  it("re-encodes, so the repaired link cannot break out of the fragment", () => {
    expect(canonicalFragment("#t=stale#t=a%26b%3Dc")).toBe("#t=a%26b%3Dc");
  });

  it("answers null rather than a tokenless fragment it cannot repair", () => {
    expect(canonicalFragment("#one#two")).toBeNull();
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
