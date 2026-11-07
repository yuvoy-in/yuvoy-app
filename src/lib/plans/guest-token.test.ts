import { describe, it, expect, vi, afterEach } from "vitest";
import {
  guestTokenFromHash,
  isGuestKey,
  isGuestToken,
  isReplyNonce,
  newReplyNonce,
} from "./guest-token";

/**
 * The shapes the guest page and its route handlers check before anything is
 * sent (yuvoy-mobile#373). A token of the wrong shape is the "link not
 * working" state with no API call, so these are the lines that decide it.
 */

const TOKEN = `yp_${"A".repeat(40)}b-_`;
const KEY = `ypk_${"z".repeat(41)}9_`;

afterEach(() => vi.restoreAllMocks());

describe("the link token", () => {
  it("is yp_ and 43 base64url characters", () => {
    expect(isGuestToken(TOKEN)).toBe(true);
  });

  it("is refused one character short or long", () => {
    expect(isGuestToken(TOKEN.slice(0, -1))).toBe(false);
    expect(isGuestToken(`${TOKEN}A`)).toBe(false);
  });

  it("is refused with a character outside base64url", () => {
    expect(isGuestToken(`${TOKEN.slice(0, -1)}=`)).toBe(false);
    expect(isGuestToken(`${TOKEN.slice(0, -1)}/`)).toBe(false);
  });

  it("is refused with another prefix, a guest key included", () => {
    expect(isGuestToken(KEY)).toBe(false);
    expect(isGuestToken(`yq_${TOKEN.slice(3)}`)).toBe(false);
  });

  it("is refused when it is not a string at all", () => {
    expect(isGuestToken(undefined)).toBe(false);
    expect(isGuestToken(42)).toBe(false);
    expect(isGuestToken({ token: TOKEN })).toBe(false);
  });
});

describe("the token in the fragment", () => {
  it("is read after the #", () => {
    expect(guestTokenFromHash(`#${TOKEN}`)).toBe(TOKEN);
  });

  it("is nothing for an empty fragment, or none", () => {
    expect(guestTokenFromHash("")).toBeNull();
    expect(guestTokenFromHash("#")).toBeNull();
  });

  it("is nothing for a fragment that only contains a token", () => {
    expect(guestTokenFromHash(`#main${TOKEN}`)).toBeNull();
    expect(guestTokenFromHash(`#${TOKEN}&x=1`)).toBeNull();
    expect(guestTokenFromHash(`# ${TOKEN}`)).toBeNull();
  });
});

describe("the guest key", () => {
  it("is ypk_ and 43 base64url characters", () => {
    expect(isGuestKey(KEY)).toBe(true);
    expect(isGuestKey(KEY.slice(0, -1))).toBe(false);
    expect(isGuestKey(TOKEN)).toBe(false);
  });
});

describe("the first-reply nonce", () => {
  it("fits the contract's Idempotency-Key pattern", () => {
    const nonce = newReplyNonce();
    expect(nonce).toMatch(/^[A-Za-z0-9_-]{22,64}$/);
    expect(isReplyNonce(nonce)).toBe(true);
  });

  it("is different every time", () => {
    const seen = new Set(Array.from({ length: 50 }, () => newReplyNonce()));
    expect(seen.size).toBe(50);
  });

  it("comes from crypto.getRandomValues, never Math.random", () => {
    const random = vi.spyOn(Math, "random");
    const secure = vi.spyOn(crypto, "getRandomValues");
    newReplyNonce();
    expect(secure).toHaveBeenCalledTimes(1);
    expect(random).not.toHaveBeenCalled();
  });

  it("uses every byte's low six bits, so the edges of the alphabet appear", () => {
    vi.spyOn(crypto, "getRandomValues").mockImplementation((array) => {
      const bytes = array as unknown as Uint8Array;
      bytes.fill(0);
      bytes[0] = 63;
      bytes[1] = 255;
      bytes[2] = 62;
      return array;
    });
    expect(newReplyNonce()).toBe(`__-${"A".repeat(29)}`);
  });

  it("is refused outside 22 to 64 characters", () => {
    expect(isReplyNonce("a".repeat(21))).toBe(false);
    expect(isReplyNonce("a".repeat(22))).toBe(true);
    expect(isReplyNonce("a".repeat(64))).toBe(true);
    expect(isReplyNonce("a".repeat(65))).toBe(false);
    expect(isReplyNonce(`${"a".repeat(30)}.`)).toBe(false);
  });
});
