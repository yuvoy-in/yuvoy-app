import { get, set, del } from "idb-keyval";
import { marketDaysFrom } from "@/lib/booking/availability-window";
import { dayLabel } from "@/lib/search/labels";
import type { ServerTrip } from "./tabs";

/**
 * The days a traveller is on the island, and the plan Trips draws from them
 * (the approved redesign: traveller A with C's day plan in Trips, 3 Oct 2026).
 *
 * ## The phone's copy
 *
 * The account keeps the stay since yuvoy-api#257 (`use-stay.ts`), so every
 * phone a traveller signs in on sees the same days. This module is the copy
 * kept in this device's IndexedDB, the store the app already keeps saves and
 * booking links in: signed out, against an API from before #257, and for a
 * stay set before the account could keep one, until it moves there. It is a
 * convenience a traveller typed in, not a record: losing it costs them one
 * sheet, and nothing reads it but Trips.
 */
export interface Stay {
  /** `YYYY-MM-DD`, the market's own calendar, the day they arrive. */
  from: string;
  /** `YYYY-MM-DD`, the day they leave. Not before `from`. */
  to: string;
}

/** A stay longer than this is not a holiday on an island, it is a typo. */
export const MAX_STAY_DAYS = 60;

const KEY = "yuvoy:stay:v1";
const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** How many days from `from` to `to`, both counted. */
export function stayLength(stay: Stay): number {
  const days = (a: string) =>
    Date.UTC(+a.slice(0, 4), +a.slice(5, 7) - 1, +a.slice(8, 10));
  return Math.round((days(stay.to) - days(stay.from)) / 86_400_000) + 1;
}

/** Whether a value read back from the device is a stay this app would write. */
export function isStay(value: unknown): value is Stay {
  if (!value || typeof value !== "object") return false;
  const { from, to } = value as Partial<Stay>;
  if (typeof from !== "string" || typeof to !== "string") return false;
  if (!DATE.test(from) || !DATE.test(to) || to < from) return false;
  return stayLength({ from, to }) <= MAX_STAY_DAYS;
}

/** The stay on this device, or null. Anything malformed reads as none. */
export async function readStay(): Promise<Stay | null> {
  try {
    const value = await get(KEY);
    return isStay(value) ? value : null;
  } catch {
    // Private mode, a blocked store: there is simply no stay to show.
    return null;
  }
}

export async function writeStay(stay: Stay): Promise<void> {
  if (!isStay(stay)) throw new Error("not a stay");
  await set(KEY, stay);
}

export async function clearStay(): Promise<void> {
  await del(KEY);
}

/* ------------------------------------------------------------------ plan */

/** What a day of the plan holds: the trips booked or asked for on it. */
export interface PlanDay {
  date: string;
  /** "Today", "Tomorrow", or "Sat 17 Oct". */
  label: string;
  trips: ServerTrip[];
}

export type Plan =
  /** Days still to come, from today (or from arrival) to the last day. */
  | { state: "ahead" | "here"; days: PlanDay[] }
  /** The last day has gone. */
  | { state: "over" };

/**
 * Booked, booked in cash, held to pay for, or asked for: what a traveller has
 * on that day. `holding` is an accepted request waiting on payment
 * (yuvoy-app#156): the operator said yes, so it is on the day.
 */
const ON_THE_DAY = new Set([
  "confirmed",
  "paid_pending_ops",
  "holding",
  "pending_request",
]);

/**
 * Pure: the stay's remaining days, each with what is on it.
 *
 * `today` is the market's day by the server's clock. Days already gone are
 * left out rather than shown empty: "nothing booked" about yesterday is not a
 * suggestion anybody can act on.
 */
export function planDays(
  stay: Stay,
  trips: readonly ServerTrip[],
  today: string,
): Plan {
  if (today > stay.to) return { state: "over" };
  const start = today > stay.from ? today : stay.from;
  const count = stayLength({ from: start, to: stay.to });
  const days = marketDaysFrom(start, count).map((date) => ({
    date,
    label: dayLabel(date, today),
    trips: trips
      .filter((trip) => trip.localDate === date && ON_THE_DAY.has(trip.state))
      .sort((a, b) => a.localTime.localeCompare(b.localTime)),
  }));
  return { state: today >= stay.from ? "here" : "ahead", days };
}
