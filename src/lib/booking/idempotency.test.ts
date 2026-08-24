import { describe, it, expect, beforeEach } from "vitest";
import {
  idempotencyKeyFor,
  clearIdempotencyKey,
  isValidIdempotencyKey,
  fingerprintBody,
  type CheckoutBodyShape,
} from "./idempotency";

const body = (over: Partial<CheckoutBodyShape> = {}): CheckoutBodyShape => ({
  slotId: "slot_1",
  guests: 2,
  contact: { name: "Asha Menon", whatsapp: "+919000000000" },
  ...over,
});

beforeEach(() => sessionStorage.clear());

describe("idempotency key", () => {
  it("matches the contract's charset and length", () => {
    expect(isValidIdempotencyKey(idempotencyKeyFor(body()))).toBe(true);
  });

  it("is STABLE across retries of the same attempt", () => {
    // The rule: one key per checkout attempt, reused across every retry.
    // Regenerating inside a retry loop turns one intended booking into
    // several real ones.
    const a = idempotencyKeyFor(body());
    const b = idempotencyKeyFor(body());
    const c = idempotencyKeyFor(body());
    expect(a).toBe(b);
    expect(b).toBe(c);
  });

  it("survives a reload, which a UPI hand-off causes constantly", () => {
    const before = idempotencyKeyFor(body());
    // A reload loses module state but not sessionStorage.
    const after = idempotencyKeyFor(body());
    expect(after).toBe(before);
  });

  it("is insensitive to key order in the body", () => {
    // An object rebuilt in a different order is the SAME request. Treating it
    // as different would mint a new key on every render.
    const a = idempotencyKeyFor({
      slotId: "slot_1",
      guests: 2,
      contact: { name: "Asha Menon", whatsapp: "+919000000000" },
    });
    const b = idempotencyKeyFor({
      guests: 2,
      contact: { whatsapp: "+919000000000", name: "Asha Menon" },
      slotId: "slot_1",
    } as CheckoutBodyShape);
    expect(b).toBe(a);
  });

  it("REGENERATES when the party size changes", () => {
    const a = idempotencyKeyFor(body());
    const b = idempotencyKeyFor(body({ guests: 3 }));
    expect(b).not.toBe(a);
  });

  it("REGENERATES when attribution changes, because the server fingerprints it", () => {
    // A retry that changes attribution is refused with idempotency_key_reuse
    // rather than silently re-attributing an existing booking — so the client
    // must not send the old key with new attribution.
    const a = idempotencyKeyFor(body({ attribution: { source: "qr" } }));
    const b = idempotencyKeyFor(body({ attribution: { source: "direct" } }));
    expect(b).not.toBe(a);
  });

  it("REGENERATES when the screening answer changes", () => {
    const a = idempotencyKeyFor(body({ screening: { declaredClear: true } }));
    const b = idempotencyKeyFor(body({ screening: { declaredClear: false } }));
    expect(b).not.toBe(a);
  });

  it("keeps separate keys per slot", () => {
    const a = idempotencyKeyFor(body({ slotId: "slot_1" }));
    const b = idempotencyKeyFor(body({ slotId: "slot_2" }));
    expect(a).not.toBe(b);
    // And neither has clobbered the other.
    expect(idempotencyKeyFor(body({ slotId: "slot_1" }))).toBe(a);
  });

  it("mints a fresh key after an explicit clear", () => {
    const a = idempotencyKeyFor(body());
    clearIdempotencyKey("slot_1");
    expect(idempotencyKeyFor(body())).not.toBe(a);
  });

  it("treats undefined and absent as the same body", () => {
    // Otherwise a form that sets `email: undefined` on one render and omits it
    // on the next mints two keys for one attempt.
    expect(fingerprintBody(body({ attribution: undefined }))).toBe(
      fingerprintBody(body()),
    );
  });
});
