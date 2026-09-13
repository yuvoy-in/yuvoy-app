"use client";

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
function FeedHeading() {
  return <h1 className="sr-only">Experiences in the Andaman Islands</h1>;
}

export function Feed({
  initialPage,
  initialFetchedAt,
}: {
  /** The first answer, server-rendered. See app/page.tsx for why. */
  initialPage?: ReelsPage | null;
  /** When the server fetched it. Epoch ms. */
  initialFetchedAt?: number;
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

  /* ------------------------------------------------------------- loading */
  if (isPending) {
    return (
      <>
        <FeedHeading />
        <LoadingState label="Loading experiences">
          <ReelFrame>
            <Skeleton className="absolute inset-0 rounded-none" />
            <div className="tabbar-clearance absolute inset-x-0 bottom-0 space-y-3 px-5">
              <Skeleton className="h-9 w-4/5 rounded-full" />
              <Skeleton className="h-3 w-40 rounded-full" />
            </div>
          </ReelFrame>
        </LoadingState>
      </>
    );
  }

  /* --------------------------------------------------------------- error */
  if (isLoadingError) {
    return (
      <>
        <FeedHeading />
        <ReelFrame className={REEL_WELL_CENTRED}>
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
        <FeedHeading />
        <ReelFrame className={REEL_WELL_CENTRED}>
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
      <FeedHeading />
      <ReelStrip
        items={items}
        tail={tail}
        hasNextPage={hasNextPage}
        isFetchingNextPage={isFetchingNextPage}
        isFetchNextPageError={isFetchNextPageError}
        fetchNextPage={() => void fetchNextPage()}
        chrome={<ReelMasthead />}
      />
    </>
  );
}
