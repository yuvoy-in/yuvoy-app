/**
 * The idempotency key lifecycle — the rule that costs real money if it is
 * wrong.
 *
 *   GENERATE   when the traveller ENTERS checkout for a slot.
 *              Not per render. Not per click. NEVER inside a retry loop.
 *   REUSE      across every retry of that attempt.
 *              same key + same body  -> the original 201, unchanged, with
 *                                       `Idempotent-Replay: true`. The client
 *                                       cannot tell it repeated itself, which
 *                                       is the entire point on this network.
 *   REGENERATE only when the body materially changes.
 *              same key + different body -> 409 idempotency_key_reuse.
 *   CLEAR      on success, or on explicit abandon.
 *
 * Persisted in sessionStorage so a reload — extremely common when a UPI app
 * takes over the screen — reuses the same key rather than minting a second
 * booking. sessionStorage, not localStorage: a key that outlives the tab would
 * be replayed against a stale body days later.
 *
 * `attribution` is part of the request body and therefore part of the server's
 * fingerprint, so it is part of ours too. A retry that changes it is refused
 * rather than silently re-attributing an existing booking.
 */

import type { components } from "@/lib/api/schema.gen";

/** The contract's own charset: 16-128 of A-Za-z0-9_.:- */
const KEY_PATTERN = /^[A-Za-z0-9_.:-]{16,128}$/;

export function isValidIdempotencyKey(key: string): boolean {
  return KEY_PATTERN.test(key);
}

function storageKey(slotId: string): string {
  return `yuvoy.idem.${slotId}`;
}

function randomSuffix(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(36).padStart(2, "0")).join("");
}

/**
 * Everything the server fingerprints. Changing any of it needs a new key.
 *
 * This is the contract's own ReservationInput, not a hand-written mirror — an
 * age band the contract does not know about is then a build failure rather
 * than a 409 on a traveller's phone.
 */
export type CheckoutBodyShape = components["schemas"]["ReservationInput"];

/**
 * A stable fingerprint of the request body.
 *
 * Key order must not matter — an object rebuilt in a different order is the
 * same request, and treating it as different would mint a new key on every
 * render and turn one intended booking into several real ones.
 */
export function fingerprintBody(body: CheckoutBodyShape): string {
  return stableStringify(body);
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => a.localeCompare(b));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(",")}}`;
}

interface StoredKey {
  key: string;
  fingerprint: string;
}

function read(slotId: string): StoredKey | null {
  try {
    const raw = sessionStorage.getItem(storageKey(slotId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredKey;
    return isValidIdempotencyKey(parsed.key) ? parsed : null;
  } catch {
    // Private browsing, quota, or corrupt JSON. A fresh key is correct and
    // safe here: the server refuses a duplicate body under a new key with
    // capacity accounting, and losing replay protection is better than
    // failing checkout outright.
    return null;
  }
}

function write(slotId: string, stored: StoredKey): void {
  try {
    sessionStorage.setItem(storageKey(slotId), JSON.stringify(stored));
  } catch {
    // Non-fatal — see above.
  }
}

/**
 * The key for this checkout attempt.
 *
 * Returns the SAME key for the same slot and the same body, across reloads
 * and retries. Returns a NEW key when the body has materially changed, because
 * replaying the old one would hand back a reservation the traveller never
 * asked for.
 */
export function idempotencyKeyFor(body: CheckoutBodyShape): string {
  const fingerprint = fingerprintBody(body);
  const existing = read(body.slotId);

  if (existing && existing.fingerprint === fingerprint) return existing.key;

  const key = `chk_${randomSuffix()}`.slice(0, 128);
  write(body.slotId, { key, fingerprint });
  return key;
}

/** Call on success, or when the traveller explicitly abandons. */
export function clearIdempotencyKey(slotId: string): void {
  try {
    sessionStorage.removeItem(storageKey(slotId));
  } catch {
    // Non-fatal.
  }
}
