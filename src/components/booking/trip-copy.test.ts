import { describe, expect, it } from "vitest";
import { declineView, moneyRowLabel, tripWhen } from "./trip-copy";
import type { components } from "@/lib/api/schema.gen";

type BookingStatus = components["schemas"]["BookingStatus"];

/*
  `declineView`: a request the operator turned down, as the page says it
  (yuvoy-api#225). The screen tests cover the render; these cover the edges.
*/

function status(over: Partial<BookingStatus>): BookingStatus {
  return {
    reservationId: "res_1",
    state: "released",
    final: true,
    guests: 3,
    experience: { slug: "reef dive", title: "Reef dive" },
    slot: { startsAt: "2026-09-20T03:30:00Z", timezone: "Asia/Kolkata" },
    ...over,
  } as BookingStatus;
}

const NEXT = {
  date: "2026-09-24",
  startsAt: "2026-09-24T03:30:00Z",
  timezone: "Asia/Kolkata",
  bookUrl: "https://yuvoy.in/e/reef-dive",
};

describe("declineView", () => {
  it("is null without the API's sentence, whatever the code says", () => {
    expect(declineView(status({}))).toBeNull();
    expect(
      declineView(status({ cancellation: { reasonCode: "no_capacity" } })),
    ).toBeNull();
    expect(
      declineView(
        status({ cancellation: { reasonCode: "no_capacity", message: "  " } }),
      ),
    ).toBeNull();
  });

  it("encodes the slug and carries the party size", () => {
    const view = declineView(
      status({
        cancellation: {
          reasonCode: "no_capacity",
          message:
            "The operator is full on that departure. Nothing was charged.",
          nextDeparture: NEXT,
        },
      }),
    );
    expect(view?.next?.href).toBe(
      "/e/reef%20dive/book?date=2026-09-24&guests=3",
    );
    expect(view?.otherDates).toBe("/e/reef%20dive/book");
  });

  it("offers no date without a listing to book it on", () => {
    const view = declineView(
      status({
        experience: { title: "Reef dive" } as BookingStatus["experience"],
        cancellation: {
          reasonCode: "weather",
          message: "x.",
          nextDeparture: NEXT,
        },
      }),
    );
    expect(view?.next).toBeNull();
    expect(view?.otherDates).toBeNull();
  });

  it("says the market day without a time when the zone cannot be read", () => {
    const view = declineView(
      status({
        cancellation: {
          reasonCode: "weather",
          message: "x.",
          nextDeparture: { ...NEXT, timezone: "Not/AZone" },
        },
      }),
    );
    expect(view?.next?.when).toBe("Thu, 24 Sep");
  });

  it("offers nothing for a date that is not a date", () => {
    const view = declineView(
      status({
        cancellation: {
          reasonCode: "weather",
          message: "x.",
          nextDeparture: { ...NEXT, date: "next week" },
        },
      }),
    );
    expect(view?.next).toBeNull();
  });
});

describe("moneyRowLabel", () => {
  const cash = (collected: boolean) =>
    ({ method: "cash", collected, amountPaise: 900000 }) as const;

  it("claims no payment where nothing has been charged", () => {
    // Both said "Paid" in production (cited 3 Oct 2026).
    expect(moneyRowLabel({ state: "awaiting_operator" })).toBe(
      "If they say yes",
    );
    expect(moneyRowLabel({ state: "holding" })).toBe("To pay");
    expect(moneyRowLabel({ state: "expired" })).toBe("Not charged");
    expect(moneyRowLabel({ state: "released" })).toBe("Not charged");
  });

  it("claims nothing either way while money may be moving", () => {
    expect(moneyRowLabel({ state: "verifying" })).toBe("Amount");
  });

  it("says what a cash booking owes, and only while the trip is on", () => {
    expect(moneyRowLabel({ state: "confirmed", payment: cash(false) })).toBe(
      "To pay on the day",
    );
    expect(moneyRowLabel({ state: "confirmed", payment: cash(true) })).toBe(
      "Paid in cash",
    );
    // Gone ahead and nobody recorded the cash: neither owed nor paid.
    expect(moneyRowLabel({ state: "completed", payment: cash(false) })).toBe(
      "Total",
    );
    for (const state of ["cancelled", "no_show"] as const) {
      expect(moneyRowLabel({ state, payment: cash(false) }), state).toBe(
        "Not charged",
      );
    }
  });

  it("says Paid for a card booking, whose money moved when it was made", () => {
    for (const state of [
      "confirmed",
      "completed",
      "cancelled",
      "declined",
      "no_show",
    ] as const) {
      expect(moneyRowLabel({ state }), state).toBe("Paid");
    }
  });

  it("claims nothing for a state this build does not know", () => {
    expect(moneyRowLabel({ state: "rebooked" as BookingStatus["state"] })).toBe(
      "Total",
    );
  });
});

describe("tripWhen", () => {
  const IST = "Asia/Kolkata";
  // 10:00 IST on Thursday 15 October 2026.
  const NOW = Date.parse("2026-10-15T04:30:00Z");

  it("says today and tomorrow in words, with the hour", () => {
    expect(
      tripWhen({ startsAt: "2026-10-15T10:00:00Z", timezone: IST }, NOW),
    ).toBe("Today, 15:30");
    expect(
      tripWhen({ startsAt: "2026-10-16T01:30:00Z", timezone: IST }, NOW),
    ).toBe("Tomorrow, 07:00");
  });

  it("names the day further out", () => {
    expect(
      tripWhen({ startsAt: "2026-10-17T01:30:00Z", timezone: IST }, NOW),
    ).toBe("Sat, 17 Oct, 07:00");
  });

  it("reads both days in the trip's zone, not the device's", () => {
    // 23:30 UTC on the 15th is 05:00 IST on the 16th: tomorrow, in Havelock.
    expect(
      tripWhen({ startsAt: "2026-10-15T23:30:00Z", timezone: IST }, NOW),
    ).toBe("Tomorrow, 05:00");
  });

  it("is null for a zone it cannot read, so the page keeps its words", () => {
    expect(
      tripWhen(
        { startsAt: "2026-10-16T01:30:00Z", timezone: "Nowhere/Atlantis" },
        NOW,
      ),
    ).toBeNull();
  });
});
