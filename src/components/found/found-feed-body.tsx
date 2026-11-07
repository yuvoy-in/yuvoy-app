"use client";

import type { ReactNode, Ref, RefObject } from "react";
import { NetworkError } from "@/lib/api/errors";
import type { useFoundFeed, useNextPage } from "@/lib/found/use-found-feed";
import type { useFoundShown } from "@/lib/found/found-outcomes";
import {
  NO_FOUND_FILTERS,
  clearRows,
  foundEmpty,
  type FoundFilters,
  type FoundSearch,
} from "@/lib/found/found-filters";
import {
  departmentName,
  foundTail,
  foundWords,
  type Category,
  type ExplorePlace,
  type FoundItem,
} from "@/lib/found/found-words";
import { Button } from "@/components/ui/button";
import {
  EmptyState,
  ErrorState,
  LoadingState,
  Skeleton,
} from "@/components/states";
import type { useReport } from "./found-feed-parts";
import { FoundItemCard } from "./found-item-card";

/**
 * What `FoundFeedView` draws under its chips and notices: the failed first
 * read with its retry, the skeletons, an empty line with its way out, or the
 * cards and the foot. Moved here from `found-feed.tsx` (yuvoy-app#243) as it
 * was, and drawn in the same place.
 */
export function FeedBody({
  asked,
  changed,
  setAsked,
  feed,
  placeName,
  cards,
  tail,
  category,
  terms,
  checkedCities,
  filters,
  local,
  search,
  narrow,
  pickAnotherButton,
  list,
  headingId,
  place,
  report,
  observe,
  foot,
}: {
  asked: boolean;
  changed: boolean;
  setAsked: (asked: boolean) => void;
  feed: ReturnType<typeof useFoundFeed>;
  placeName: string;
  cards: FoundItem[];
  tail: ReturnType<typeof foundTail>;
  category: Category | null;
  terms: Parameters<typeof departmentName>[1];
  checkedCities: boolean;
  filters: FoundFilters;
  local: boolean;
  search: FoundSearch | null;
  narrow: (
    next: {
      category?: Category | null;
      filters?: FoundFilters;
      search?: FoundSearch | null;
    },
    then?: "heading",
  ) => void;
  pickAnotherButton: ReactNode;
  list: RefObject<HTMLDivElement | null>;
  headingId: string;
  place: ExplorePlace;
  report: ReturnType<typeof useReport>;
  observe: ReturnType<typeof useFoundShown>;
  foot: ReturnType<typeof useNextPage>;
}): ReactNode {
  let body: ReactNode;
  if (!asked && !changed) {
    body = <ErrorState error={null} onRetry={() => setAsked(true)} />;
  } else if (feed.isPending) {
    body =
      feed.fetchStatus === "paused" ? (
        <ErrorState
          error={new NetworkError()}
          onRetry={() => void feed.refetch()}
        />
      ) : (
        <LoadingState label={foundWords.loading(placeName)}>
          <div className="space-y-3">
            {[0, 1, 2].map((n) => (
              <Skeleton key={n} className="h-56 w-full" />
            ))}
          </div>
        </LoadingState>
      );
  } else if (feed.isLoadingError) {
    body = (
      <ErrorState
        error={feed.error}
        onRetry={() => void feed.refetch()}
        retrying={feed.isFetching}
      />
    );
  } else if (cards.length === 0 && tail !== "more") {
    const named = category ? departmentName(category, terms) : null;
    const emptied = checkedCities
      ? foundEmpty(filters, local, search, placeName)
      : null;
    body = emptied ? (
      <EmptyState
        title={emptied.line}
        action={
          emptied.action === "clear-search" ? (
            <Button
              variant="outline"
              size="md"
              onClick={() => narrow({ search: null }, "heading")}
            >
              {foundWords.search.clear}
            </Button>
          ) : emptied.action === "clear-filters" ? (
            <Button
              variant="outline"
              size="md"
              onClick={() => narrow({ filters: clearRows(filters) }, "heading")}
            >
              {foundWords.clearFilters}
            </Button>
          ) : (
            <Button
              variant="outline"
              size="md"
              onClick={() => narrow({ filters: NO_FOUND_FILTERS }, "heading")}
            >
              {foundWords.showEverything}
            </Button>
          )
        }
      />
    ) : category ? (
      <EmptyState
        title={
          named
            ? foundWords.emptyDepartment.title(named, placeName)
            : foundWords.emptyPlace.title(placeName)
        }
        body={foundWords.emptyDepartment.body}
        action={
          <Button
            variant="outline"
            size="md"
            onClick={() => narrow({ category: null }, "heading")}
          >
            {foundWords.showEverything}
          </Button>
        }
      />
    ) : (
      <EmptyState
        title={foundWords.emptyPlace.title(placeName)}
        body={foundWords.emptyPlace.body}
        action={pickAnotherButton ?? undefined}
      />
    );
  } else {
    body = (
      <>
        <div
          ref={list}
          role="feed"
          aria-labelledby={headingId}
          aria-busy={feed.isFetchingNextPage}
          className="space-y-3"
        >
          {cards.map((item, index) => (
            <FoundItemCard
              key={item.id}
              item={item}
              position={index}
              timezone={place.timezone}
              departmentName={departmentName(item.department, terms)}
              onReport={(id) => report.open(id, index)}
              observe={observe}
              setSize={tail === "end" ? cards.length : -1}
            />
          ))}
        </div>
        <Foot
          tail={tail}
          failed={feed.isFetchNextPageError}
          placeName={placeName}
          action={pickAnotherButton}
          sentinel={tail === "more" ? foot : undefined}
        />
      </>
    );
  }
  return body;
}

/* ----------------------------------------------------------------- foot -- */

function Foot({
  tail,
  failed,
  placeName,
  action,
  sentinel,
}: {
  tail: ReturnType<typeof foundTail>;
  failed: boolean;
  placeName: string;
  action: ReactNode;
  sentinel?: Ref<HTMLDivElement>;
}) {
  /*
    A failed next page wins over "Loading more…": the list stays, and the line
    says what to do. The sentinel stays too, so scrolling away and back asks
    again, which is what the line tells the reader to do.
  */
  const line = failed
    ? foundWords.tail.failed
    : tail === "more"
      ? foundWords.tail.more
      : tail === "stopped"
        ? foundWords.tail.stopped
        : null;
  return (
    <div ref={sentinel} className="py-8 text-center" data-tail={tail}>
      {line ? (
        <p
          role={failed ? "alert" : "status"}
          className={
            failed ? "text-terra-deep text-sm" : "text-forest/70 text-sm"
          }
        >
          {line}
        </p>
      ) : (
        <div className="flex flex-col items-center gap-4">
          <p className="text-body text-forest/70 text-pretty">
            {foundWords.end(placeName)}
          </p>
          {action}
        </div>
      )}
    </div>
  );
}
