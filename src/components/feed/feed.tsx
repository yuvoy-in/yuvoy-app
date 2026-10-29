"use client";

import { useState, type ReactNode } from "react";
import { useReels } from "@/lib/feed/use-reels";
import { playableReels, feedTail, type ReelsPage } from "@/lib/feed/reels";
import {
  ReelFrame,
  ReelStrip,
  ReelMasthead,
  REEL_WELL_CENTRED,
} from "./reel-strip";
import {
  EmptyState,
  ErrorState,
  LoadingState,
  Skeleton,
} from "@/components/states";
import { feedHeading } from "@/lib/site/places";
import { IconButton } from "@/components/ui/icon-button";
import { CloseIcon } from "@/components/ui/icons";

/**
 * The reels feed — T2, the core of the product.
 *
 * The data and the states live here; the scroller itself is `ReelStrip`, which
 * three other surfaces share (a shared reel, search results, a business's own
 * reels). What is left in this file is what is true of the FEED and of nothing
 * else: `useReels`, the four states, and the masthead.
 *
 * The column is the phone's whole screen — the masthead and the tab bar float
 * over it — and on a desktop it is a rounded well set into the forest stage,
 * capped at 480px so the 9:16 clip is never upscaled across a monitor.
 */

/**
 * The feed's heading, for everything that is not a pair of eyes.
 *
 * Visually hidden and always rendered, in every state.
 *
 * The feed is full-bleed 9:16 video — there is nowhere to put a visible
 * headline that would not fight the thing it sits on, which is why the page
 * had none at all. But "none at all" is a document with no top-level heading:
 * a screen reader user lands with nothing naming the page, and a crawler reads
 * the app's front door as having no subject.
 *
 * Caught by the sitemap-driven audit rather than by looking, which is the
 * point of that suite: nothing about a missing h1 is visible on a screen.
 *
 * It is a SIBLING of the scroller, never a child. `role="feed"` requires its
 * children to be articles, so an `<h1>` inside it is a critical axe violation
 * — the first attempt at this fix traded a missing heading for a broken one,
 * and the accessibility suite caught what the audit suite had just asked for.
 */
function FeedHeading({ text }: { text: string }) {
  return <h1 className="sr-only">{text}</h1>;
}

export function Feed({
  initialPage,
  initialFetchedAt,
  heading = feedHeading(null),
  trigger,
  gone,
}: {
  /** The first answer, server-rendered. See app/page.tsx for why. */
  initialPage?: ReelsPage | null;
  /** When the server fetched it. Epoch ms. */
  initialFetchedAt?: number;
  /**
   * The heading, in words the page chose from `GET /places` (yuvoy-app#181):
   * "Experiences in the Andaman Islands" while that is the one market to book
   * in. A feed rendered without one names no place.
   */
  heading?: string;
  /**
   * The place trigger (yuvoy-app#179), passed by `/` only when the caller's
   * list holds a place to find things in. Without it, and without `gone`,
   * this is the feed exactly as it was.
   */
  trigger?: ReactNode;
  /**
   * "{place} isn't available right now, so here's ...": a remembered place
   * the server will not show, said once over the reels (section 6 point 2).
   */
  gone?: string | null;
}) {
  const {
    data,
    error,
    isPending,
    /*
      NOT `isError`, and the difference is the whole feed.

      On an infinite query `isError` is true whenever the LAST fetch failed —
      including a `fetchNextPage` that failed with eleven good cards already on
      screen, and including a background refetch. Branching the full-screen
      error state on it would throw a working feed away because page four did
      not arrive. `isLoadingError` is the narrow one: the query has no data at
      all, so there is nothing to show but the failure.
    */
    isLoadingError,
    isFetchNextPageError,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
    refetch,
  } = useReels(initialPage, initialFetchedAt);

  /*
    The server's order, untouched. Reels are numbered within each business, so
    everyone's first reel precedes anybody's second — an ordering built so it
    cannot express a preference for any operator. Sorting here by recency, or
    by anything, would hand the feed to whoever uploaded most recently.
  */
  const items = playableReels(data?.pages);

  /*
    What the bottom of the feed is allowed to say — told by the server, never
    inferred from a short page. Three outcomes rather than two: the feed ended,
    there is more, or the server stopped without a cursor, which the contract
    is explicit is "a different thing from the feed having ended".
  */
  const tail = feedTail(data?.pages);

  /*
    One masthead for every state, so the place and the gone line are there
    while the reels load, fail or come up empty, as the mark and Login are.
  */
  const chrome = (
    <>
      <ReelMasthead place={trigger} />
      {gone ? <GoneNotice line={gone} /> : null}
    </>
  );

  /* ------------------------------------------------------------- loading */
  if (isPending) {
    return (
      <>
        <FeedHeading text={heading} />
        <ReelFrame chrome={chrome}>
          <LoadingState label="Loading experiences">
            <Skeleton className="absolute inset-0 rounded-none" />
            <div className="tabbar-clearance absolute inset-x-0 bottom-0 space-y-3 px-5">
              <Skeleton className="h-9 w-4/5 rounded-full" />
              <Skeleton className="h-3 w-40 rounded-full" />
            </div>
          </LoadingState>
        </ReelFrame>
      </>
    );
  }

  /* --------------------------------------------------------------- error */
  if (isLoadingError) {
    return (
      <>
        <FeedHeading text={heading} />
        <ReelFrame className={REEL_WELL_CENTRED} chrome={chrome}>
          <ErrorState
            error={error}
            onRetry={() => void refetch()}
            tone="dark"
          />
        </ReelFrame>
      </>
    );
  }

  /* --------------------------------------------------------------- empty */
  if (items.length === 0) {
    return (
      <>
        <FeedHeading text={heading} />
        <ReelFrame className={REEL_WELL_CENTRED} chrome={chrome}>
          <EmptyState
            tone="dark"
            title="Nothing bookable here yet"
            body="No operator has put anything on sale for this filter. Try another destination, or come back closer to the season."
          />
        </ReelFrame>
      </>
    );
  }

  /* ------------------------------------------------------------- success */
  return (
    <>
      <FeedHeading text={heading} />
      <ReelStrip
        items={items}
        tail={tail}
        hasNextPage={hasNextPage}
        isFetchingNextPage={isFetchingNextPage}
        isFetchNextPageError={isFetchNextPageError}
        fetchNextPage={() => void fetchNextPage()}
        chrome={chrome}
        surface="feed"
      />
    </>
  );
}

/**
 * The gone line over the reels (yuvoy-app#179): a remembered place the
 * server will not show now. The browser forgets the place as the page comes
 * up (`RememberPlace`), so it is said this once; Close takes it away sooner.
 *
 * Under the masthead's row on a phone, at the top of the well from `lg` up
 * where the rail carries the mark, and a polite status so it is read out
 * without taking the focus from wherever it was.
 */
function GoneNotice({ line }: { line: string }) {
  const [shown, setShown] = useState(true);
  if (!shown) return null;
  return (
    <div className="pointer-events-none absolute inset-x-0 top-16 z-20 px-4 lg:top-18">
      <div
        role="status"
        className="bg-paper text-forest rounded-card pointer-events-auto flex items-start gap-2 py-2 pr-1.5 pl-4 shadow-lg"
      >
        <p className="text-label flex-1 py-1.5">{line}</p>
        <IconButton
          label="Close"
          variant="onPaper"
          size="sm"
          onClick={() => setShown(false)}
        >
          <CloseIcon className="size-4" />
        </IconButton>
      </div>
    </div>
  );
}
