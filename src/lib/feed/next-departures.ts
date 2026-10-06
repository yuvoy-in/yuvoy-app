import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { CACHE, qk } from "@/lib/query/policy";
import { civilFromDate, weekdayDayMonth } from "@/lib/format/date";
import { clockOffsetMs } from "@/lib/booking/clock";
import { fetchAvailability } from "@/lib/booking/availability-query";
import {
  CALENDAR_WINDOW_DAYS,
  marketDateRange,
  marketDayOf,
} from "@/lib/booking/availability-window";
import { daysFromSlots } from "@/lib/booking/day-availability";
import { slotIsOpen } from "@/lib/booking/slot-open";
import type { components } from "@/lib/api/schema.gen";

type Slot = components["schemas"]["Slot"];

/**
 * The next departures a traveller could book, for the reel's details panel
 * (the approved redesign, traveller A, 3 Oct 2026).
 *
 * ## What changed, and the principle it revisits
 *
 * The panel used to make no request at all: everything in it came from the
 * feed's own `ExperienceSummary`, so it opened instantly, worked offline and
 * could not spin. It also could not do the one thing a traveller opening it is
 * closest to wanting, which is to pick a departure. Its action said "See
 * dates" and cost a page load to answer.
 *
 * So the panel now reads availability, and only on an explicit act of
 * interest: the first time it is opened, never on scroll and never prefetched.
 * Everything that was instant stays instant (the title, the price, the
 * operator's evidence come from the row as before); the departures arrive
 * beneath them, with their own loading, failure and empty states, and the
 * panel's action falls back to the listing until they do. Nothing waits on
 * this read and no state of it is a dead end.
 *
 * ## One read, one rule, three screens
 *
 * The request is the listing bar's own (`qk.availabilityForListing`, the same
 * window and function), so opening the panel warms the listing a traveller is
 * most likely to open next, and the departure the panel names is a departure
 * the listing and checkout agree is open: the same `daysFromSlots` rule,
 * judged against the SERVER's clock, cutoffs included. A sold-out, closed or
 * past-cutoff departure is never offered, because checkout would refuse it.
 */
export interface Departure {
  slotId: string;
  /** `YYYY-MM-DD`, the market's own calendar, never the device's. */
  date: string;
  /** `HH:MM`, the market's own clock, as the slot states it. */
  time: string;
  /** "Today", "Tomorrow", or "Fri, 16 Oct", identically on any runtime. */
  day: string;
  /** The server's seat sentence, printed verbatim or not at all. */
  seats: string | null;
}

export type NextDepartures =
  /** Not asked: the panel has not been opened, or nothing is on sale. */
  | { state: "idle" }
  | { state: "pending" }
  | { state: "error"; retry: () => void }
  /** Asked, and the answer was no open departure in the window. */
  | { state: "none" }
  | { state: "open"; departures: Departure[] };

/** How many the panel lists. Three fit under its ceiling on a small phone. */
export const PANEL_DEPARTURES = 3;

const DAY_MS = 86_400_000;

/**
 * Pure: the first `count` open departures in these slots, as of `now`, in the
 * order a traveller reads them (day, then time).
 *
 * `now` is the server's clock at the moment it answered (`dataUpdatedAt` plus
 * the measured offset), passed in so the rule never reads a clock itself.
 */
export function nextDeparturesOf(
  slots: readonly Slot[] | undefined,
  now: number,
  count: number = PANEL_DEPARTURES,
): Departure[] {
  const today = marketDayOf(now);
  // IST keeps no daylight saving, so a day is always 24 hours there.
  const tomorrow = marketDayOf(now + DAY_MS);
  const days = [...daysFromSlots(slots, now).entries()].sort(([a], [b]) =>
    a.localeCompare(b),
  );

  const out: Departure[] = [];
  for (const [date, day] of days) {
    if (date < today || day.state !== "open") continue;
    const label = dayWord(date, today, tomorrow);
    // A date in a shape this cannot read is skipped, never printed raw.
    if (!label) continue;
    for (const slot of day.slots) {
      if (out.length >= count) return out;
      if (slot.soldOut || !slotIsOpen(slot, now)) continue;
      if (!slot.id || !slot.localStartTime) continue;
      out.push({
        slotId: slot.id,
        date,
        time: slot.localStartTime.slice(0, 5),
        day: label,
        seats: slot.remainingDisplay ?? null,
      });
    }
  }
  return out;
}

function dayWord(date: string, today: string, tomorrow: string): string | null {
  if (date === today) return "Today";
  if (date === tomorrow) return "Tomorrow";
  const civil = civilFromDate(date);
  return civil ? weekdayDayMonth(civil) : null;
}

/**
 * Where a departure is booked: checkout, opened on it. `date` and `slot` are
 * the parameters checkout already reads (`book-screen.tsx`).
 */
export function departureHref(slug: string, departure: Departure): string {
  const query = new URLSearchParams({
    date: departure.date,
    slot: departure.slotId,
  });
  return `/e/${slug}/book?${query.toString()}`;
}

/**
 * "today at 07:00", "tomorrow at 11:30", "Fri, 16 Oct at 07:00": for the
 * panel's action, which reads "Book tomorrow at 07:00".
 */
export function departurePhrase(departure: Departure): string {
  const day =
    departure.day === "Today" || departure.day === "Tomorrow"
      ? departure.day.toLowerCase()
      : departure.day;
  return `${day} at ${departure.time}`;
}

export function useNextDepartures(
  slug: string,
  enabled: boolean,
): NextDepartures {
  // Checkout's window, computed the way checkout and the listing bar compute
  // it, anchored on the MARKET's today.
  const range = useMemo(() => marketDateRange(CALENDAR_WINDOW_DAYS), []);

  const availability = useQuery({
    queryKey: qk.availabilityForListing(slug, range.from, range.to),
    queryFn: ({ signal }) => fetchAvailability(slug, range, signal),
    enabled,
    ...CACHE.getAvailability,
  });

  if (!enabled) return { state: "idle" };
  /*
    Data first. A refetch that fails after a good answer leaves the query in
    error WITH data, and the answer it already had is still the truest thing
    to show: only a read that never came back is an error to the traveller.
  */
  if (availability.data) {
    const now = availability.dataUpdatedAt + clockOffsetMs();
    const departures = nextDeparturesOf(availability.data.slots, now);
    return departures.length > 0
      ? { state: "open", departures }
      : { state: "none" };
  }
  if (availability.isLoadingError) {
    return { state: "error", retry: () => void availability.refetch() };
  }
  return { state: "pending" };
}
