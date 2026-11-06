import type { components } from "@/lib/api/schema.gen";
import {
  civilFromDate,
  civilInZone,
  clockTime,
  type Civil,
} from "@/lib/format/date";

type BookingStatus = components["schemas"]["BookingStatus"];

/**
 * The booking's check-in code (yuvoy-app#218, the web half of
 * yuvoy-mobile#367, yuvoy-api R11-T1): what the traveller shows at the
 * meeting point, as eight characters and as a QR the business scans.
 *
 * The API sends `checkIn` only while the booking is confirmed or still
 * settling, the business checks people in by code and the kill switch is
 * off. Absent, the page draws nothing, not an empty box. The code is shown as
 * sent (already formatted, `K7QM-2XPA`) and the QR is of `link` as sent:
 * never the booking link's status token, which opens the booking itself.
 *
 * The words are the app's (`packages/core/src/booking/check-in.ts` in
 * yuvoy-mobile), so the two booking pages say the same thing.
 */

export const CHECK_IN_TITLE = "Show at check-in";
export const CHECK_IN_HINT =
  "The business scans this, or types the code, to check your group in. It also works the day before.";

export interface CheckInView {
  /** As sent: `K7QM-2XPA`. */
  code: string;
  /** What the QR holds, as sent. */
  link: string;
  /** "For Saturday, 22 August", from `validOn`; null for a day it cannot read. */
  day: string | null;
  /** "Checked in at 07:42" once the code was used, in the trip's own zone; null before. */
  checkedIn: string | null;
}

const WEEKDAY_LONG = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];
const MONTH_LONG = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/** `Saturday, 22 August`, the app's long form. */
function longDay(civil: Civil): string {
  return `${WEEKDAY_LONG[civil.weekday]}, ${civil.day} ${MONTH_LONG[civil.month - 1]}`;
}

const pad = (n: number) => String(n).padStart(2, "0");
const isoDay = (civil: Civil) =>
  `${civil.year}-${pad(civil.month)}-${pad(civil.day)}`;

/**
 * The block for this booking, or null when there is none to show: no
 * `checkIn`, a code or link that is empty, or a trip whose day is over in its
 * market by `now` (the server's clock, as the page reads it), since the code
 * works only to the end of its day. A `validOn` it cannot read falls back to
 * the departure's own day for that test, and the block still shows without
 * its day line: the code is what matters at the jetty.
 */
export function checkInView(
  status: BookingStatus,
  now: number,
): CheckInView | null {
  const sent = status.checkIn;
  if (!sent) return null;
  if (typeof sent.code !== "string" || typeof sent.link !== "string")
    return null;
  if (!sent.code.trim() || !sent.link.trim()) return null;

  const zone = status.slot.timezone;
  const valid = civilFromDate(sent.validOn);
  const lastDay = valid
    ? isoDay(valid)
    : (() => {
        const departs = civilInZone(status.slot.startsAt, zone);
        return departs ? isoDay(departs) : null;
      })();
  const today = civilInZone(new Date(now).toISOString(), zone);
  if (lastDay && today && isoDay(today) > lastDay) return null;

  return {
    code: sent.code,
    link: sent.link,
    day: valid ? `For ${longDay(valid)}` : null,
    checkedIn: sent.checkedInAt
      ? checkInUsedLine(sent.checkedInAt, zone, sent.validOn)
      : null,
  };
}

/**
 * "Checked in at 07:42", or with its day when that is not the trip's (a code
 * used the day before). "Checked in" alone for a time or a zone it cannot
 * read.
 */
export function checkInUsedLine(
  at: string,
  timeZone: string,
  validOn: string,
): string {
  const civil = civilInZone(at, timeZone);
  if (!civil) return "Checked in";
  const time = `Checked in at ${clockTime(civil)}`;
  return isoDay(civil) === validOn ? time : `${time} on ${longDay(civil)}`;
}

/** "K7QM-2XPA" read out as "K 7 Q M, 2 X P A": each character, a pause for the hyphen. */
export function spokenCode(code: string): string {
  return code
    .split("-")
    .map((part) => part.split("").join(" "))
    .join(", ");
}
