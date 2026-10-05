"use client";

import { Skeleton } from "@/components/states";
import { useOpenDays } from "@/lib/booking/next-open-day";
import { CALENDAR_WINDOW_DAYS } from "@/lib/booking/availability-window";
import { useListingLive } from "./preview-context";

/**
 * The next open days, in the price panel (the approved redesign, traveller A,
 * 3 Oct 2026): what a traveller weighs the price against, said beside it.
 *
 *   Next open: Tomorrow, Fri 16 Oct · 3 seats left
 *   Then Sat 17 Oct, Sun 18 Oct, Mon 19 Oct, and more
 *
 * A live read, never the statically cached listing, by checkout's own rule
 * and on the bar's own query, so the panel, the bar and checkout's calendar
 * name the same first day. Held open by a skeleton while the read is in
 * flight, and silent when it fails: "no dates" is a claim a read that did not
 * come back has not earned. A listing that is not on sale says so in the body
 * already, so this says nothing there either.
 */
export function NextDays({
  slug,
  bookable,
}: {
  slug: string;
  bookable: boolean;
}) {
  // Not read by a listing preview until it is shown (T02 C); held open by
  // the skeleton meanwhile, exactly as the page is while its read is in flight.
  const live = useListingLive();
  const open = useOpenDays(slug, bookable && live);

  if (!bookable || open.state === "error") return null;

  if (open.state === "pending") {
    return (
      <div className="mt-3 space-y-2 py-0.5">
        <Skeleton className="h-4 w-56 max-w-full" />
        <Skeleton className="h-4 w-44 max-w-full" />
      </div>
    );
  }

  if (open.state === "none") {
    return (
      <p className="text-forest/80 mt-3 text-sm">
        No dates in the next {CALENDAR_WINDOW_DAYS} days
      </p>
    );
  }

  const [first, ...rest] = open.days;
  return (
    <div className="mt-3 text-sm">
      <p className="text-forest/80">
        Next open:{" "}
        <strong className="font-bold tabular-nums">{first.label}</strong>
        {first.seats ? ` · ${first.seats}` : null}
      </p>
      {rest.length > 0 ? (
        <p className="text-forest/70 mt-0.5">
          Then {rest.map((day) => day.short).join(", ")}
          {open.more ? ", and more" : null}
        </p>
      ) : null}
    </div>
  );
}
