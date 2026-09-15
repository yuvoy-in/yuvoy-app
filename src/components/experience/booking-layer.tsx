"use client";

import { type ReactNode } from "react";
import { StickyBar } from "@/components/ui/sticky-bar";
import { Button, ButtonArrow, ButtonLink } from "@/components/ui/button";
import type { components } from "@/lib/api/schema.gen";

type Experience = components["schemas"]["Experience"];

/**
 * One button, and it opens checkout (yuvoy-app#62 item 1).
 *
 * ## What used to be here, and why none of it is
 *
 * A "Pick a day" pop-up holding a day strip and that day's departures, a
 * party stepper, and an "Ask the operator" sheet for request-mode listings.
 * All three are gone. The owner's instruction on 14 September: "Tapping it
 * opens no date pop-up. It goes straight to the checkout page."
 *
 * That collapses three decisions the traveller was making in two places into
 * one page that asks them in order, and it ends a real divergence: request
 * mode used to answer in a sheet on this page while allotment mode went to
 * checkout, so the two modes had different flows, different validation and
 * different copy for the same act.
 *
 * ## The bar is always there, and sometimes says no
 *
 * `bookable: false` always comes with `slots: []`, so a listing that is not
 * on sale reads "No dates open" on a disabled button rather than sending
 * somebody to a checkout page with an empty calendar. It carries no reason:
 * why a business stopped selling is a supply judgement about them and does not
 * belong on a traveller screen.
 *
 * **No price in the bar**, removed by the owner earlier and kept removed. It
 * is the last thing read before committing, and a per-person figure there
 * reads as the total.
 *
 * It wraps the WHOLE page body, because a sticky element sticks only while its
 * parent is on screen, so the bar has to belong to a box that reaches the end
 * of the page. The server-rendered sections come through `before` and `after`
 * and are placed around it without being re-rendered here.
 */
export function BookingLayer({
  experience,
  bookable,
  before,
  after,
}: {
  experience: Experience;
  /**
   * Whether this listing can be sold right now — yuvoy-app#19 §1.
   *
   * False when the operator is not selling, a kill switch is engaged, the
   * listing has no price, or a credential their market and activity category
   * require is missing, unverified or expired.
   *
   * **It carries no reason and this screen invents none.** It also must not
   * imply the operator is gone: the page is still a 200 precisely because the
   * traveller arrived by a link, a bookmark or a search result, and "this does
   * not exist" would be worse than "not right now".
   */
  bookable: boolean;
  before?: ReactNode;
  after?: ReactNode;
}) {
  return (
    <>
      {before}

      {!bookable ? (
        /*
          Said once, in the body, as well as on the bar. Somebody reading the
          page needs to know before they reach the bottom, and the bar's own
          label has room for three words.
        */
        <p
          id="dates"
          className="text-forest/80 mt-10 max-w-prose scroll-mt-6 text-base"
        >
          This experience is not available to book right now. Everything else on
          Yuvoy is still bookable.
        </p>
      ) : null}

      {after}

      <StickyBar>
        {bookable ? (
          <ButtonLink href={`/e/${experience.slug}/book`} size="lg" block>
            Pick a day
            <ButtonArrow />
          </ButtonLink>
        ) : (
          /*
            Disabled rather than absent. A bar that vanishes on some listings
            makes the page look broken, and the label is the answer to the
            question the traveller came to the bottom of the page to ask.
          */
          <Button size="lg" block disabled>
            No dates open
          </Button>
        )}
      </StickyBar>
    </>
  );
}
