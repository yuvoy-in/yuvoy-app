import { describe, it, expect } from "vitest";
import {
  invitedTripTab,
  tripPriceLine,
  partyLine,
  sortForTab,
  withinDateFilter,
  unreadLine,
  anyUnread,
} from "./tabs";

const TODAY = "2026-09-14";

/**
 * Which tab a trip lands in, and what it says about money (yuvoy-app#38).
 *
 * The API decides the tab for a trip the traveller BOOKED. An invited trip is
 * not paged and carries no tab, so the client places it, and a guest's trip in
 * the wrong tab is a trip they cannot find.
 *
 * The price line is five ordered rules, and one of them exists because the
 * wrong order shipped to production once already.
 */
describe("placing an invited trip", () => {
  const trip = (status: string, localDate: string) =>
    ({ status, localDate }) as Parameters<typeof invitedTripTab>[0];

  it("puts a cancelled or called-off trip in Cancelled, whatever its date", () => {
    /*
      The status wins over the date, the same way the API decides a booking's
      tab. A trip that is not happening is not "upcoming" however soon it was
      going to be.
    */
    expect(invitedTripTab(trip("cancelled", "2026-09-20"), TODAY)).toBe(
      "cancelled",
    );
    expect(invitedTripTab(trip("called_off", "2026-09-20"), TODAY)).toBe(
      "cancelled",
    );
    expect(invitedTripTab(trip("cancelled", "2026-01-01"), TODAY)).toBe(
      "cancelled",
    );
  });

  it("puts a completed trip in Past", () => {
    expect(invitedTripTab(trip("completed", "2026-09-01"), TODAY)).toBe("past");
  });

  it("puts today's trip in Upcoming, not Past", () => {
    // A dive at 06:30 today is upcoming at 05:00 and still today's trip at 19:00.
    expect(invitedTripTab(trip("confirmed", TODAY), TODAY)).toBe("upcoming");
  });

  it("moves a pending trip whose date has passed to Past", () => {
    /*
      The case a status-only mapping gets wrong. An operator who never answers
      leaves a request `pending` indefinitely, and it would sit in Upcoming
      forever, above trips that are actually happening.
    */
    expect(invitedTripTab(trip("pending", "2026-09-01"), TODAY)).toBe("past");
    expect(invitedTripTab(trip("confirmed", "2026-09-01"), TODAY)).toBe("past");
  });

  it("keeps a future pending trip in Upcoming", () => {
    expect(invitedTripTab(trip("pending", "2026-09-20"), TODAY)).toBe(
      "upcoming",
    );
  });
});

describe("what a trip card says about money", () => {
  const inr = (totalPaise: number) => ({ totalPaise, currency: "INR" });

  it("says nothing about money on a request nobody has answered", () => {
    /*
      No money has changed hands and none is owed until the operator says yes.
      A price here is a claim about a booking that does not exist.
    */
    expect(
      tripPriceLine({ state: "pending_request", price: inr(900000) }),
    ).toBe("Waiting for the operator");
  });

  it("asks for the cash BEFORE it says paid", () => {
    /*
      The live defect this ordering exists to prevent. `GET /bookings/status`
      reports a cash booking as `confirmed` (D-034, yuvoy-api#168), so reading
      `state` alone showed "Paid ₹9,000" to travellers who had handed over
      nothing. This card is the second surface the same mistake was available
      on.
    */
    expect(
      tripPriceLine({
        state: "confirmed",
        price: inr(900000),
        payment: { method: "cash", collected: false, amountPaise: 900000 },
      }),
    ).toBe("Pay ₹9,000 cash on the day");
  });

  it("says paid once the operator has taken the cash", () => {
    expect(
      tripPriceLine({
        state: "confirmed",
        price: inr(900000),
        payment: { method: "cash", collected: true, amountPaise: 900000 },
      }),
    ).toBe("Paid ₹9,000");
  });

  it("treats a missing `collected` as NOT collected", () => {
    /*
      Absent is not false in general, but here the safe reading is the one that
      asks a traveller to bring money they may already owe rather than telling
      them a debt is settled. `collected !== true`, not `=== false`.
    */
    expect(
      tripPriceLine({
        state: "confirmed",
        price: inr(900000),
        payment: { method: "cash", amountPaise: 900000 } as never,
      }),
    ).toBe("Pay ₹9,000 cash on the day");
  });

  it("never prints NaN when an amount is missing", () => {
    /*
      The contract makes these required and the guard exists anyway: a pinned
      contract says what an API WILL send, never what it does send today. This
      fixture is how it was found, and "Pay ₹NaN cash on the day" is worse than
      any sentence without a number in it.
    */
    const noAmount = tripPriceLine({
      state: "confirmed",
      payment: { method: "cash", collected: false } as never,
    });
    expect(noAmount).toBe("Pay the operator on the day");
    expect(noAmount).not.toContain("NaN");

    const noRefundAmount = tripPriceLine({
      state: "cancelled",
      refund: { state: "processed" } as never,
    });
    expect(noRefundAmount).toBe("A refund is on its way");

    // And it falls back to the price when only the payment's amount is missing.
    expect(
      tripPriceLine({
        state: "confirmed",
        price: inr(450000),
        payment: { method: "cash", collected: false } as never,
      }),
    ).toBe("Pay ₹4,500 cash on the day");
  });

  it("puts a refund ahead of the paid line, and distinguishes done from on its way", () => {
    expect(
      tripPriceLine({
        state: "cancelled",
        price: inr(900000),
        refund: { amountPaise: 450000, state: "processed" },
      }),
    ).toBe("Refunded ₹4,500");

    for (const state of ["requested", "pending", "failed", "reversed"]) {
      expect(
        tripPriceLine({
          state: "cancelled",
          price: inr(900000),
          refund: { amountPaise: 450000, state },
        }),
        state,
      ).toBe("Refund of ₹4,500 on its way");
    }
  });

  it("says nothing on a cancelled trip with no refund", () => {
    /*
      Rather than "Paid". There is nothing to tell them, and a paid line beside
      a Cancelled chip reads as money lost.
    */
    expect(
      tripPriceLine({ state: "cancelled", price: inr(900000) }),
    ).toBeNull();
    expect(tripPriceLine({ state: "declined", price: inr(900000) })).toBeNull();
  });

  it("says paid for an ordinary online booking", () => {
    expect(
      tripPriceLine({
        state: "confirmed",
        price: inr(900000),
        payment: { method: "online", collected: true, amountPaise: 900000 },
      }),
    ).toBe("Paid ₹9,000");
  });

  it("says nothing rather than ₹0 when there is no price at all", () => {
    // `fromPrice` absent means "no price yet", never zero. Same rule here.
    expect(tripPriceLine({ state: "confirmed" })).toBeNull();
  });
});

describe("counting a party", () => {
  it("uses the singular for one", () => {
    expect(partyLine(1)).toBe("1 person");
    expect(partyLine(2)).toBe("2 people");
    expect(partyLine(0)).toBe("0 people");
  });
});

describe("saying a reply has arrived (yuvoy-api#207)", () => {
  it("counts in words, with the singular where it belongs", () => {
    expect(unreadLine(1)).toBe("1 new message");
    expect(unreadLine(3)).toBe("3 new messages");
  });

  it("says nothing when nothing is new", () => {
    expect(unreadLine(0)).toBeNull();
  });

  it("says nothing, rather than something false, for a field it cannot read", () => {
    /*
      The contract calls `unreadCount` required. It is read as optional here
      anyway: an API a deploy behind the document sends no such field, and the
      row must then say exactly what it said before the field existed.
    */
    expect(unreadLine(undefined)).toBeNull();
    expect(unreadLine(null)).toBeNull();
    expect(unreadLine("2")).toBeNull();
    expect(unreadLine(-1)).toBeNull();
    expect(unreadLine(1.5)).toBeNull();
    expect(unreadLine(Number.NaN)).toBeNull();
  });

  it("lights the dot for exactly the rows that draw a line", () => {
    expect(anyUnread([{ unreadCount: 0 }, { unreadCount: 2 }])).toBe(true);
    expect(anyUnread([{ unreadCount: 0 }, {}])).toBe(false);
    expect(anyUnread([])).toBe(false);
    expect(anyUnread(undefined)).toBe(false);
  });
});

describe("ordering within a tab", () => {
  const trips = [
    { localDate: "2026-09-20", localTime: "06:30" },
    { localDate: "2026-09-15", localTime: "09:00" },
    { localDate: "2026-09-15", localTime: "06:30" },
  ];

  it("puts the soonest first in Upcoming", () => {
    expect(
      sortForTab(trips, "upcoming").map((t) => `${t.localDate} ${t.localTime}`),
    ).toEqual(["2026-09-15 06:30", "2026-09-15 09:00", "2026-09-20 06:30"]);
  });

  it("puts the most recent first in Past and Cancelled", () => {
    for (const tab of ["past", "cancelled"] as const) {
      expect(sortForTab(trips, tab)[0].localDate, tab).toBe("2026-09-20");
    }
  });

  it("does not mutate its input", () => {
    const original = [...trips];
    sortForTab(trips, "upcoming");
    expect(trips).toEqual(original);
  });

  it("orders by date alone when a time is missing", () => {
    const out = sortForTab(
      [{ localDate: "2026-09-20" }, { localDate: "2026-09-15" }],
      "upcoming",
    );
    expect(out[0].localDate).toBe("2026-09-15");
  });
});

describe("the date filter", () => {
  it("includes both ends", () => {
    const range = { from: "2026-09-12", to: "2026-09-20" };
    expect(withinDateFilter("2026-09-12", range)).toBe(true);
    expect(withinDateFilter("2026-09-20", range)).toBe(true);
    expect(withinDateFilter("2026-09-11", range)).toBe(false);
    expect(withinDateFilter("2026-09-21", range)).toBe(false);
  });

  it("works with only one end set, and with neither", () => {
    expect(withinDateFilter("2026-09-11", { from: "2026-09-12" })).toBe(false);
    expect(withinDateFilter("2026-09-13", { from: "2026-09-12" })).toBe(true);
    expect(withinDateFilter("2026-09-21", { to: "2026-09-20" })).toBe(false);
    expect(withinDateFilter("2026-01-01", {})).toBe(true);
  });
});
