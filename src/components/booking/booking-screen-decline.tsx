"use client";

import { ButtonLink } from "@/components/ui/button";
import { declineView } from "./trip-copy";

/*
  What the booking page offers after a declined request, moved word for word
  out of booking-screen.tsx.
*/

/**
 * What to do instead, after a request was turned down (yuvoy-api#225).
 *
 * The review asked for "the next open departure of the same listing in the
 * same message". The API sends it when there is one: then it is the one loud
 * control, opening this app's checkout on that date with the same party size,
 * and "See other dates" sits beside it. When there is none in the next 90
 * days that is said plainly, and the way on is somewhere else to go rather
 * than a calendar with nothing on it.
 */
export function DeclineOffer({
  view,
}: {
  view: NonNullable<ReturnType<typeof declineView>>;
}) {
  if (view.next) {
    return (
      <div className="mt-4">
        <p className="text-body max-w-prose text-pretty">
          The next date on this trip is{" "}
          <span className="font-bold tabular-nums">{view.next.when}</span>.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <ButtonLink href={view.next.href} size="sm">
            Book that date
          </ButtonLink>
          {view.otherDates ? (
            <ButtonLink href={view.otherDates} variant="outline" size="sm">
              See other dates
            </ButtonLink>
          ) : null}
        </div>
      </div>
    );
  }

  /*
    Only when the page knows the listing: a status too old to say which one
    it was cannot claim there is nothing else on it.
  */
  if (!view.otherDates) return null;
  return (
    <div className="mt-4">
      <p className="text-forest/70 text-body max-w-prose text-pretty">
        Nothing else is on sale for this trip in the next 90 days.
      </p>
      <ButtonLink href="/" variant="outline" size="sm" className="mt-3">
        Find something else
      </ButtonLink>
    </div>
  );
}
