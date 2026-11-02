import { describe, it, expect, afterEach, vi } from "vitest";
import {
  MAX_AGE_MS,
  clearTrigoCheckout,
  dropTrigoTotal,
  readTrigoCheckout,
  saveTrigoCheckout,
  trigoCheckoutFor,
  trigoCheckoutHref,
} from "./checkout-prefill";

/**
 * The checkout a Trigo book card opens (yuvoy-app#223 part 2): kept in the
 * tab only, read at the checkout's tap, and sent as the card's key and total
 * only while the departure and party are the card's.
 */

const ACTION = "2b7e4c1a-9d3f-4e5a-8b6c-7d8e9f0a1b2c";
const SLUG = "try-dive";
const NOW = Date.parse("2026-11-02T05:00:00Z");

const CHECKOUT = {
  experienceSlug: SLUG,
  slotId: "slot_a",
  localDate: "2026-11-07",
  guests: 2,
  expectTotalPaise: 900000,
  idempotencyKey: "trg_2b7e4c1a9d3f4e5a8b6c7d8e9f0a1b2c",
  mode: "allotment" as const,
};

afterEach(() => {
  vi.restoreAllMocks();
  sessionStorage.clear();
});

describe("trigoCheckoutHref", () => {
  it("opens the listing's checkout with the date, departure and party", () => {
    expect(trigoCheckoutHref(CHECKOUT)).toBe(
      "/e/try-dive/book?date=2026-11-07&slot=slot_a&guests=2",
    );
  });
});

describe("the prefill", () => {
  it("is kept in sessionStorage under the listing's slug", () => {
    saveTrigoCheckout(ACTION, CHECKOUT, NOW);
    const kept = sessionStorage.getItem(`yuvoy.trigo.checkout.${SLUG}`);
    expect(kept).not.toBeNull();
    expect(readTrigoCheckout(SLUG, NOW)).toMatchObject({
      ...CHECKOUT,
      actionId: ACTION,
      savedAt: NOW,
    });
    expect(readTrigoCheckout("another-listing", NOW)).toBeNull();
  });

  it("is dropped once it is older than a hold", () => {
    saveTrigoCheckout(ACTION, CHECKOUT, NOW);
    expect(readTrigoCheckout(SLUG, NOW + MAX_AGE_MS)).not.toBeNull();
    expect(readTrigoCheckout(SLUG, NOW + MAX_AGE_MS + 1)).toBeNull();
    expect(readTrigoCheckout(SLUG, NOW)).toBeNull();
  });

  it("ignores something else under its key", () => {
    sessionStorage.setItem(`yuvoy.trigo.checkout.${SLUG}`, "{not json");
    expect(readTrigoCheckout(SLUG, NOW)).toBeNull();
    sessionStorage.setItem(
      `yuvoy.trigo.checkout.${SLUG}`,
      JSON.stringify({ slotId: "slot_a" }),
    );
    expect(readTrigoCheckout(SLUG, NOW)).toBeNull();
  });

  it("is cleared after the reservation", () => {
    saveTrigoCheckout(ACTION, CHECKOUT, NOW);
    clearTrigoCheckout(SLUG);
    expect(readTrigoCheckout(SLUG, NOW)).toBeNull();
  });

  it("loses only its total after a price_moved refusal", () => {
    saveTrigoCheckout(ACTION, CHECKOUT, NOW);
    dropTrigoTotal(SLUG);
    const prefill = readTrigoCheckout(SLUG, NOW);
    expect(prefill?.expectTotalPaise).toBeUndefined();
    expect(prefill?.idempotencyKey).toBe(CHECKOUT.idempotencyKey);
  });

  it("never breaks the checkout when storage is refused", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("refused");
    });
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("refused");
    });
    expect(() => saveTrigoCheckout(ACTION, CHECKOUT, NOW)).not.toThrow();
    expect(readTrigoCheckout(SLUG, NOW)).toBeNull();
    expect(() => dropTrigoTotal(SLUG)).not.toThrow();
    expect(() => clearTrigoCheckout(SLUG)).not.toThrow();
    const parts = trigoCheckoutFor(SLUG, { slotId: "slot_a", guests: 2 }, NOW);
    expect(parts).toBeNull();
  });
});

describe("trigoCheckoutFor", () => {
  it("is null when the traveller did not come from a card", () => {
    const parts = trigoCheckoutFor(SLUG, { slotId: "slot_a", guests: 2 }, NOW);
    expect(parts).toBeNull();
  });

  it("sends the card's key, total and attribution for the card's party", () => {
    saveTrigoCheckout(ACTION, CHECKOUT, NOW);
    const parts = trigoCheckoutFor(SLUG, { slotId: "slot_a", guests: 2 }, NOW);
    expect(parts).toMatchObject({
      attribution: { placement: "trigo", campaign: ACTION },
      idempotencyKey: CHECKOUT.idempotencyKey,
      expectTotalPaise: 900000,
    });
  });

  it("keeps the attribution and drops the key when the party changes", () => {
    saveTrigoCheckout(ACTION, CHECKOUT, NOW);
    for (const body of [
      { slotId: "slot_a", guests: 3 },
      { slotId: "slot_b", guests: 2 },
    ]) {
      const parts = trigoCheckoutFor(SLUG, body, NOW);
      expect(parts?.attribution).toMatchObject({
        placement: "trigo",
        campaign: ACTION,
      });
      expect(parts?.idempotencyKey).toBeUndefined();
      expect(parts?.expectTotalPaise).toBeUndefined();
    }
  });

  it("sends the key without the total after a price_moved refusal", () => {
    saveTrigoCheckout(ACTION, CHECKOUT, NOW);
    dropTrigoTotal(SLUG);
    const parts = trigoCheckoutFor(SLUG, { slotId: "slot_a", guests: 2 }, NOW);
    expect(parts?.idempotencyKey).toBe(CHECKOUT.idempotencyKey);
    expect(parts && "expectTotalPaise" in parts).toBe(false);
  });
});
