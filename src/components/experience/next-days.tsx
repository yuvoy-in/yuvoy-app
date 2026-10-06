"use client";

import { Skeleton } from "@/components/states";
import { cn } from "@/lib/cn";
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
 * name the same first day. A listing that is not on sale says so in the body
 * already, so this says nothing there.
 *
 * ## One block, two lines, whatever the read says
 *
 * The read always lands after the page is on screen (availability is never
 * in the static HTML), so the payment line, the cancellation line and the rest
 * of the page are laid out against whatever this draws while it waits. It
 * used to wait as two 16px bars (56px), then become one line (32px), two, or
 * nothing at all on a failure, and everything below moved each time (stability
 * audit, 6 Oct 2026). Now every state is the same block: at least two of the
 * panel's own lines, and the skeleton is two of those lines.
 *
 * A failed read says so, and offers to ask again, the way the reel panel does
 * for the same read. It still claims nothing about the dates: "no dates" is a
 * claim a read that did not come back has not earned.
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

  if (!bookable) return null;

  return (
    <div className="mt-3 min-h-[calc(2lh+0.125rem)] text-sm">
      <OpenDaysBody open={open} />
    </div>
  );
}

function OpenDaysBody({ open }: { open: ReturnType<typeof useOpenDays> }) {
  if (open.state === "pending") {
    return (
      <>
        <Line width="w-56" />
        <Line width="w-44" className="mt-0.5" />
      </>
    );
  }

  if (open.state === "error") {
    return (
      <p className="text-forest/70">
        The open days did not load.
        {open.retry ? (
          <>
            {" "}
            <button
              type="button"
              onClick={open.retry}
              disabled={open.retrying}
              className="text-terra-deep tap-target font-bold underline underline-offset-4 disabled:opacity-60"
            >
              Try again
            </button>
          </>
        ) : null}
      </p>
    );
  }

  if (open.state === "none") {
    return (
      <p className="text-forest/80">
        No dates in the next {CALENDAR_WINDOW_DAYS} days
      </p>
    );
  }

  const [first, ...rest] = open.days;
  return (
    <>
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
    </>
  );
}

/** One line of the panel's text, still to come: the line box, and a bar in it. */
function Line({ width, className }: { width: string; className?: string }) {
  return (
    <div className={cn("flex h-[1lh] items-center", className)}>
      <Skeleton className={cn("h-3 max-w-full", width)} />
    </div>
  );
}
