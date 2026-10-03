import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { CACHE, qk } from "@/lib/query/policy";
import {
  civilFromDate,
  dayMonth,
  weekdayDayMonth,
  weekdayName,
} from "@/lib/format/date";
import { clockOffsetMs } from "./clock";
import { fetchAvailability } from "./availability-query";
import {
  CALENDAR_WINDOW_DAYS,
  marketDateRange,
  marketDayOf,
} from "./availability-window";
import { daysFromSlots, firstOpenDay } from "./day-availability";
import { slotIsOpen } from "./slot-open";
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

/**
 * The listing's availability, live, over checkout's window. One query, read by
 * the bar (`useNextOpenDay`) and the price panel (`useOpenDays`), so the two
 * can never disagree and the page asks once.
 */
function useListingAvailability(slug: string, enabled: boolean) {
  /*
    Checkout's window, computed the way checkout computes it. The day is the
    MARKET's (`marketDateRange` anchors on Asia/Kolkata), never the device's.
  */
  const range = useMemo(() => marketDateRange(CALENDAR_WINDOW_DAYS), []);

  return useQuery({
    queryKey: qk.availabilityForListing(slug, range.from, range.to),
    queryFn: ({ signal }) => fetchAvailability(slug, range, signal),
    enabled,
    ...CACHE.getAvailability,
  });
}

export function useNextOpenDay(slug: string, enabled: boolean): NextOpenDay {
  const availability = useListingAvailability(slug, enabled);

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

/**
 * The next few open days, for the listing's price panel (the approved
 * redesign, traveller A, 3 Oct 2026): "Next open: Tomorrow, Fri 16 Oct ·
 * 3 seats left", then "Then Sat 17 Oct, Sun 18 Oct, Mon 19 Oct, and more".
 *
 * The bar names one day so a traveller knows the page is worth reading; the
 * panel names a few, because "is there anything this week" is the question
 * the price is weighed against. Same read and same rule as the bar, so the
 * first day here is the bar's day, and checkout's.
 */
export interface OpenDay {
  /** `YYYY-MM-DD`, the market's own calendar. */
  date: string;
  /** "Today, Thu 15 Oct", "Tomorrow, Fri 16 Oct", or "Sat, 17 Oct". */
  label: string;
  /** "Sat 17 Oct": for a list, where the comma already separates the days. */
  short: string;
  /**
   * The server's seat sentence, verbatim, and only when ONE departure is open
   * that day. With two, "3 seats left" would not say which boat it is about.
   */
  seats: string | null;
}

export type OpenDays =
  | { state: "pending" }
  | { state: "error" }
  | { state: "none" }
  | {
      state: "open";
      days: OpenDay[];
      /** True when there are open days beyond the ones listed. */
      more: boolean;
    };

/** The first day and three after it: one line each on a small phone. */
export const LISTING_OPEN_DAYS = 4;

const DAY_MS = 86_400_000;

/** Pure: the first `count` open days in these slots, as of `now`. */
export function openDaysOf(
  slots: readonly Slot[] | undefined,
  now: number,
  count: number = LISTING_OPEN_DAYS,
): OpenDays {
  const today = marketDayOf(now);
  // IST keeps no daylight saving, so a day is always 24 hours there.
  const tomorrow = marketDayOf(now + DAY_MS);

  const open = [...daysFromSlots(slots, now).entries()]
    .filter(([date, day]) => date >= today && day.state === "open")
    .sort(([a], [b]) => a.localeCompare(b));

  const days: OpenDay[] = [];
  let listed = 0;
  for (const [date, day] of open) {
    if (days.length >= count) break;
    listed += 1;
    const civil = civilFromDate(date);
    // A date in a shape this cannot read is skipped, never printed raw.
    if (!civil) continue;
    const bookable = day.slots.filter(
      (slot) => !slot.soldOut && slotIsOpen(slot, now),
    );
    const short = `${weekdayName(civil)} ${dayMonth(civil)}`;
    days.push({
      date,
      label:
        date === today
          ? `Today, ${short}`
          : date === tomorrow
            ? `Tomorrow, ${short}`
            : weekdayDayMonth(civil),
      short,
      seats:
        bookable.length === 1 ? (bookable[0].remainingDisplay ?? null) : null,
    });
  }

  if (days.length === 0) {
    /*
      Open days the formatter could not read are a broken answer, not an
      empty one, and "no dates" is a claim: say nothing instead.
    */
    return open.length === 0 ? { state: "none" } : { state: "error" };
  }
  return { state: "open", days, more: open.length > listed };
}

export function useOpenDays(slug: string, enabled: boolean): OpenDays {
  const availability = useListingAvailability(slug, enabled);

  if (availability.isPending) return { state: "pending" };
  if (availability.isError) return { state: "error" };

  // The server's clock, as above.
  const now = availability.dataUpdatedAt + clockOffsetMs();
  return openDaysOf(availability.data.slots, now);
}
