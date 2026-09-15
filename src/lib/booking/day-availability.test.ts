import { describe, it, expect } from "vitest";
import { daysFromSlots, firstOpenDay } from "./day-availability";
import type { components } from "@/lib/api/schema.gen";

type Slot = components["schemas"]["Slot"];

/**
 * What the checkout calendar draws on each square (yuvoy-app#62 item 3).
 *
 * Three states, not two, and the difference between the last two is the point:
 * "Full" and "nothing that day" are different sentences to a traveller, and
 * one of them means come back tomorrow.
 */

const NOW = new Date("2026-09-14T04:00:00Z").getTime();

const slot = (over: Partial<Slot> = {}): Slot =>
  ({
    id: "sl_1",
    startsAt: "2026-09-20T01:30:00Z",
    endsAt: "2026-09-20T04:30:00Z",
    marketTimezone: "Asia/Kolkata",
    localDate: "2026-09-20",
    localStartTime: "07:00:00",
    bookingCutoffAt: "2026-09-20T00:00:00Z",
    status: "open",
    bookingMode: "allotment",
    soldOut: false,
    maxPartySize: 8,
    price: { amountMinor: 450000, currency: "INR" },
    remainingDisplay: "Available",
    ...over,
  }) as Slot;

describe("day states", () => {
  it("opens a day that has one bookable departure, with its price", () => {
    const days = daysFromSlots([slot()], NOW);
    expect(days.get("2026-09-20")).toMatchObject({
      state: "open",
      from: { amountMinor: 450000, currency: "INR" },
    });
  });

  it("reads Full when every departure that day is sold out", () => {
    /*
      "Full" and "nothing" must not collapse into one grey square. A day with
      departures that are all taken tells a traveller this listing does run on
      Sundays and to try another one; an empty day tells them nothing.
    */
    const days = daysFromSlots(
      [
        slot({ id: "a", soldOut: true, remainingDisplay: "Full" }),
        slot({ id: "b", soldOut: true, remainingDisplay: "Full" }),
      ],
      NOW,
    );
    expect(days.get("2026-09-20")?.state).toBe("full");
    expect(days.get("2026-09-20")?.from).toBeNull();
  });

  it("closes a day whose only departure is past its cutoff", () => {
    /*
      The half that `soldOut` alone misses. A departure at 07:00 with a cutoff
      at 06:00 is `status: open` and not sold out, and the server refuses it
      with `cutoff_passed`. Offering it spends a whole checkout to be told no.
    */
    const days = daysFromSlots(
      [slot({ bookingCutoffAt: "2026-09-14T03:00:00Z" })],
      NOW,
    );
    expect(days.get("2026-09-20")?.state).toBe("full");
  });

  it("closes a day whose only departure is cancelled or closed", () => {
    for (const status of ["closed", "cancelled"] as const) {
      const days = daysFromSlots([slot({ status })], NOW);
      expect(days.get("2026-09-20")?.state, status).toBe("full");
    }
  });

  it("stays open when one of several departures is still bookable", () => {
    const days = daysFromSlots(
      [
        slot({ id: "a", soldOut: true, remainingDisplay: "Full" }),
        slot({ id: "b", localStartTime: "14:00:00" }),
      ],
      NOW,
    );
    expect(days.get("2026-09-20")?.state).toBe("open");
  });

  it("knows nothing about a day with no departures", () => {
    const days = daysFromSlots([slot()], NOW);
    expect(days.get("2026-09-21")).toBeUndefined();
  });
});

describe("the price on a square", () => {
  it("is the lowest among the OPEN departures", () => {
    // A cheap sold-out departure would otherwise advertise a price nobody can
    // have, which is the same class of untruth as a stale seat count.
    const days = daysFromSlots(
      [
        slot({
          id: "cheap",
          soldOut: true,
          remainingDisplay: "Full",
          price: { amountMinor: 100000, currency: "INR" },
        }),
        slot({
          id: "open",
          localStartTime: "14:00:00",
          price: { amountMinor: 450000, currency: "INR" },
        }),
      ],
      NOW,
    );
    expect(days.get("2026-09-20")?.from).toEqual({
      amountMinor: 450000,
      currency: "INR",
    });
  });

  it("takes the cheaper of two open departures", () => {
    const days = daysFromSlots(
      [
        slot({ id: "a", price: { amountMinor: 450000, currency: "INR" } }),
        slot({
          id: "b",
          localStartTime: "14:00:00",
          price: { amountMinor: 300000, currency: "INR" },
        }),
      ],
      NOW,
    );
    expect(days.get("2026-09-20")?.from?.amountMinor).toBe(300000);
  });

  it("never compares across currencies", () => {
    /*
      Comparing minor amounts across currencies makes ¥500 look dearer than
      £400. A market sells in one currency, so the first one wins and anything
      else is ignored rather than silently mixed.
    */
    const days = daysFromSlots(
      [
        slot({ id: "a", price: { amountMinor: 450000, currency: "INR" } }),
        slot({
          id: "b",
          localStartTime: "14:00:00",
          price: { amountMinor: 50, currency: "JPY" },
        }),
      ],
      NOW,
    );
    expect(days.get("2026-09-20")?.from).toEqual({
      amountMinor: 450000,
      currency: "INR",
    });
  });

  it("answers null rather than a zero price", () => {
    // This project removed a whole site for rendering a price that did not
    // exist. An absent price shows no price, never "₹0".
    const days = daysFromSlots([slot({ price: undefined })], NOW);
    expect(days.get("2026-09-20")?.state).toBe("open");
    expect(days.get("2026-09-20")?.from).toBeNull();
  });
});

describe("departure order", () => {
  it("sorts by the market's own start time", () => {
    const days = daysFromSlots(
      [
        slot({ id: "late", localStartTime: "14:00:00" }),
        slot({ id: "early", localStartTime: "06:30:00" }),
        slot({ id: "noon", localStartTime: "12:00:00" }),
      ],
      NOW,
    );
    expect(days.get("2026-09-20")?.slots.map((s) => s.id)).toEqual([
      "early",
      "noon",
      "late",
    ]);
  });
});

describe("where the calendar opens", () => {
  it("lands on the first day anything is open", () => {
    /*
      A calendar that opens on today for a listing whose next departure is five
      weeks out shows a month of grey and asks the traveller to work out that
      they should press the arrow.
    */
    const days = daysFromSlots(
      [
        slot({ id: "a", localDate: "2026-10-04" }),
        slot({ id: "b", localDate: "2026-09-28" }),
        slot({
          id: "full",
          localDate: "2026-09-20",
          soldOut: true,
          remainingDisplay: "Full",
        }),
      ],
      NOW,
    );
    // Not the 20th: it has departures but none can be taken.
    expect(firstOpenDay(days)).toBe("2026-09-28");
  });

  it("answers null when nothing at all is open", () => {
    const days = daysFromSlots(
      [slot({ soldOut: true, remainingDisplay: "Full" })],
      NOW,
    );
    expect(firstOpenDay(days)).toBeNull();
    expect(firstOpenDay(daysFromSlots([], NOW))).toBeNull();
    expect(firstOpenDay(daysFromSlots(undefined, NOW))).toBeNull();
  });
});
