import { describe, it, expect } from "vitest";
import {
  monthGrid,
  monthLabel,
  shiftMonth,
  daysBetween,
  canStepMonth,
  monthStart,
  MAX_DAYS_AHEAD,
} from "./month-grid";

const TODAY = "2026-09-14";

/**
 * The inline month calendar's arithmetic (yuvoy-app#37 item 4).
 *
 * Every rule here is a way a calendar goes wrong that looks plausible on the
 * one month somebody happens to test: a column shift that only shows on months
 * starting on a Sunday, an off-by-one at the window's edge, a February that is
 * 28 days in a leap year.
 */
describe("laying out a month", () => {
  it("starts the week on Monday", () => {
    /*
      1 September 2026 is a Tuesday, so there is exactly one leading blank.
      `getUTCDay()` is Sunday-first; getting the conversion wrong shifts every
      date by a column, which looks like a working calendar for the wrong week.
    */
    const cells = monthGrid("2026-09-01", TODAY);
    expect(cells[0].date).toBeNull();
    expect(cells[1].date).toBe("2026-09-01");
  });

  it("puts no blanks in front of a month that starts on a Monday", () => {
    // 1 June 2026 is a Monday.
    expect(monthGrid("2026-06-01", "2026-06-01")[0].date).toBe("2026-06-01");
  });

  it("puts six blanks in front of a month that starts on a Sunday", () => {
    // 1 November 2026 is a Sunday: the last column of the first row.
    const cells = monthGrid("2026-11-01", "2026-11-01");
    expect(cells.slice(0, 6).every((c) => c.date === null)).toBe(true);
    expect(cells[6].date).toBe("2026-11-01");
  });

  it("emits every day of the month and no trailing blanks", () => {
    const cells = monthGrid("2026-09-01", TODAY).filter((c) => c.date);
    expect(cells).toHaveLength(30);
    expect(cells.at(-1)!.date).toBe("2026-09-30");
  });

  it("knows February in a leap year and in an ordinary one", () => {
    expect(
      monthGrid("2028-02-01", "2028-02-01").filter((c) => c.date),
    ).toHaveLength(29);
    expect(
      monthGrid("2027-02-01", "2027-02-01").filter((c) => c.date),
    ).toHaveLength(28);
  });
});

describe("which days can be chosen", () => {
  const cellFor = (date: string, today = TODAY) =>
    monthGrid(monthStart(date), today).find((c) => c.date === date)!;

  it("disables yesterday and enables today", () => {
    expect(cellFor("2026-09-13").disabled).toBe(true);
    expect(cellFor("2026-09-14").disabled).toBe(false);
  });

  it("enables the last day of the window and disables the one after", () => {
    /*
      89 days after today, from the issue. The two cells either side of a
      boundary are the whole test: an off-by-one here silently costs a
      traveller the last bookable day, or offers one the API refuses.
    */
    const last = "2026-12-12"; // 2026-09-14 + 89
    expect(daysBetween(TODAY, last)).toBe(MAX_DAYS_AHEAD);
    expect(cellFor(last).disabled).toBe(false);
    expect(cellFor("2026-12-13").disabled).toBe(true);
  });

  it("counts days across a month and a year boundary", () => {
    expect(daysBetween("2026-09-30", "2026-10-01")).toBe(1);
    expect(daysBetween("2026-12-31", "2027-01-01")).toBe(1);
    expect(daysBetween("2026-09-15", "2026-09-14")).toBe(-1);
  });
});

describe("stepping between months", () => {
  it("moves one month, and lands on the first", () => {
    expect(shiftMonth("2026-09-14", 1)).toBe("2026-10-01");
    expect(shiftMonth("2026-09-14", -1)).toBe("2026-08-01");
  });

  it("crosses a year in both directions", () => {
    expect(shiftMonth("2026-12-01", 1)).toBe("2027-01-01");
    expect(shiftMonth("2026-01-01", -1)).toBe("2025-12-01");
  });

  it("offers no way back past the month that holds today", () => {
    // August is entirely in the past on 14 September. Nothing to show.
    expect(canStepMonth("2026-09-01", -1, TODAY)).toBe(false);
    expect(canStepMonth("2026-10-01", -1, TODAY)).toBe(true);
  });

  it("offers no way forward past the end of the window", () => {
    // The window ends 12 December 2026, so January has nothing bookable.
    expect(canStepMonth("2026-12-01", 1, TODAY)).toBe(false);
    expect(canStepMonth("2026-11-01", 1, TODAY)).toBe(true);
  });

  it("still steps back within a month that has both past and future days", () => {
    /*
      The month holding today is half disabled and must still be reachable
      from October, or a traveller who steps forward cannot come back.
    */
    expect(canStepMonth("2026-10-01", -1, TODAY)).toBe(true);
  });
});

describe("naming a month", () => {
  it("gives the month and the year", () => {
    expect(monthLabel("2026-09-14")).toBe("September 2026");
    expect(monthLabel("2027-01-01")).toBe("January 2027");
  });
});
