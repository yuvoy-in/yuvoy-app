import {
  civilInZone,
  clockTime,
  dayMonth,
  weekdayName,
  type Civil,
} from "@/lib/format/date";

/**
 * How a hold's deadline is drawn: a ticking count, or a time with its day
 * (yuvoy-app#97).
 *
 * ## Why this stopped being one shape
 *
 * A hold taken at checkout runs about ten minutes, and a live `m:ss` beside it
 * is the right thing to draw. Since yuvoy-api#203 a hold that comes from an
 * operator ACCEPTING a request runs twelve hours, capped at the departure's
 * booking cutoff, so `holdExpiresAt` (and the payment order's `expiresAt`,
 * which is the same deadline) can be tomorrow morning. Drawn as a countdown
 * that is "719:58", decrementing once a second: a number nobody reads as a
 * duration, on the screen whose job is to get somebody to pay calmly. The
 * contract now says so itself: "Show a deadline that far off as a time, with
 * the day when it is not today in the trip's market."
 *
 * ## The rule
 *
 *   - Within the hour AND on the market's today: the countdown, as before.
 *   - Otherwise: "08:00 on Tue 22 Sep", the form the API uses in the
 *     traveller's own message, or "17:30 today" when it is today.
 *   - Already past: the countdown at 0:00, which is what the screen's "the
 *     hold has run out" copy hangs off.
 *
 * "Not today" wins over "within the hour" on purpose: a 45 minute hold that
 * ends at 00:15 is tomorrow's 00:15, and a clock face does not say so.
 *
 * ## Whose clock and whose calendar
 *
 * `nowMs` is the SERVER's now (`Date.now() + clockOffsetMs()`), because the
 * deadline was written against the API's clock and a phone ten minutes out
 * would otherwise move the line between the two shapes. The day is the
 * MARKET's, from the date tables rather than `Intl`'s month names, so node and
 * WebKit spell it the same (yuvoy-app#67).
 */

/** Closer than this, and on the same day, the countdown is the honest shape. */
export const COUNTDOWN_WITHIN_MS = 60 * 60_000;

export type HoldDisplay =
  | { kind: "countdown"; msLeft: number }
  | { kind: "deadline"; msLeft: number; when: string };

function sameDay(a: Civil, b: Civil): boolean {
  return a.year === b.year && a.month === b.month && a.day === b.day;
}

/**
 * The shape to draw for a deadline, as of `nowMs`.
 *
 * `timeZone` is the trip's market (`slot.timezone`). An unknown zone, or an
 * instant that cannot be read, keeps the countdown, which is what the screen
 * drew before any of this: it cannot say a day it cannot compute.
 */
export function holdDisplay(
  expiresAt: string,
  timeZone: string,
  nowMs: number,
): HoldDisplay {
  const target = Date.parse(expiresAt);
  if (!Number.isFinite(target)) return { kind: "countdown", msLeft: 0 };
  const msLeft = Math.max(0, target - nowMs);
  if (msLeft === 0) return { kind: "countdown", msLeft };

  const deadline = civilInZone(expiresAt, timeZone);
  const today = civilInZone(new Date(nowMs).toISOString(), timeZone);
  if (!deadline || !today) return { kind: "countdown", msLeft };

  const isToday = sameDay(deadline, today);
  if (isToday && msLeft <= COUNTDOWN_WITHIN_MS) {
    return { kind: "countdown", msLeft };
  }

  const time = clockTime(deadline);
  return {
    kind: "deadline",
    msLeft,
    when: isToday
      ? `${time} today`
      : `${time} on ${weekdayName(deadline)} ${dayMonth(deadline)}`,
  };
}
