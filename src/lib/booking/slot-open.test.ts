import { describe, it, expect } from "vitest";
import { cutoffPassed, slotIsOpen } from "./slot-open";

const NOW = Date.parse("2026-08-22T01:00:00Z");

describe("the booking cutoff", () => {
  it("is passed once the instant is reached", () => {
    expect(cutoffPassed({ bookingCutoffAt: "2026-08-22T00:59:59Z" }, NOW)).toBe(
      true,
    );
    expect(cutoffPassed({ bookingCutoffAt: "2026-08-22T01:00:00Z" }, NOW)).toBe(
      true,
    );
    expect(cutoffPassed({ bookingCutoffAt: "2026-08-22T01:00:01Z" }, NOW)).toBe(
      false,
    );
  });

  it("does not exist for a slot that names none", () => {
    expect(cutoffPassed({}, NOW)).toBe(false);
    expect(cutoffPassed({ bookingCutoffAt: "not a date" }, NOW)).toBe(false);
  });

  it("closes an otherwise open slot", () => {
    // `status: open` is the server's word about the slot's state; the cutoff
    // is a clock, and the two have to be read together.
    expect(
      slotIsOpen(
        { status: "open", bookingCutoffAt: "2026-08-22T00:00:00Z" },
        NOW,
      ),
    ).toBe(false);
    expect(
      slotIsOpen(
        { status: "open", bookingCutoffAt: "2026-08-22T02:00:00Z" },
        NOW,
      ),
    ).toBe(true);
    expect(slotIsOpen({ status: "open", remainingDisplay: "Full" }, NOW)).toBe(
      false,
    );
    expect(slotIsOpen({ status: "closed" }, NOW)).toBe(false);
  });
});
