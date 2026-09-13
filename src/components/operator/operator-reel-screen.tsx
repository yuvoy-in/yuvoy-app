"use client";

import { useEffect } from "react";
import {
  useOperator,
  useOperatorReels,
  type OperatorProfile,
} from "@/lib/operator/use-operator";
import { playableReels, feedTail } from "@/lib/feed/reels";
import {
  ReelFrame,
  ReelStrip,
  REEL_WELL_CENTRED,
} from "@/components/feed/reel-strip";
import { BackButton } from "@/components/chrome/back-button";
import {
  EmptyState,
  ErrorState,
  LoadingState,
  Skeleton,
} from "@/components/states";

/**
 * A business's reels, playing in place — `/o/{slug}/r/{id}`, yuvoy-app#33.
 *
 * Tapping a tile on the profile used to open that reel's LISTING, which is the
 * one thing a poster does not promise. It now plays the reel, and swiping moves
 * through this business's reels only, in the order the grid showed them, with
 * back returning to the grid where it was.
 *
 * ## Why this pages the operator's reels rather than fetching the one
 *
 * `GET /reels/{id}` would give the clip in one request, and then swiping on
 * would need the sequence anyway — and pinning the opened reel in front of the
 * list, the way a SHARED reel does (`/r/{id}`), would put reel one after reel
 * five for somebody who tapped the fifth tile. The sequence is the point here,
 * so the real index is found in the real list.
 *
 * That costs nothing coming from the grid: `qk.operatorReels(slug)` is already
 * filled, so the strip opens on cached pages. Arriving cold, the profile
 * request carries page one.
 *
 * ## A reel beyond the first page
 *
 * Deep-linked, or opened after the grid was paged and the cache has since been
 * collected, the id may be in a page nobody has fetched. The effect below pages
 * forward until it turns up or the list ends. Bounded by the list itself rather
 * than by a counter: `hasNextPage` goes false at the end, whatever the length.
 */
export function OperatorReelScreen({
  slug,
  mediaId,
  initial,
}: {
  slug: string;
  mediaId: string;
  initial?: OperatorProfile;
}) {
  const operator = useOperator(slug, initial);
  const reels = useOperatorReels(
    slug,
    operator.data?.reels ?? null,
    operator.dataUpdatedAt,
  );

  const items = playableReels(reels.data?.pages);
  const index = items.findIndex((reel) => reel.media?.id === mediaId);
  const searching = index === -1 && reels.hasNextPage;

  /*
    Page forward until the opened reel is in hand.

    `isFetchingNextPage` is checked because this effect re-runs on every page
    that lands, and asking twice for the same cursor is a wasted request on a
    jetty connection. A page that FAILS deliberately stops the search rather
    than retrying forever: the failure below says so and offers the grid.
  */
  useEffect(() => {
    if (
      index === -1 &&
      reels.hasNextPage &&
      !reels.isFetchingNextPage &&
      !reels.isFetchNextPageError
    ) {
      void reels.fetchNextPage();
    }
  }, [index, reels]);

  const back = <BackButton href={`/o/${slug}`} label="their reels" />;

  if (operator.isPending || (searching && !reels.isFetchNextPageError)) {
    return (
      <LoadingState label="Loading this reel">
        <ReelFrame>
          <Skeleton className="absolute inset-0 rounded-none" />
        </ReelFrame>
      </LoadingState>
    );
  }

  if (operator.isError) {
    return (
      <ReelFrame className={REEL_WELL_CENTRED}>
        <ErrorState
          error={operator.error}
          onRetry={() => void operator.refetch()}
          tone="dark"
        />
      </ReelFrame>
    );
  }

  if (index === -1) {
    /*
      The reel is not among this business's, or the search ran out of pages.

      Not a 404 from the route, because the route cannot know: the id is
      checked against a list that pages, so the page would have to walk every
      cursor on the server to answer. Said here instead, with the way back to
      the grid, which is where a traveller who followed a stale tile wants to
      be. `GET /reels/{id}` being a 404 for a withdrawn clip is the same fact
      seen from the other side.
    */
    return (
      <ReelFrame className={REEL_WELL_CENTRED}>
        <EmptyState
          tone="dark"
          title="This reel is not here any more"
          body="It may have been taken down, or it belongs to another business. Their other reels are still on their page."
          action={back}
        />
      </ReelFrame>
    );
  }

  return (
    <>
      {/*
        Names the reel, not the screen. Somebody arriving here tapped a
        specific clip, and a heading about the page they were already on says
        nothing.
      */}
      <h1 className="sr-only">{items[index].experience?.title ?? "A reel"}</h1>
      <ReelStrip
        items={items}
        tail={feedTail(reels.data?.pages)}
        initialIndex={index}
        hasNextPage={reels.hasNextPage}
        isFetchingNextPage={reels.isFetchingNextPage}
        isFetchNextPageError={reels.isFetchNextPageError}
        fetchNextPage={() => void reels.fetchNextPage()}
        emptyTailNote={
          operator.data
            ? `That is everything ${operator.data.name} has filmed.`
            : undefined
        }
        chrome={
          /*
            A way back rather than the mark. This is a focused screen reached
            from one place — the grid — and the tab bar is hidden on it, so the
            back control is the only exit. `/r/{id}` is the opposite case: no
            history behind it, so the mark is the way in.

            NOT `lg:hidden`, unlike the feed's masthead. Above `lg` the rail
            replaces the tab bar and carries the mark, so hiding the mark there
            is right — but the rail carries no way BACK, and a reel screen with
            the bar suppressed and the back control hidden is a desktop dead
            end. Caught by the e2e running on both projects.
          */
          <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-start px-4 pt-4 pb-20">
            <span className="pointer-events-auto">{back}</span>
          </div>
        }
      />
    </>
  );
}
