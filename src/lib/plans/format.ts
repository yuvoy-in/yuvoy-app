import {
  civilInZone,
  clockTime,
  weekdayDayMonth,
  type Civil,
} from "@/lib/format/date";
import { formatMoney } from "@/lib/format/money";

/**
 * Times, rupees and map links on a plan, for both plan pages (yuvoy-app#193,
 * yuvoy-mobile#373).
 *
 * Built on the app's own date and money helpers rather than `Intl` options,
 * for the reason `lib/format/date.ts` gives at length: the server renders the
 * plan and the browser hydrates it, and a date formatted as one string by two
 * runtimes can disagree with itself (yuvoy-app#67). Every piece here is
 * assembled from civil fields with separators written out.
 */

/**
 * The zone a time is read in when the plan's own is one this runtime does not
 * know. `PlanView.timeZone` is the planner's IANA zone, and every plan so far
 * is in India, so a time read in Kolkata is right for nearly every reader and
 * a sentence is better than a blank. A blank would hide when the plan is.
 */
const FALLBACK_ZONE = "Asia/Kolkata";

function civil(iso: string, timeZone: string): Civil | null {
  return civilInZone(iso, timeZone) ?? civilInZone(iso, FALLBACK_ZONE);
}

/**
 * `Sat, 22 Aug, 19:00`, in the plan's zone, not the reader's: a plan is at a
 * place, and the time on the invite is the time there. `null` for an instant
 * that does not parse, which a caller leaves out rather than printing.
 */
export function planMoment(iso: string, timeZone: string): string | null {
  const at = civil(iso, timeZone);
  return at ? `${weekdayDayMonth(at)}, ${clockTime(at)}` : null;
}

/**
 * A time with its end: `Sat, 22 Aug, 19:00 to 22:00`, or with the end's day
 * written out when it falls on another one (`Sat, 22 Aug, 22:00 to Sun, 23
 * Aug, 01:00`), so a late night is not read as ending before it starts. "to"
 * rather than a dash: a dash between two times is the one this product does
 * not write. With no end, or one that does not parse, just the start.
 */
export function planTimeRange(
  startsAt: string,
  endsAt: string | undefined,
  timeZone: string,
): string | null {
  const start = civil(startsAt, timeZone);
  if (!start) return null;
  const first = `${weekdayDayMonth(start)}, ${clockTime(start)}`;
  const end = endsAt ? civil(endsAt, timeZone) : null;
  if (!end) return first;
  const sameDay =
    end.year === start.year && end.month === start.month && end.day === start.day;
  return sameDay
    ? `${first} to ${clockTime(end)}`
    : `${first} to ${weekdayDayMonth(end)}, ${clockTime(end)}`;
}

/** `₹250`, or `₹83.33` when a share has paise. Costs are INR only. */
export function rupees(amountMinor: number): string {
  return formatMoney({ amountMinor, currency: "INR" });
}

/**
 * The planner's map link, only when it is an https link to Google Maps.
 *
 * `mapUrl` is typed by the planner, so it is a link from one person to
 * another that Yuvoy puts its name next to. A `javascript:` or `data:` link
 * would run on click, and a link to any other site would open whatever the
 * planner pasted under "Open the map". The contract does not say the API
 * checks it, so the page does: anything else is dropped and the place text
 * still shows. The hosts are the ones Google Maps' own share button writes.
 */
const MAP_HOSTS: ReadonlyArray<{ host: string; path?: string }> = [
  { host: "maps.google.com" },
  { host: "maps.app.goo.gl" },
  { host: "www.google.com", path: "/maps" },
  { host: "google.com", path: "/maps" },
  { host: "goo.gl", path: "/maps" },
];

export function mapLink(url: string | undefined): string | null {
  if (typeof url !== "string" || url === "") return null;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== "https:" || parsed.username || parsed.password) {
    return null;
  }
  if (parsed.port !== "") return null;
  const allowed = MAP_HOSTS.some(
    ({ host, path }) =>
      parsed.hostname === host &&
      (path === undefined ||
        parsed.pathname === path ||
        parsed.pathname.startsWith(`${path}/`)),
  );
  return allowed ? parsed.href : null;
}
