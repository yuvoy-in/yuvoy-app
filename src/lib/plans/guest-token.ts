/**
 * The three secrets-shaped strings of a plan by link (yuvoy-mobile#373).
 *
 *   - The **link token**, `yp_` plus 43 characters, after the `#` of
 *     `/p/#<token>`. Whoever holds it can read the plan and reply, so it is
 *     the plan's front door. It lives in the fragment precisely so that no
 *     server, this one included, learns which plan a page load is for.
 *   - The **guest key**, `ypk_` plus 43, which the API hands back once, on a
 *     first reply. It is the guest's identity on that plan from then on, and
 *     page script never sees it: the route handlers keep it in an httpOnly
 *     cookie (`lib/plans/guest-route.ts`).
 *   - The **reply nonce**, sent as `Idempotency-Key` on a first reply, so a
 *     double tap or a retry after a dropped connection gives back the same
 *     guest instead of making a second one.
 *
 * The shapes are the contract's own patterns (`getPlanByLink` and friends in
 * `contracts/openapi.yaml`). Checking them here is not a security boundary,
 * the API checks them again, but it is what lets the page show the "this link
 * is not working" state with no request at all when the fragment is empty or
 * mangled, which is the issue's case 2.
 *
 * No Node import anywhere in this file: the guest page is a client component
 * and reaches it (`scripts/qa.mjs` rule 7).
 */

/** `^yp_[A-Za-z0-9_-]{43}$`: 256 bits of base64url after the prefix. */
const LINK_TOKEN = /^yp_[A-Za-z0-9_-]{43}$/;

/** `^ypk_[A-Za-z0-9_-]{43}$`, the same size as the token. */
const GUEST_KEY = /^ypk_[A-Za-z0-9_-]{43}$/;

/** The contract's `Idempotency-Key` pattern on `replyByLink`. */
const REPLY_NONCE = /^[A-Za-z0-9_-]{22,64}$/;

export function isGuestToken(value: unknown): value is string {
  return typeof value === "string" && LINK_TOKEN.test(value);
}

export function isGuestKey(value: unknown): value is string {
  return typeof value === "string" && GUEST_KEY.test(value);
}

export function isReplyNonce(value: unknown): value is string {
  return typeof value === "string" && REPLY_NONCE.test(value);
}

/**
 * The link token in a `location.hash`, or null when there is none or it is
 * not one.
 *
 * Exact, with nothing trimmed or decoded: every character of a token is
 * already safe in a URL, so a fragment that needs fixing is not a token, and
 * guessing at what was meant would send a request the API refuses anyway.
 */
export function guestTokenFromHash(hash: string): string | null {
  const value = hash.startsWith("#") ? hash.slice(1) : hash;
  return isGuestToken(value) ? value : null;
}

const BASE64URL =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

/** 32 characters, 192 bits: inside the contract's 22 to 64. */
const NONCE_LENGTH = 32;

/**
 * A fresh first-reply nonce, from `crypto.getRandomValues`.
 *
 * One per form, made when the form is, and reused for every send of that
 * form: the API returns the same guest and key for the same nonce and name
 * within ten minutes, which is the whole defence against a double tap. A new
 * one is made only when the API says "send again" (409 `conflict`, reason
 * `nonce`). Never `Math.random`, which is guessable, and the nonce is what
 * stands between a guessed value and somebody else's guest key.
 *
 * Each byte picks one of 64 characters with its low six bits. 256 is a
 * multiple of 64, so every character is equally likely.
 */
export function newReplyNonce(): string {
  const bytes = new Uint8Array(NONCE_LENGTH);
  crypto.getRandomValues(bytes);
  let nonce = "";
  for (const byte of bytes) nonce += BASE64URL[byte & 63];
  return nonce;
}
