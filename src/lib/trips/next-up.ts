import type { ServerTrip } from "./tabs";

/**
 * The trip that is next, for the pass at the top of Trips (the approved
 * redesign: traveller A with C's Next up pass, 3 Oct 2026).
 *
 * A booking that is going ahead and leaves within the next day. Not "the next
 * trip whenever it is": a pass for something a week away is a card, and the
 * list below already shows it as one. Inside a day it is the thing a traveller
 * opens Trips for, so it is drawn first and whole: when, where, the reference,
 * what to bring.
 *
 * `now` is the server's clock (the list's `dataUpdatedAt` plus the measured
 * offset), so a phone running fast does not show tomorrow's boat as gone.
 */
export const NEXT_UP_WITHIN_MS = 24 * 3_600_000;

/** States that mean the trip is happening: booked, whoever settles the money. */
const GOING_AHEAD = new Set(["confirmed", "paid_pending_ops"]);

export function nextUpTrip(
  trips: readonly ServerTrip[],
  now: number,
): ServerTrip | null {
  let next: ServerTrip | null = null;
  let nextAt = Infinity;
  for (const trip of trips) {
    if (!GOING_AHEAD.has(trip.state)) continue;
    const at = Date.parse(trip.startsAt);
    if (!Number.isFinite(at) || at <= now || at - now > NEXT_UP_WITHIN_MS) {
      continue;
    }
    if (at < nextAt) {
      next = trip;
      nextAt = at;
    }
  }
  return next;
}

/**
 * How long until it leaves, in words a glance can take: "in 40 min", "in
 * 3 h 20 min", "in 18 h". Minutes are dropped past ten hours, where they are
 * noise. `null` once it has left.
 */
export function untilPhrase(startsAt: string, now: number): string | null {
  const at = Date.parse(startsAt);
  if (!Number.isFinite(at)) return null;
  const minutes = Math.ceil((at - now) / 60_000);
  if (minutes <= 0) return null;
  if (minutes < 60) return `in ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours >= 10 || rest === 0) return `in ${hours} h`;
  return `in ${hours} h ${rest} min`;
}
