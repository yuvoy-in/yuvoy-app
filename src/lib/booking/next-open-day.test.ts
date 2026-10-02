import { describe, it, expect } from "vitest";
import { nextOpenDayOf, nextOpenSentence } from "./next-open-day";
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
