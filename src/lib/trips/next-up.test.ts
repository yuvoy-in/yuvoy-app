import { describe, it, expect } from "vitest";
import { nextUpTrip, untilPhrase } from "./next-up";
import type { ServerTrip } from "./tabs";

// 10:00 IST on Thursday 15 October 2026.
const NOW = Date.parse("2026-10-15T04:30:00Z");
const HOUR = 3_600_000;

const trip = (over: Partial<ServerTrip>): ServerTrip =>
  ({
    reference: "YV-1",
    reservationId: "res_1",
    experience: "Try-dive at Nemo Reef",
    state: "confirmed",
    startsAt: new Date(NOW + 5 * HOUR).toISOString(),
    timezone: "Asia/Kolkata",
    ...over,
  }) as ServerTrip;

describe("nextUpTrip", () => {
  it("is the soonest trip going ahead within the next day", () => {
    const soon = trip({
      reservationId: "soon",
      startsAt: new Date(NOW + 2 * HOUR).toISOString(),
    });
    const later = trip({
      reservationId: "later",
      startsAt: new Date(NOW + 9 * HOUR).toISOString(),
    });
    expect(nextUpTrip([later, soon], NOW)?.reservationId).toBe("soon");
  });

  it("counts a cash booking not yet settled as going ahead", () => {
    expect(
      nextUpTrip([trip({ state: "paid_pending_ops" })], NOW),
    ).not.toBeNull();
  });

  it("is nothing for a trip further out than a day: the list shows that one", () => {
    expect(
      nextUpTrip(
        [trip({ startsAt: new Date(NOW + 25 * HOUR).toISOString() })],
        NOW,
      ),
    ).toBeNull();
  });

  it("is nothing for a trip that has left, a request, or one called off", () => {
    expect(
      nextUpTrip(
        [
          trip({ startsAt: new Date(NOW - HOUR).toISOString() }),
          trip({ state: "pending_request" }),
          trip({ state: "cancelled" }),
          trip({ state: "declined" }),
        ],
        NOW,
      ),
    ).toBeNull();
  });

  it("ignores a departure it cannot read rather than guessing", () => {
    expect(nextUpTrip([trip({ startsAt: "soon" })], NOW)).toBeNull();
  });
});

describe("untilPhrase", () => {
  const at = (ms: number) => new Date(NOW + ms).toISOString();

  it("says minutes inside the hour, hours and minutes after", () => {
    expect(untilPhrase(at(40 * 60_000), NOW)).toBe("in 40 min");
    expect(untilPhrase(at(200 * 60_000), NOW)).toBe("in 3 h 20 min");
    expect(untilPhrase(at(3 * HOUR), NOW)).toBe("in 3 h");
  });

  it("drops the minutes past ten hours, where they are noise", () => {
    expect(untilPhrase(at(18 * HOUR + 25 * 60_000), NOW)).toBe("in 18 h");
  });

  it("is nothing once it has left, or for a time it cannot read", () => {
    expect(untilPhrase(at(-60_000), NOW)).toBeNull();
    expect(untilPhrase("soon", NOW)).toBeNull();
  });
});
