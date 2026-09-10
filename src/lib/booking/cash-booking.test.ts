import { describe, it, expect } from "vitest";
import {
  readPayAtCounter,
  amountToBring,
  isBooked,
  type CashBooking,
} from "./cash-booking";

const offer = {
  available: true,
  confirmAt: "/v1/reservations/r_1/cash-booking",
};

describe("readPayAtCounter — yuvoy-app#29", () => {
  it("finds the offer on the `coming_soon` answer", () => {
    expect(
      readPayAtCounter({
        state: "coming_soon",
        message: "Card and UPI are opening shortly.",
        holdStillActive: true,
        payAtCounter: offer,
      }),
    ).toEqual({ confirmAt: offer.confirmAt });
  });

  it("finds it on the `ready` answer too, which is what production sends", () => {
    /*
      The correction on the issue, and the whole reason this is a presence
      test: "production has a provider configured, so it returns `ready`, not
      `coming_soon`. If you had branched on `state === 'coming_soon'` to decide
      whether to show the cash option, it would never have appeared."
    */
    expect(
      readPayAtCounter({
        state: "ready",
        orderId: "ord_1",
        providerOrderId: "p_1",
        provider: "mock",
        amountPaise: 1_000_000,
        currency: "INR",
        expiresAt: "2026-09-14T03:00:00Z",
        payAtCounter: offer,
      }),
    ).toEqual({ confirmAt: offer.confirmAt });
  });

  it("offers nothing when the field is absent — that is the off switch", () => {
    // "Do not offer cash if `payAtCounter` is absent from the payment-order
    // response. That is how this gets turned off when a processor goes live."
    expect(readPayAtCounter({ state: "coming_soon", message: "…" })).toBeNull();
  });

  it("treats `available: false` as no, and an absent flag as no", () => {
    expect(
      readPayAtCounter({ payAtCounter: { ...offer, available: false } }),
    ).toBeNull();
    expect(
      readPayAtCounter({ payAtCounter: { confirmAt: offer.confirmAt } }),
    ).toBeNull();
    /*
      Not `truthy` — exactly `true`. This gates whether somebody can commit
      money, and a stray string would otherwise read as permission.
    */
    expect(
      readPayAtCounter({ payAtCounter: { ...offer, available: "yes" } }),
    ).toBeNull();
  });

  it("refuses an offer with no usable path", () => {
    expect(readPayAtCounter({ payAtCounter: { available: true } })).toBeNull();
    expect(
      readPayAtCounter({ payAtCounter: { available: true, confirmAt: "  " } }),
    ).toBeNull();
  });

  it("survives every shape a transport can hand it", () => {
    for (const junk of [
      null,
      undefined,
      0,
      "",
      "ready",
      [],
      { payAtCounter: 1 },
    ]) {
      expect(readPayAtCounter(junk)).toBeNull();
    }
  });
});

describe("what the traveller brings", () => {
  const booking = (over: Partial<CashBooking> = {}): CashBooking =>
    ({
      bookingReference: "YV-8F3K2A",
      state: "paid_pending_ops",
      payAtCounterPaise: 1_000_000,
      currency: "INR",
      ...over,
    }) as CashBooking;

  it("reads `payAtCounterPaise`", () => {
    expect(amountToBring(booking())).toBe(1_000_000);
  });

  it("never reads a captured amount, which is zero forever on these", () => {
    /*
      "Do not read `capturedAmountPaise` for a cash booking. It is `0` and
      stays `0` forever — we never touch the money." A screen that read it
      would tell somebody to bring nothing.
    */
    const withCaptured = booking() as CashBooking & {
      capturedAmountPaise: number;
    };
    withCaptured.capturedAmountPaise = 0;
    expect(amountToBring(withCaptured)).toBe(1_000_000);
  });

  it("falls back to zero rather than NaN on a malformed amount", () => {
    expect(
      amountToBring(booking({ payAtCounterPaise: undefined as never })),
    ).toBe(0);
  });
});

describe("a retry is the same booking", () => {
  it("counts a reference as booked whichever status carried it", () => {
    /*
      `201` the first time, `200` if it was already confirmed — the second tap
      on ferry wifi. "Treat `200` and `201` identically in the UI."
    */
    expect(
      isBooked({
        bookingReference: "YV-8F3K2A",
        state: "paid_pending_ops",
        payAtCounterPaise: 1,
        currency: "INR",
      } as CashBooking),
    ).toBe(true);
  });

  it("is not booked without a reference to say out loud", () => {
    expect(isBooked({ bookingReference: "  " } as CashBooking)).toBe(false);
  });
});
