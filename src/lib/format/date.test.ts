import { describe, it, expect } from "vitest";
import {
  civilFromDate,
  civilInZone,
  civilHere,
  weekdayName,
  monthName,
  dayMonth,
  weekdayDayMonth,
  clockTime,
  MONTH_SHORT,
  WEEKDAY_SHORT,
} from "./date";

/**
 * The strings are pinned EXACTLY, and that is the whole point of the file.
 *
 * A test that asserted "contains Sep" would pass against the defect this
 * module exists to remove, because the defect is one character. So every
 * expectation here is a literal, and the September cases are the ones that
 * would have caught yuvoy-app#67 in the first place.
 */

describe("the month table is the abbreviation, never the locale's", () => {
  it("spells September with three letters", () => {
    /*
      The single character that shipped a hydration mismatch. `en-IN` and
      `en-GB` abbreviate September to "Sept" in node and Chromium and to "Sep"
      in WebKit; every other month is three letters everywhere. Pinned as a
      literal so no table edit can quietly reintroduce it.
    */
    expect(MONTH_SHORT[8]).toBe("Sep");
    expect(monthName({ ...noon, month: 9 })).toBe("Sep");
  });

  it("has twelve months and seven weekdays, each three letters", () => {
    expect(MONTH_SHORT).toHaveLength(12);
    expect(WEEKDAY_SHORT).toHaveLength(7);
    for (const name of [...MONTH_SHORT, ...WEEKDAY_SHORT]) {
      expect(name).toHaveLength(3);
    }
  });
});

const noon = civilFromDate("2026-09-16")!;

describe("civilFromDate", () => {
  it("reads a market date without converting anything", () => {
    expect(noon).toEqual({
      year: 2026,
      month: 9,
      day: 16,
      hour: 0,
      minute: 0,
      weekday: 3,
    });
    expect(weekdayDayMonth(noon)).toBe("Wed, 16 Sep");
    expect(dayMonth(noon)).toBe("16 Sep");
    expect(weekdayName(noon)).toBe("Wed");
  });

  it("names the right weekday at both ends of a year and across a leap day", () => {
    expect(weekdayDayMonth(civilFromDate("2026-01-01")!)).toBe("Thu, 1 Jan");
    expect(weekdayDayMonth(civilFromDate("2026-12-31")!)).toBe("Thu, 31 Dec");
    expect(weekdayDayMonth(civilFromDate("2028-02-29")!)).toBe("Tue, 29 Feb");
    expect(weekdayDayMonth(civilFromDate("2028-03-01")!)).toBe("Wed, 1 Mar");
  });

  it("refuses anything that is not a plain market date", () => {
    /*
      Each of these is a real shape an API or a fixture has produced, and each
      would otherwise render as a word salad or as "Invalid Date" on a card.
    */
    for (const bad of [
      "",
      "2026-9-16",
      "16/09/2026",
      "2026-09-16T06:30:00Z",
      "2026-13-01",
      "2026-00-10",
      "2026-09-00",
      "2026-09-32",
      "not a date",
    ]) {
      expect(civilFromDate(bad), bad).toBeNull();
    }
  });
});

describe("civilInZone", () => {
  it("puts an instant in the market's day, not the runtime's", () => {
    // 01:30 UTC is already 07:00 the same morning in Kolkata.
    const civil = civilInZone("2026-09-16T01:30:00Z", "Asia/Kolkata")!;
    expect(weekdayDayMonth(civil)).toBe("Wed, 16 Sep");
    expect(clockTime(civil)).toBe("07:00");
  });

  it("crosses the date line the market is on, in both directions", () => {
    // 19:00 UTC on the 16th is 00:30 on the 17th in Kolkata: a different day,
    // a different weekday, and the case a naive UTC read gets wrong.
    const late = civilInZone("2026-09-16T19:00:00Z", "Asia/Kolkata")!;
    expect(weekdayDayMonth(late)).toBe("Thu, 17 Sep");
    expect(clockTime(late)).toBe("00:30");

    // And the same instant a long way west is still the 16th.
    const west = civilInZone("2026-09-16T19:00:00Z", "America/New_York")!;
    expect(weekdayDayMonth(west)).toBe("Wed, 16 Sep");
    expect(clockTime(west)).toBe("15:00");
  });

  it("renders midnight as 00:00 rather than 24:00", () => {
    /*
      `hour12: false` is specified loosely enough that engines have disagreed
      here, which is why the module asks for `hourCycle: "h23"`. 18:30 UTC is
      exactly midnight in Kolkata.
    */
    const civil = civilInZone("2026-09-16T18:30:00Z", "Asia/Kolkata")!;
    expect(clockTime(civil)).toBe("00:00");
    expect(civil.day).toBe(17);
  });

  it("answers null rather than throwing on an unknown zone", () => {
    /*
      An unknown IANA zone throws inside `Intl`. A booking page must not go
      down over a timestamp, so this is caught and the caller drops the line.
    */
    expect(civilInZone("2026-09-16T01:30:00Z", "Mars/Olympus")).toBeNull();
    expect(civilInZone("2026-09-16T01:30:00Z", "")).toBeNull();
  });

  it("answers null on an unreadable instant", () => {
    expect(civilInZone("not an instant", "Asia/Kolkata")).toBeNull();
    expect(civilInZone("", "Asia/Kolkata")).toBeNull();
  });
});

describe("civilHere", () => {
  it("reads the runtime's own zone, with no Intl in the path", () => {
    const iso = "2026-09-16T01:30:00Z";
    const at = new Date(iso);
    const civil = civilHere(iso)!;
    expect(civil.year).toBe(at.getFullYear());
    expect(civil.month).toBe(at.getMonth() + 1);
    expect(civil.day).toBe(at.getDate());
    expect(civil.weekday).toBe(at.getDay());
    expect(clockTime(civil)).toBe(
      `${String(at.getHours()).padStart(2, "0")}:${String(at.getMinutes()).padStart(2, "0")}`,
    );
  });

  it("answers null on an unreadable instant", () => {
    expect(civilHere("nope")).toBeNull();
  });
});

describe("clockTime", () => {
  it("pads both halves", () => {
    expect(clockTime({ ...noon, hour: 7, minute: 5 })).toBe("07:05");
    expect(clockTime({ ...noon, hour: 0, minute: 0 })).toBe("00:00");
    expect(clockTime({ ...noon, hour: 23, minute: 59 })).toBe("23:59");
  });
});
