import { marketToday } from "@/lib/booking/availability-window";

/**
 * The arithmetic behind the inline month calendar (yuvoy-app#37 item 4).
 *
 * Separated from the component because dates are where this kind of screen
 * goes wrong, and every rule here is checkable without rendering anything:
 * which cell a month starts on, which days are outside the bookable window,
 * and what happens at the two edges of a year.
 *
 * ## Everything is a `YYYY-MM-DD` string in the MARKET's day
 *
 * Not a `Date`. A `Date` carries a time and a zone, and the moment one is
 * built from a device clock the calendar starts disagreeing with the API about
 * which day "today" is: a traveller in London opening this at 21:00 is already
 * on tomorrow in Asia/Kolkata, and would be shown a first bookable day that
 * the server has already closed.
 *
 * The one `Date` in here is a UTC noon anchor used purely to step days, which
 * no offset in use can push across a boundary.
 */

/** Monday first. The issue says so, and it is the market's own week. */
export const WEEKDAY_INITIALS = ["M", "T", "W", "T", "F", "S", "S"] as const;

/**
 * How far ahead a date may be chosen.
 *
 * 89 days after today, from the issue. Deliberately not `WINDOW_DAYS`: the
 * availability window is what a LISTING publishes, and this is how far the
 * catalogue will answer a `bookableOn` query at all. Tying them together would
 * make one silently follow the other.
 */
export const MAX_DAYS_AHEAD = 89;

export interface MonthCell {
  /** `YYYY-MM-DD`, or `null` for a leading or trailing blank. */
  date: string | null;
  /** The number to print. */
  day: number;
  /** Before today, or more than `MAX_DAYS_AHEAD` after it. */
  disabled: boolean;
}

const pad = (n: number) => String(n).padStart(2, "0");

/** `2026-09-14` becomes `{ year: 2026, month: 9, day: 14 }`. */
export function parseDate(date: string): {
  year: number;
  month: number;
  day: number;
} {
  const [year, month, day] = date.split("-").map(Number);
  return { year, month, day };
}

export const toDate = (year: number, month: number, day: number) =>
  `${year}-${pad(month)}-${pad(day)}`;

/** The first of a month, as the anchor a calendar page is drawn from. */
export const monthStart = (date: string) => {
  const { year, month } = parseDate(date);
  return toDate(year, month, 1);
};

/** The same day-of-month one month on or back, clamped to the 1st. */
export function shiftMonth(date: string, by: number): string {
  const { year, month } = parseDate(date);
  const index = (year * 12 + (month - 1) + by) as number;
  return toDate(Math.floor(index / 12), (index % 12) + 1, 1);
}

/** Days between two market dates. Positive when `b` is later. */
export function daysBetween(a: string, b: string): number {
  const at = parseDate(a);
  const bt = parseDate(b);
  return Math.round(
    (Date.UTC(bt.year, bt.month - 1, bt.day, 12) -
      Date.UTC(at.year, at.month - 1, at.day, 12)) /
      86_400_000,
  );
}

/** The month a date belongs to, named: "September 2026". */
export function monthLabel(date: string): string {
  const { year, month } = parseDate(date);
  return new Intl.DateTimeFormat("en-IN", {
    month: "long",
    year: "numeric",
    timeZone: "Asia/Kolkata",
  }).format(new Date(Date.UTC(year, month - 1, 15, 12)));
}

/**
 * One month as a grid of cells, Monday first, with leading blanks.
 *
 * Trailing blanks are deliberately NOT emitted. A grid padded to a full six
 * rows is a taller calendar with nothing in the bottom row for most months,
 * and CSS grid places the last partial row correctly without them.
 */
export function monthGrid(
  anchor: string,
  today: string = marketToday(),
): MonthCell[] {
  const { year, month } = parseDate(anchor);
  const first = new Date(Date.UTC(year, month - 1, 1, 12));

  /*
    `getUTCDay()` is Sunday-first (0 to 6). Monday-first is `(d + 6) % 7`, so
    Monday becomes 0 and Sunday becomes 6. Getting this wrong shifts every date
    in the month by a column, which looks plausible and is wrong for everyone.
  */
  const lead = (first.getUTCDay() + 6) % 7;
  const length = new Date(Date.UTC(year, month, 0, 12)).getUTCDate();

  const cells: MonthCell[] = [];
  for (let i = 0; i < lead; i += 1) {
    cells.push({ date: null, day: 0, disabled: true });
  }
  for (let day = 1; day <= length; day += 1) {
    const date = toDate(year, month, day);
    const offset = daysBetween(today, date);
    cells.push({ date, day, disabled: offset < 0 || offset > MAX_DAYS_AHEAD });
  }
  return cells;
}

/** Whether the previous or next arrow has anything to show. */
export function canStepMonth(
  anchor: string,
  by: -1 | 1,
  today: string = marketToday(),
): boolean {
  const target = shiftMonth(anchor, by);
  return monthGrid(target, today).some(
    (cell) => cell.date !== null && !cell.disabled,
  );
}
