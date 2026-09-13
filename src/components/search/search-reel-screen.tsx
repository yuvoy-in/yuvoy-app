"use client";

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { playableReels, feedTail } from "@/lib/feed/reels";
import {
  ReelFrame,
  ReelStrip,
  REEL_WELL_CENTRED,
} from "@/components/feed/reel-strip";
import { BackButton } from "@/components/chrome/back-button";
import {
  EmptyState,
  LoadingState,
  ErrorState,
  Skeleton,
} from "@/components/states";
import { filtersFromParams, filtersToParams } from "@/lib/search/filters";
import { useSearchReels } from "@/lib/search/use-search-reels";

/**
 * A search result, playing — `/search/r/{id}?…`, yuvoy-app#37.
 *
 * "Tapping a reel plays it; swiping goes to the next reel in the same filtered
 * order; back returns to the same grid at the same scroll position."
 *
 * All three come from one decision: the filter set is in the address. This
 * route reads the same parameters the grid was built from, so `useSearchReels`
 * resolves to the SAME query key and the strip opens on pages the grid already
 * fetched — no request, no reorder, and the swipe continues the sequence
 * rather than restarting it. Back is then the browser's own, including the
 * scroll position.
 *
 * ## Why not `GET /reels/{id}`
 *
 * It would fetch the clip in one request and lose the thing that matters. The
 * sequence is the feature, and a reel pinned in front of a list is a different
 * screen: somebody who tapped the ninth poster would swipe on to the first.
 * The shared-reel route (`/r/{id}`) makes the opposite trade for the opposite
 * reason — it has no sequence to preserve.
 */
export function SearchReelScreen({ mediaId }: { mediaId: string }) {
  const params = useSearchParams();
  const filters = filtersFromParams(params);
  const search = useSearchReels(filters);

  const items = playableReels(search.data?.pages);
  const index = items.findIndex((reel) => reel.media?.id === mediaId);

  /*
    Page forward until the opened reel is in hand.

    Reached by a deep link, a shared address, or a return after the cache was
    collected — the grid itself always has the reel already. Bounded by the
    list rather than a counter, and stopped by a failed page rather than
    retried forever.
  */
  useEffect(() => {
    if (
      index === -1 &&
      search.hasNextPage &&
      !search.isFetchingNextPage &&
      !search.isFetchNextPageError
    ) {
      void search.fetchNextPage();
    }
  }, [index, search]);

  const backHref = `/search?${filtersToParams(filters)}`;
  const back = <BackButton href={backHref} label="the results" />;

  if (search.isPending || (index === -1 && search.hasNextPage)) {
    return (
      <LoadingState label="Loading this reel">
        <ReelFrame>
          <Skeleton className="absolute inset-0 rounded-none" />
        </ReelFrame>
      </LoadingState>
    );
  }

  if (search.isLoadingError) {
    return (
      <ReelFrame className={REEL_WELL_CENTRED}>
        <ErrorState
          error={search.error}
          onRetry={() => void search.refetch()}
          tone="dark"
        />
      </ReelFrame>
    );
  }

  if (index === -1) {
    /*
      Not among these results. A stale link, a filter set that has since
      stopped matching it, or a clip taken down. Said here rather than 404ed
      by the route, which cannot answer it without walking every cursor before
      rendering anything.
    */
    return (
      <ReelFrame className={REEL_WELL_CENTRED}>
        <EmptyState
          tone="dark"
          title="This reel is not in these results"
          body="It may have been taken down, or the filters have moved on since this link was made."
          action={back}
        />
      </ReelFrame>
    );
  }

  return (
    <>
      <h1 className="sr-only">{items[index].experience?.title ?? "A reel"}</h1>
      <ReelStrip
        items={items}
        tail={feedTail(search.data?.pages)}
        initialIndex={index}
        hasNextPage={search.hasNextPage}
        isFetchingNextPage={search.isFetchingNextPage}
        isFetchNextPageError={search.isFetchNextPageError}
        fetchNextPage={() => void search.fetchNextPage()}
        emptyTailNote="That is everything matching this search."
        chrome={
          /*
            Not `lg:hidden`. Above `lg` the rail replaces the tab bar and
            carries the mark, but it carries no way BACK — and the tab bar is
            suppressed on a focused route, so hiding this would make the screen
            a desktop dead end. The same mistake `/o/{slug}/r/{id}` made first.
          */
          <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-start px-4 pt-4 pb-20">
            <span className="pointer-events-auto">{back}</span>
          </div>
        }
      />
    </>
  );
}
