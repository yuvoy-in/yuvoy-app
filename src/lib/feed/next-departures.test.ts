import { describe, it, expect } from "vitest";
import {
  departureHref,
  departurePhrase,
  nextDeparturesOf,
} from "./next-departures";
import type { components } from "@/lib/api/schema.gen";

type Slot = components["schemas"]["Slot"];

/**
 * The panel's "Coming up" (the redesign, traveller A). The open-day rule is
 * `daysFromSlots`, tested there; these pin that the panel uses it per
 * departure, in reading order, against the server's clock, and how a
 * departure is named and linked.
 */

const NOW = Date.parse("2026-09-25T05:00:00Z"); // 10:30 IST, Fri 25 Sep

const slot = (over: Partial<Slot>): Slot =>
  ({
    id: "s",
    status: "open",
    soldOut: false,
    remainingDisplay: "Available",
    localDate: "2026-09-26",
    localStartTime: "07:30:00",
    ...over,
  }) as Slot;

describe("nextDeparturesOf", () => {
  it("lists open departures by day, then time, three at most", () => {
    const out = nextDeparturesOf(
      [
        slot({ id: "c", localDate: "2026-09-27", localStartTime: "09:00:00" }),
        slot({ id: "b", localDate: "2026-09-26", localStartTime: "15:00:00" }),
        slot({ id: "a", localDate: "2026-09-26", localStartTime: "07:00:00" }),
        slot({ id: "d", localDate: "2026-09-28", localStartTime: "07:00:00" }),
      ],
      NOW,
    );
    expect(out.map((d) => d.slotId)).toEqual(["a", "b", "c"]);
  });

  it("names today and tomorrow in words, and other days by date", () => {
    const out = nextDeparturesOf(
      [
        slot({
          id: "today",
          localDate: "2026-09-25",
          localStartTime: "16:00:00",
          bookingCutoffAt: "2026-09-25T09:30:00Z", // 15:00 IST, still ahead
        }),
        slot({ id: "tomorrow", localDate: "2026-09-26" }),
        slot({ id: "sunday", localDate: "2026-09-27" }),
      ],
      NOW,
    );
    expect(out.map((d) => d.day)).toEqual(["Today", "Tomorrow", "Sun, 27 Sep"]);
    expect(out[0].time).toBe("16:00");
  });

  it("never offers what checkout would refuse: full, closed, past cutoff", () => {
    const out = nextDeparturesOf(
      [
        slot({ id: "full", soldOut: true, remainingDisplay: "Full" }),
        slot({ id: "closed", status: "closed", localStartTime: "08:00:00" }),
        slot({
          id: "late",
          localDate: "2026-09-25",
          localStartTime: "11:00:00",
          bookingCutoffAt: "2026-09-25T04:30:00Z", // 10:00 IST, already gone
        }),
        slot({ id: "open", localStartTime: "09:00:00" }),
      ],
      NOW,
    );
    expect(out.map((d) => d.slotId)).toEqual(["open"]);
  });

  it("prints the server's seat sentence, or nothing", () => {
    const out = nextDeparturesOf(
      [
        slot({ id: "a", remainingDisplay: "3 seats left" }),
        slot({
          id: "b",
          localStartTime: "09:00:00",
          remainingDisplay: undefined,
        }),
      ],
      NOW,
    );
    expect(out.map((d) => d.seats)).toEqual(["3 seats left", null]);
  });

  it("is empty when nothing is open, or the read carried no slots", () => {
    expect(nextDeparturesOf([], NOW)).toEqual([]);
    expect(nextDeparturesOf(undefined, NOW)).toEqual([]);
    expect(nextDeparturesOf([slot({ soldOut: true })], NOW)).toEqual([]);
  });

  it("skips a day it cannot read rather than printing it raw", () => {
    const out = nextDeparturesOf([slot({ localDate: "not-a-date" })], NOW);
    expect(out).toEqual([]);
  });
});

describe("departureHref", () => {
  it("opens checkout on the departure, by the parameters checkout reads", () => {
    const [d] = nextDeparturesOf([slot({ id: "slot_9" })], NOW);
    expect(departureHref("try-dive", d)).toBe(
      "/e/try-dive/book?date=2026-09-26&slot=slot_9",
    );
  });
});

describe("departurePhrase", () => {
  it("reads naturally after Book or Ask for", () => {
    const [today, tomorrow, later] = nextDeparturesOf(
      [
        slot({ id: "t", localDate: "2026-09-25", localStartTime: "16:00:00" }),
        slot({ id: "m", localDate: "2026-09-26", localStartTime: "07:00:00" }),
        slot({ id: "l", localDate: "2026-09-29", localStartTime: "11:30:00" }),
      ],
      NOW,
    );
    expect(departurePhrase(today)).toBe("today at 16:00");
    expect(departurePhrase(tomorrow)).toBe("tomorrow at 07:00");
    expect(departurePhrase(later)).toBe("Tue, 29 Sep at 11:30");
  });
});
