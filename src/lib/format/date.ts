/**
 * Dates as text, without asking the runtime what a month is called.
 *
 * ## The defect this module exists to make impossible
 *
 * `Intl.DateTimeFormat` takes its month and weekday names, and its separators,
 * from whatever CLDR the RUNTIME carries. Node and the browsers do not carry
 * the same one, so a component that renders a date on the server and hydrates
 * in a browser can disagree with itself. That reached production on 15
 * September 2026: React error #418 on every reel with a departure
 * (yuvoy-app#67).
 *
 * Nothing in the suite could see it. A unit test runs one runtime; an e2e test
 * renders the built app in one browser against a server on the same machine
 * but a different ICU build. Both halves are individually correct.
 *
 * ## What actually diverges, measured rather than assumed
 *
 * Measured on 15 September 2026, node 22.14 (full ICU) against Playwright's
 * bundled WebKit and Chromium, `en-IN`, `Asia/Kolkata`:
 *
 * | Option                  | node     | WebKit   | Chromium |
 * | ----------------------- | -------- | -------- | -------- |
 * | `month: "short"` (Sept) | `Sept`   | `Sep`    | `Sept`   |
 * | `month: "short"` (rest) | 3 letters, identical in all three |
 * | `month: "long"`         | `September`, identical in all three |
 * | `weekday: "short"`      | `Wed`, identical in all three |
 * | `weekday: "long"`       | `Wednesday`, identical in all three |
 * | numeric parts, any zone | identical in all three, midnight included |
 *
 * Two conclusions, and the second is the one that is easy to miss.
 *
 * **September is the only divergent month name**, because `en-IN` and `en-GB`
 * abbreviate it to four letters and WebKit does not. Cutting a month to three
 * characters therefore makes the NAME agree everywhere. That is a real fix and
 * it is what `dateLabel` has always done.
 *
 * **But the SEPARATORS diverge independently of the names**, which a fix
 * applied to the month alone does not reach. The same options that produce
 * `Wed, 16 Sept, 17:30` in node produce `Wed, 16 Sep at 17:30` in WebKit: a
 * different month AND a different joiner. So a date taken as a formatted
 * STRING cannot be repaired by slicing anything; only a date assembled from
 * parts, with separators we write ourselves, is stable. That is why this
 * module hands back fields and short composers rather than wrapping `format`.
 *
 * The same measurement explains a defect with no hydration in it at all: an
 * iPhone and an Android looking at the same booking read two different
 * sentences, because WebKit and Chromium disagree with each other as well.
 *
 * ## What this module still uses `Intl` for, and why that is safe
 *
 * Turning an instant into a civil date in a named timezone. That is real
 * timezone arithmetic over the IANA database and there is no honest way to
 * hand-roll it. It is asked for as NUMBERS only (`year`, `month`, `day`,
 * `hour`, `minute` as digits), and numbers were identical across all three
 * runtimes at every hour tested, including midnight, which is the case where
 * `hour12: false` is known to produce `24` on some engines and `00` on others.
 * `hourCycle: "h23"` says which one is meant rather than relying on the legacy
 * flag.
 *
 * The weekday is never asked for. It is computed from the civil year, month
 * and day in UTC, so it cannot depend on where this runs.
 *
 * ## The rule
 *
 * **A date rendered on both sides of hydration must not be formatted by
 * `Intl`.** `pnpm qa` enforces it: `month: "short"` and a formatter with no
 * locale are refused everywhere but this file. `month: "long"` and
 * `weekday: "long" | "short"` are measured stable and are left alone, so a
 * screen that wants "Wednesday, 16 September" may still say so directly.
 */

/*
  The tables. These are the names, and they are ours rather than the platform's
  precisely so that no runtime gets a vote.
*/
export const WEEKDAY_SHORT = [
  "Sun",
  "Mon",
  "Tue",
  "Wed",
  "Thu",
  "Fri",
  "Sat",
] as const;

export const MONTH_SHORT = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

/**
 * A moment as the fields a human reads, with the timezone question already
 * settled by whoever produced it.
 *
 * `month` is 1-12 as written, not 0-11 as `Date` counts, because every field
 * here is the one that goes on the screen. `weekday` is 0-6 from Sunday, which
 * indexes {@link WEEKDAY_SHORT}.
 */
export interface Civil {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  weekday: number;
}

/** Sunday-indexed weekday for a civil date, computed rather than formatted. */
function weekdayOf(year: number, month: number, day: number): number {
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

function plausible(year: number, month: number, day: number): boolean {
  return (
    Number.isInteger(year) && month >= 1 && month <= 12 && day >= 1 && day <= 31
  );
}

/**
 * A plain `YYYY-MM-DD` as civil fields, with no timezone step at all.
 *
 * The API sends `localDate` and `nextAvailable` already in the market's own
 * calendar. Treating one as an instant and asking what day that instant falls
 * on in `Asia/Kolkata` is a round trip back to where it started, and it picks
 * up an environment dependency on the way. So this parses and does not convert.
 *
 * `null` for anything that is not the expected shape, which callers render as
 * the absence rather than as `2026-09-16` or as `Invalid Date`.
 */
export function civilFromDate(date: string): Civil | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!plausible(year, month, day)) return null;
  return {
    year,
    month,
    day,
    hour: 0,
    minute: 0,
    weekday: weekdayOf(year, month, day),
  };
}

/**
 * An instant as civil fields in a named timezone.
 *
 * The one place `Intl` is still reached for, and only for digits. See the
 * module note for the measurement that says digits are safe.
 *
 * `null` when the instant is unparseable or the zone is one this runtime does
 * not know. An unknown IANA zone THROWS rather than falling back, and a screen
 * that let it through would take a booking page down over a label.
 */
export function civilInZone(iso: string, timeZone: string): Civil | null {
  const at = new Date(iso);
  if (!Number.isFinite(at.getTime())) return null;

  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(at);
  } catch {
    return null;
  }

  const read = (type: Intl.DateTimeFormatPartTypes): number => {
    const found = parts.find((part) => part.type === type);
    return found ? Number(found.value) : NaN;
  };

  const year = read("year");
  const month = read("month");
  const day = read("day");
  const hour = read("hour");
  const minute = read("minute");
  if (!plausible(year, month, day)) return null;
  if (!Number.isInteger(hour) || !Number.isInteger(minute)) return null;

  return {
    year,
    month,
    day,
    hour,
    minute,
    weekday: weekdayOf(year, month, day),
  };
}

/**
 * An instant as civil fields in whatever zone this runtime is in.
 *
 * For the handful of stamps that are deliberately about the READER's day
 * rather than the market's: "when did they write this". No `Intl` at all, so
 * the string is stable for a given zone, though the zone itself is not
 * something a server can know. Anything using this must not be server
 * rendered, which is a statement about the screen rather than about this
 * function, and is why every caller carries a note saying which screen.
 */
export function civilHere(iso: string): Civil | null {
  const at = new Date(iso);
  if (!Number.isFinite(at.getTime())) return null;
  return {
    year: at.getFullYear(),
    month: at.getMonth() + 1,
    day: at.getDate(),
    hour: at.getHours(),
    minute: at.getMinutes(),
    weekday: at.getDay(),
  };
}

/* ------------------------------------------------------------ composers -- */
/*
  Deliberately small, and deliberately not one formatter with a pattern
  argument. The separators are the half that diverges, so they are written out
  where they are read, and a screen that wants a different joiner writes it
  from the pieces rather than teaching a formatter a new mode.
*/

/** `Wed`. */
export function weekdayName(civil: Civil): string {
  return WEEKDAY_SHORT[civil.weekday] ?? "";
}

/** `Sep`, never `Sept`. */
export function monthName(civil: Civil): string {
  return MONTH_SHORT[civil.month - 1] ?? "";
}

/** `16 Sep`. */
export function dayMonth(civil: Civil): string {
  return `${civil.day} ${monthName(civil)}`;
}

/** `Wed, 16 Sep`. */
export function weekdayDayMonth(civil: Civil): string {
  return `${weekdayName(civil)}, ${dayMonth(civil)}`;
}

/** `17:30`, twenty-four hour, zero padded. */
export function clockTime(civil: Civil): string {
  return `${String(civil.hour).padStart(2, "0")}:${String(civil.minute).padStart(2, "0")}`;
}
