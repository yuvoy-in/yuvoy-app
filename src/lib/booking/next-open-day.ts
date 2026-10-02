import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { CACHE, qk } from "@/lib/query/policy";
import { civilFromDate, weekdayDayMonth } from "@/lib/format/date";
import { clockOffsetMs } from "./clock";
import { fetchAvailability } from "./availability-query";
import { CALENDAR_WINDOW_DAYS, marketDateRange } from "./availability-window";
import { daysFromSlots, firstOpenDay } from "./day-availability";
import type { components } from "@/lib/api/schema.gen";

type Slot = components["schemas"]["Slot"];

/**
 * The first day a traveller could actually book, for the listing's sticky bar
 * (yuvoy-app#111).
 *
 * ## Why not `nextAvailable`
 *
 * The listing already carries `nextAvailable`, and it is the wrong source
 * twice over. The page is statically rendered and revalidated every five
 * minutes, and its own rule is that availability is never part of that
 * cache: a departure whose cutoff passes inside the window would still be
 * offered. And on 25 Sep `GET /experiences/{slug}` sent no `nextAvailable`
 * at all for listings the feed showed open the next morning (yuvoy-api#248),
 * which the contract reads as "nothing in 90 days".
 *
 * So the bar asks availability itself, live, over checkout's own window, and
 * finds the first open day with checkout's own rule: open status, not sold
 * out, cutoff not passed, judged against the SERVER's clock. The day the bar
 * names is the day checkout's calendar opens on, by construction.
 */
export type NextOpenDay =
  | { state: "pending" }
  | { state: "error" }
  | { state: "none" }
  | { state: "open"; date: string };

/** Pure: the first open day in these slots, as of `now`. */
export function nextOpenDayOf(
  slots: readonly Slot[] | undefined,
  now: number,
): NextOpenDay {
  const first = firstOpenDay(daysFromSlots(slots, now));
  return first ? { state: "open", date: first } : { state: "none" };
}

/**
 * The sentence for the bar, or nothing.
 *
 * Nothing while the read is in flight or failed: "no dates" is a claim, and a
 * read that did not come back has not earned it. The ninety days are stated
 * rather than implied, as on the feed card, because "no dates" alone reads as
 * a fault in the app.
 */
export function nextOpenSentence(next: NextOpenDay): string | null {
  if (next.state === "none") {
    return `No dates in the next ${CALENDAR_WINDOW_DAYS} days`;
  }
  if (next.state !== "open") return null;
  const civil = civilFromDate(next.date);
  return civil ? `Next open: ${weekdayDayMonth(civil)}` : null;
}

export function useNextOpenDay(slug: string, enabled: boolean): NextOpenDay {
  /*
    Checkout's window, computed the way checkout computes it. The day is the
    MARKET's (`marketDateRange` anchors on Asia/Kolkata), never the device's.
  */
  const range = useMemo(() => marketDateRange(CALENDAR_WINDOW_DAYS), []);

  const availability = useQuery({
    queryKey: qk.availabilityForListing(slug, range.from, range.to),
    queryFn: ({ signal }) => fetchAvailability(slug, range, signal),
    enabled,
    ...CACHE.getAvailability,
  });

  if (availability.isPending) return { state: "pending" };
  if (availability.isError) return { state: "error" };

  /*
    The server's clock at the moment it answered, as checkout reads it: a phone
    with a skewed clock would otherwise name a departure whose cutoff has
    passed, or skip one that is still open.
  */
  const now = availability.dataUpdatedAt + clockOffsetMs();
  return nextOpenDayOf(availability.data.slots, now);
}
