import { describe, it, expect, vi, afterEach } from "vitest";
import {
  CHECKOUT_WINDOW_DAYS,
  WINDOW_DAYS,
  marketDateRange,
  marketDays,
  marketDaysFrom,
  marketToday,
} from "./availability-window";

/**
 * The one place availability dates are computed.
 *
 * This module exists because the picker and checkout drifted apart twice, and
 * each time the symptom was two differently-keyed queries for the same data
 * that could disagree about a seat count across a single tap.
 */

afterEach(() => vi.useRealTimers());

/** 2026-08-18, 23:00 UTC — which is already the 19th in Asia/Kolkata. */
function freezeLateUtc() {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-08-18T23:00:00Z"));
}

describe("the availability window", () => {
  it("anchors on the MARKET's today, not the device's", () => {
    // A phone west of IST is otherwise a day behind and asks for a range that
    // has already started.
    freezeLateUtc();
    expect(marketToday()).toBe("2026-08-19");
  });

  /** How many calendar dates the range covers, counting both ends. */
  function inclusiveDays({ from, to }: { from: string; to: string }): number {
    const a = new Date(`${from}T00:00:00Z`).getTime();
    const b = new Date(`${to}T00:00:00Z`).getTime();
    return Math.round((b - a) / 86_400_000) + 1;
  }

  it("returns a range that starts today and covers exactly WINDOW_DAYS dates", () => {
    freezeLateUtc();
    const range = marketDateRange();
    expect(range.from).toBe("2026-08-19");
    // 19 Aug to 1 Sep is fourteen days, not fifteen. `to` lands a calendar day
    // before `from + days` because toISOString renders IST midnight as the
    // previous day in UTC — see the comment on marketDateRange. Asserted as a
    // COUNT so nobody "fixes" the slice and quietly asks for a day more than
    // the picker shows.
    expect(range.to).toBe("2026-09-01");
    expect(inclusiveDays(range)).toBe(WINDOW_DAYS);
  });

  it("gives checkout a WIDER window than the picker, deliberately", () => {
    // A `?slot=` URL survives a bookmark and can name a departure further out
    // than the picker ever showed. Fetching only the picker's window there
    // would answer a valid future slot with "no longer open".
    expect(CHECKOUT_WINDOW_DAYS).toBeGreaterThan(WINDOW_DAYS);

    freezeLateUtc();
    const range = marketDateRange(CHECKOUT_WINDOW_DAYS);
    expect(range).toEqual({ from: "2026-08-19", to: "2026-09-17" });
    expect(inclusiveDays(range)).toBe(CHECKOUT_WINDOW_DAYS);
  });

  it("lists consecutive market days, starting today", () => {
    freezeLateUtc();
    expect(marketDays(4)).toEqual([
      "2026-08-19",
      "2026-08-20",
      "2026-08-21",
      "2026-08-22",
    ]);
  });

  it("crosses a month boundary without arithmetic going wrong", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-30T06:00:00Z")); // 11:30 IST, the 30th
    expect(marketDays(3)).toEqual(["2026-08-30", "2026-08-31", "2026-09-01"]);
  });
});

describe("the day strip", () => {
  it("is consecutive and distinct across a daylight-saving change", () => {
    // Europe spring-forward was 29 March 2026. The old `setDate` arithmetic
    // ran in the DEVICE's zone and, under TZ=Europe/London, produced
    // `… 03-29 03-29 …` — one Sunday twice and no Monday. The arithmetic is
    // UTC now, so this holds whatever zone the test runs in.
    const days = marketDaysFrom("2026-03-27", 10);
    expect(days).toEqual([
      "2026-03-27",
      "2026-03-28",
      "2026-03-29",
      "2026-03-30",
      "2026-03-31",
      "2026-04-01",
      "2026-04-02",
      "2026-04-03",
      "2026-04-04",
      "2026-04-05",
    ]);
    expect(new Set(days).size).toBe(10);
  });

  it("crosses a month and a year end", () => {
    expect(marketDaysFrom("2026-12-30", 4)).toEqual([
      "2026-12-30",
      "2026-12-31",
      "2027-01-01",
      "2027-01-02",
    ]);
  });

  it("starts on the market's today", () => {
    expect(marketDays(3)[0]).toBe(marketToday());
    expect(marketDays(3)).toHaveLength(3);
  });
});
