"use client";

import { useState, useEffect, useDeferredValue } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  EmptyState,
  ErrorState,
  LoadingState,
  Skeleton,
} from "@/components/states";
import { Field } from "@/components/ui/field";
import { Screen } from "@/components/chrome/screen";
import { Button } from "@/components/ui/button";
import { SearchIcon } from "@/components/ui/icons";
import { ReelGrid } from "@/components/feed/reel-grid";
import { FilterSheet } from "./filter-sheet";
import { ActiveFilters } from "./active-filters";
import { playableReels } from "@/lib/feed/reels";
import {
  filtersFromParams,
  filtersToParams,
  type ReelFilters,
} from "@/lib/search/filters";
import { activeFilterCount, withoutFilters } from "@/lib/search/labels";
import { useSearchReels, useVocabulary } from "@/lib/search/use-search-reels";

/**
 * The Search tab — a search bar, one Filters button, and results as reels.
 *
 * ## What this replaces, and why
 *
 * Three stacked chip rows — Which day, Where, What kind of day — filled the
 * phone above the results, so a search screen showed no results until you
 * scrolled past its own controls. The owner's words on 13 September: "see how
 * bad the UI is" (yuvoy-app#37).
 *
 * The rows are one Filters button and a pop-up. The listing rows are a
 * three-column reel grid, because the product is the footage and a row of text
 * with a 72px thumbnail is the least persuasive way to show it.
 *
 * ## The filters live in the URL now
 *
 * The screen this replaces kept them in component state, deliberately: "from
 * that moment the chips are the truth, and a URL that disagreed with them
 * after the first tap would be worse than one that never claimed to."
 *
 * That reasoning held while the results were rows that opened a listing. It
 * does not hold now, and the address is load-bearing for two things the issue
 * asks for by name. Tapping a reel opens `/search/r/{id}`, which has to page
 * the SAME filtered order to swipe on through — so the filter set must survive
 * a navigation. And "back returns to the same grid at the same scroll
 * position" is the browser's own behaviour, for free, once the state that
 * built the grid is in the address rather than in a component that unmounted.
 *
 * A shareable search is the bonus, not the reason.
 *
 * ## The default state is the grid, not a prompt
 *
 * This screen used to refuse to ask anything until something was asked for:
 * an empty query with no filters was a prompt with two links, on the reasoning
 * that "everything" is what the feed is for.
 *
 * The owner decided otherwise on 14 September (yuvoy-app#37 item 9): opening
 * Search shows the unfiltered reel grid straight away. A search screen whose
 * first state is an instruction is a screen that has to be obeyed before it
 * does anything, and the grid is both the answer to "what is on" and the
 * fastest way to see that filtering is possible at all.
 *
 * ## What is applied is on the screen
 *
 * The pills under the search bar, and they are the other half of the owner's
 * "very bad filters" verdict. The wall of chips was inside the sheet; the part
 * that made an empty grid unexplainable was that nothing out here said why.
 */
export function SearchScreen() {
  const router = useRouter();
  const params = useSearchParams();
  const [sheetOpen, setSheetOpen] = useState(false);

  const filters = filtersFromParams(params);

  /*
    The text box is local and the URL follows it, rather than the other way
    round: a controlled input driven by a router push loses a keystroke to
    every navigation on a mid-range Android.

    `useDeferredValue` keeps typing responsive without a debounce timer, and
    the URL is written from the DEFERRED value — so the address settles when
    the typing does, and the history stack does not get an entry per letter.
  */
  const [q, setQ] = useState(filters.q ?? "");
  const deferredQ = useDeferredValue(q);

  /*
    Seeded from the URL once. `/go/<code>` sends a traveller here with
    `?place=…` when a printed card names one (yuvoy-app#27), and a back
    navigation restores whatever the address said.
  */
  useEffect(() => {
    const term = deferredQ.trim();
    if ((filters.q ?? "") === term) return;
    const next = filtersToParams({ ...filters, q: term || undefined });
    // `replace`, not `push`: typing is one search being refined, not a
    // sequence of them, and a back button that walks a word backwards letter
    // by letter is a trap.
    router.replace(next.size ? `/search?${next}` : "/search", {
      scroll: false,
    });
  }, [deferredQ, filters, router]);

  const apply = (next: ReelFilters) => {
    const params = filtersToParams({ ...next, q: q.trim() || undefined });
    router.replace(params.size ? `/search?${params}` : "/search", {
      scroll: false,
    });
  };

  const search = useSearchReels(filters);
  const vocabulary = useVocabulary();
  const items = playableReels(search.data?.pages);

  /* How many filters are on, for the button. The word is not one of them. */
  const active = activeFilterCount(filters);

  return (
    <Screen>
      <h1 className="font-display tracking-display text-3xl leading-tight">
        What is on
      </h1>

      <div className="mt-5 flex items-center gap-3">
        <Field
          className="min-w-0 flex-1"
          label="Search experiences"
          labelHidden
          type="search"
          shape="pill"
          leading={<SearchIcon className="size-5" />}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Diving, boats, Havelock…"
        />
        <Button
          variant="outline"
          className="shrink-0"
          onClick={() => setSheetOpen(true)}
          /*
            The count is in the accessible name as well as on the face. A
            screen reader user gets "Filters, 2 on" rather than a button whose
            state is a superscript they cannot see.
          */
          aria-label={active > 0 ? `Filters, ${active} on` : "Filters"}
        >
          Filters
          {active > 0 ? (
            <span
              aria-hidden="true"
              className="bg-forest text-cream ml-1.5 inline-flex size-5 items-center justify-center rounded-full text-xs font-bold"
            >
              {active}
            </span>
          ) : null}
        </Button>
      </div>

      {/*
        WHAT IS APPLIED, before the results rather than inside the pop-up. A
        removal here writes the URL directly: no sheet, no draft, no Apply
        (yuvoy-app#37 item 1).
      */}
      <ActiveFilters
        filters={filters}
        vocabulary={vocabulary.data}
        onChange={apply}
      />

      {/*
        Mounted only while open, which is what seeds the draft afresh each time
        and is why the sheet needs no effect to mirror the applied filters into
        it. An always-mounted sheet with an `open` prop looked tidier and was a
        cascading render React lints against.
      */}
      {sheetOpen ? (
        <FilterSheet
          onClose={() => setSheetOpen(false)}
          filters={filters}
          onApply={apply}
        />
      ) : null}

      <div className="mt-8">
        {search.isPending ? (
          <LoadingState label="Searching">
            <div className="grid grid-cols-3 gap-2">
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <Skeleton key={i} className="aspect-[9/16] w-full" />
              ))}
            </div>
          </LoadingState>
        ) : /*
            `isLoadingError`, not `isError`. On an infinite query `isError` is
            true whenever the LAST fetch failed, including a `fetchNextPage`
            with a full grid already on screen — which would throw a working
            grid away because page three did not arrive. The grid says so
            beside its own button instead.
          */
        search.isLoadingError ? (
          <ErrorState
            error={search.error}
            onRetry={() => void search.refetch()}
          />
        ) : items.length === 0 ? (
          /*
            The empty state names the filter most likely to be the cause.

            The day is checked first because it is the narrowest — fourteen
            dates against three islands — and because "Nothing on that day" is
            a claim about supply a traveller can act on by moving one chip.

            One thing changed here with the vocabulary endpoint. The old chips
            were derived from published listings, so a chip always returned
            something and an empty result could only mean the filters
            intersected badly. `GET /catalog/vocabulary` publishes the ACTIVE
            vocabulary rather than the populated one, so a single chip can now
            legitimately find nothing — which is why the last branch no longer
            assumes the word is at fault.
          */
          <EmptyState
            title={filters.bookableOn ? "Nothing on that day" : "No matches"}
            body={
              filters.bookableOn
                ? "No departure can be booked on that date. Try another day or remove a filter."
                : "Nothing on sale matches this. Remove a filter or try another word."
            }
            /*
              Clears every filter and KEEPS the typed word. Somebody who typed
              "diving" and then narrowed it to nothing did not ask to lose the
              word (yuvoy-app#37 item 8).
            */
            action={
              active > 0 ? (
                <Button
                  variant="outline"
                  onClick={() => apply(withoutFilters(filters))}
                >
                  Clear all filters
                </Button>
              ) : undefined
            }
          />
        ) : (
          <ReelGrid
            label="Search results"
            items={items}
            /*
              The filters travel with the tap, so the reel that opens can page
              the SAME filtered order and swipe on through it. Without them the
              strip would fall back to the unfiltered feed, and the second
              swipe would leave the search behind.
            */
            hrefFor={(reel) =>
              reel.media?.id
                ? `/search/r/${reel.media.id}?${filtersToParams(filters)}`
                : null
            }
            hasNextPage={search.hasNextPage}
            isFetchingNextPage={search.isFetchingNextPage}
            isFetchNextPageError={search.isFetchNextPageError}
            fetchNextPage={() => void search.fetchNextPage()}
          />
        )}
      </div>
    </Screen>
  );
}
