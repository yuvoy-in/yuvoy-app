import { describe, it, expect } from "vitest";
import { nextOpenDayOf, nextOpenSentence, openDaysOf } from "./next-open-day";
import type { components } from "@/lib/api/schema.gen";

type Slot = components["schemas"]["Slot"];

/**
 * The listing bar's next open day (yuvoy-app#111), by checkout's own rule.
 * The rule itself is `daysFromSlots`, tested there; these pin that the bar
 * uses it, and what it says in each state.
 */

const NOW = Date.parse("2026-09-25T05:00:00Z"); // 10:30 IST, 25 Sep

const slot = (over: Partial<Slot>): Slot =>
  ({
    id: "s",
    status: "open",
    soldOut: false,
    remainingDisplay: "Available",
    localStartTime: "07:30:00",
    ...over,
  }) as Slot;

describe("nextOpenDayOf", () => {
  it("skips a departure whose cutoff has passed, as checkout does", () => {
    // The live shape on 25 Sep: this morning's dive closed at 03:30 IST, so
    // the first day a traveller could book is tomorrow.
    const next = nextOpenDayOf(
      [
        slot({
          localDate: "2026-09-25",
          bookingCutoffAt: "2026-09-24T22:00:00Z",
        }),
        slot({
          localDate: "2026-09-26",
          bookingCutoffAt: "2026-09-25T22:00:00Z",
        }),
      ],
      NOW,
    );
    expect(next).toEqual({ state: "open", date: "2026-09-26" });
  });

  it("skips a sold-out day and a closed departure", () => {
    const next = nextOpenDayOf(
      [
        slot({ localDate: "2026-09-26", soldOut: true }),
        slot({ localDate: "2026-09-27", status: "closed" }),
        slot({ localDate: "2026-09-28" }),
      ],
      NOW,
    );
    expect(next).toEqual({ state: "open", date: "2026-09-28" });
  });

  it("is none when nothing is open", () => {
    expect(nextOpenDayOf([], NOW)).toEqual({ state: "none" });
    expect(nextOpenDayOf(undefined, NOW)).toEqual({ state: "none" });
  });
});

describe("nextOpenSentence", () => {
  it("names the day the way the feed does", () => {
    expect(nextOpenSentence({ state: "open", date: "2026-09-26" })).toBe(
      "Next open: Sat, 26 Sep",
    );
  });

  it("states the window when nothing is open", () => {
    expect(nextOpenSentence({ state: "none" })).toBe(
      "No dates in the next 90 days",
    );
  });

  it("says nothing while asking, or after the read failed", () => {
    expect(nextOpenSentence({ state: "pending" })).toBeNull();
    expect(nextOpenSentence({ state: "error" })).toBeNull();
  });

  it("says nothing rather than echo a date it cannot read", () => {
    expect(nextOpenSentence({ state: "open", date: "soon" })).toBeNull();
  });
});

describe("openDaysOf", () => {
  // NOW is 10:30 IST on Friday 25 Sep.
  it("says today and tomorrow in words, and dates after that", () => {
    const open = openDaysOf(
      [
        slot({ localDate: "2026-09-25", localStartTime: "15:00:00" }),
        slot({ localDate: "2026-09-26" }),
        slot({ localDate: "2026-09-27" }),
      ],
      NOW,
    );
    expect(open).toEqual({
      state: "open",
      days: [
        expect.objectContaining({
          date: "2026-09-25",
          label: "Today, Fri 25 Sep",
          short: "Fri 25 Sep",
        }),
        expect.objectContaining({
          date: "2026-09-26",
          label: "Tomorrow, Sat 26 Sep",
          short: "Sat 26 Sep",
        }),
        expect.objectContaining({
          date: "2026-09-27",
          label: "Sun, 27 Sep",
          short: "Sun 27 Sep",
        }),
      ],
      more: false,
    });
  });

  it("lists by checkout's rule: no full day, no closed or past-cutoff one", () => {
    const open = openDaysOf(
      [
        // This morning's dive closed at 03:30 IST.
        slot({
          localDate: "2026-09-25",
          bookingCutoffAt: "2026-09-24T22:00:00Z",
        }),
        slot({ localDate: "2026-09-26", soldOut: true }),
        slot({ localDate: "2026-09-27", status: "closed" }),
        slot({ localDate: "2026-09-28", remainingDisplay: "Full" }),
        slot({ localDate: "2026-09-29" }),
      ],
      NOW,
    );
    expect(open.state === "open" && open.days.map((d) => d.date)).toEqual([
      "2026-09-29",
    ]);
  });

  it("stops at the count, in date order, and says there is more", () => {
    const open = openDaysOf(
      [
        "2026-10-02",
        "2026-09-27",
        "2026-09-30",
        "2026-09-28",
        "2026-10-01",
      ].map((localDate) => slot({ localDate })),
      NOW,
      4,
    );
    expect(open.state === "open" && open.days.map((d) => d.date)).toEqual([
      "2026-09-27",
      "2026-09-28",
      "2026-09-30",
      "2026-10-01",
    ]);
    expect(open.state === "open" && open.more).toBe(true);
  });

  it("is not 'more' when the count is exactly what there is", () => {
    const open = openDaysOf(
      ["2026-09-27", "2026-09-28"].map((localDate) => slot({ localDate })),
      NOW,
      2,
    );
    expect(open.state === "open" && open.more).toBe(false);
  });

  it("gives the seat sentence only when one departure is open that day", () => {
    const open = openDaysOf(
      [
        slot({ localDate: "2026-09-26", remainingDisplay: "3 seats left" }),
        slot({
          id: "a",
          localDate: "2026-09-27",
          remainingDisplay: "3 seats left",
        }),
        slot({
          id: "b",
          localDate: "2026-09-27",
          localStartTime: "11:00:00",
          remainingDisplay: "8 seats left",
        }),
        // Two departures, one of them full: the open one is unambiguous.
        slot({ id: "c", localDate: "2026-09-28", soldOut: true }),
        slot({
          id: "d",
          localDate: "2026-09-28",
          localStartTime: "11:00:00",
          remainingDisplay: "2 seats left",
        }),
      ],
      NOW,
    );
    expect(open.state === "open" && open.days.map((d) => d.seats)).toEqual([
      "3 seats left",
      null,
      "2 seats left",
    ]);
  });

  it("is none when nothing is open, and says nothing over a date it cannot read", () => {
    expect(openDaysOf([], NOW)).toEqual({ state: "none" });
    expect(openDaysOf(undefined, NOW)).toEqual({ state: "none" });
    expect(openDaysOf([slot({ localDate: "soon" })], NOW)).toEqual({
      state: "error",
    });
  });
});
