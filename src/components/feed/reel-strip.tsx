"use client";

import type { ReactNode } from "react";
import Link from "@/components/ui/link";
import { Wordmark } from "@/components/ui/wordmark";
import { LoginButton } from "@/components/auth/login-button";
import { AskTrigoButton } from "@/components/trigo/ask-trigo-button";

export { REEL_WELL, REEL_WELL_CENTRED, ReelFrame } from "./reel-well";
export { ReelStrip } from "./reel-scroller";

/**
 * The mark that floats over a reel on a phone. The rail carries it on desktop.
 *
 * ## Top left, and without the tagline — yuvoy-app#36
 *
 * It was centred, and it was the full delivered lockup, which put "Experience
 * more." in handwriting across the top of every clip. The tagline is baked
 * into that SVG, so the fix is a second asset rather than a class: see
 * `scripts/generate-feed-lockup.mjs`, which derives the ensō and the YUVOY
 * caps from the delivered file and re-centres them.
 *
 * ## The screen header's row, to the pixel
 *
 * The row is the one every other tab root draws (`Screen`'s header): 64px
 * tall, 16px in from each edge, the mark and Login centred in it. A tab
 * change from the feed crossfades this masthead into that header, and the two
 * used to disagree by 4px across and 2px to 6px down (the mark at 20px in,
 * Login hung from a 16px top padding), so the mark and Login visibly jumped
 * and doubled on every change to or from the feed. Now nothing in that strip
 * moves when the tab does.
 *
 * ## The geometry is measured, not chosen
 *
 * The block is the 64px row and 44px of tail: 108px, and `feed-scrim-top`'s
 * stops are percentages of exactly that. The mark is `h-7` centred in the
 * row, so it occupies 18px to 46px, which is 17% to 43% of the gradient, and
 * Login 10px to 54px. Changing the row or the tail without changing the stops
 * slides the mark into a lighter band with every contrast test still passing,
 * which is the quietest way to break this; `palette.test.ts` pins all of it.
 *
 * The block has been 108px since the owner asked for less shade over the
 * picture (the tail came down from 80px), and it still is: the row grew from
 * 16px of padding over a 44px row to the header's 64px, and the tail gave
 * back the 4px. `LoginButton` at `size="md"` is the tallest thing in the row
 * (yuvoy-app#56).
 *
 * `h-7` rather than the lockup's `h-9`: the ensō is 70% of the delivered
 * drawing's height and 95% of the compact one, so the same class would have
 * made the mark itself a third bigger. 28px keeps the ensō the size it has
 * always been on this screen.
 *
 * ## Inert on the feed, a link on a shared reel
 *
 * With nothing to press, `pointer-events-none` runs the full width and the
 * whole top of a reel scrolls the strip. It used to carry a Search disc while
 * the floating bar two inches below carried the same destination — two
 * controls for one screen, on the smallest surface in the product.
 *
 * `href` turns the mark into a way in, and only `/r/{id}` passes one: somebody
 * opening a shared clip from a message has no history to go back to and no
 * reason to know there is an app around it.
 */
export function ReelMasthead({
  href,
  place,
}: {
  href?: string;
  /**
   * The place trigger (yuvoy-app#179), passed by the feed only when the
   * caller's list holds a place to find things in. Absent, the masthead is
   * exactly what it was: nothing else here changes with it.
   */
  place?: ReactNode;
}) {
  const mark = href ? (
    <Link
      href={href}
      className="pointer-events-auto flex min-h-11 items-center"
      aria-label="Yuvoy home"
    >
      <Wordmark tone="paper" className="h-7" priority />
    </Link>
  ) : (
    <Wordmark tone="paper" className="h-7" priority />
  );
  return (
    <>
      {/*
        `justify-between` puts Login opposite the mark. The strip stays
        `pointer-events-none` across its full width so the whole top of a reel
        still scrolls the feed; only the mark's link and the button take a
        press (yuvoy-app#56 item 2). Getting that wrong makes a two-inch band
        at the top of every reel dead to a swipe, which is where a thumb rests.
      */}
      <div className="feed-scrim-top pointer-events-none absolute inset-x-0 top-0 z-20 pb-11 lg:hidden">
        <div className="flex h-16 items-center justify-between gap-3 px-4">
          {place ? (
            /*
              The place beside the mark, in the same 64px row, so the row's
              geometry and the scrim's stops (pinned by palette.test.ts) do
              not move. It shrinks and truncates before Login does.
            */
            <div className="flex min-w-0 items-center gap-2">
              {mark}
              <div className="pointer-events-auto min-w-0">{place}</div>
            </div>
          ) : (
            mark
          )}
          {/* Ask Trigo only while `releases.trigo` is open (yuvoy-app#223). */}
          <div className="pointer-events-auto flex shrink-0 items-center gap-2">
            <AskTrigoButton />
            <LoginButton />
          </div>
        </div>
      </div>
      {place ? (
        /*
          From `lg` up the rail carries the mark and Login, and the row above
          is hidden with them, so the place floats at the top of the well on
          its own. A second copy rather than one moved by breakpoint: only one
          is ever displayed, and a hidden one is out of the accessibility tree.
        */
        <div className="pointer-events-none absolute inset-x-0 top-0 z-20 hidden p-4 lg:block">
          <div className="pointer-events-auto inline-flex max-w-full">
            {place}
          </div>
        </div>
      ) : null}
    </>
  );
}
