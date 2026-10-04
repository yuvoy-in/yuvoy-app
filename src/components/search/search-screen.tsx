"use client";

import {
  useDeferredValue,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import Link from "@/components/ui/link";
import { useRouter, useSearchParams } from "next/navigation";
import { EmptyState, ErrorState, LoadingState } from "@/components/states";
import { Field } from "@/components/ui/field";
import { Screen } from "@/components/chrome/screen";
import { Button } from "@/components/ui/button";
import { SearchIcon } from "@/components/ui/icons";
import { ReelGrid } from "@/components/feed/reel-grid";
import { RollingNumber } from "@/components/ui/rolling-number";
import { SheetPresence } from "@/components/ui/sheet";
import { FilterSheet, GroupPricedNote } from "./filter-sheet";
import { ActiveFilters } from "./active-filters";
import { playableReels } from "@/lib/feed/reels";
import {
  filtersFromParams,
  filtersToParams,
  type ReelFilters,
} from "@/lib/search/filters";
import { activeFilterCount, withoutFilters } from "@/lib/search/labels";
import { useSearchReels, useVocabulary } from "@/lib/search/use-search-reels";
import { DURATION, EASE, prefersReducedMotion } from "@/lib/motion";
import { useDelayedFlag } from "@/lib/motion/use-delayed-flag";
import { useListMotion } from "@/lib/motion/use-list-motion";

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
 *
 * ## One choice, seen landing (T14 A and T11 A, approved 4 Oct 2026)
 *
 * A choice in the sheet changes five things here, and none of them lands in
 * one frame any more: the sheet goes back down (T06 A), the count on Filters
 * rolls, a new pill grows in while what was below it slides to its place, and
 * the grid changes in place (`ReelGrid`).
 *
 * And a search answered in a quarter of a second shows no skeleton at all:
 * the last answer stays on screen while the next one loads (`keepPrevious`).
 * Only a wait that lasts 300ms shows the skeleton, the true shape of the grid
 * that is coming, breathing; once shown it stays 300ms, and the answer then
 * rises in tile by tile.
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

  const search = useSearchReels(filters, { keepPrevious: true });
  const vocabulary = useVocabulary();
  const items = playableReels(search.data?.pages);

  /* How many filters are on, for the button. The word is not one of them. */
  const active = activeFilterCount(filters);

  /*
    Whether anything on this screen has changed since it opened. A screen
    arrives whole (its own screen change carries it); only what changes on it
    afterwards is seen arriving, so the first pills, count and grid are simply
    there.
  */
  const address = params.toString();
  const [opened] = useState(address);
  const [touched, setTouched] = useState(false);
  if (!touched && address !== opened) setTouched(true);

  /*
    The wait, and whether to show it. `stale` is the last answer still on
    screen while the next one loads: it stays for 300ms, and only a wait that
    lasts longer swaps it for the skeleton.
  */
  const stale = search.isPlaceholderData;
  const waiting = useDelayedFlag(
    search.isPending || (stale && search.isFetching),
  );
  const view: ResultsView =
    waiting || search.isPending
      ? "loading"
      : search.isLoadingError
        ? "error"
        : items.length === 0
          ? "empty"
          : "grid";
  /* A grid that appears after anything else rises in; the first one does not. */
  const [shownView, setShownView] = useState(view);
  const [gridArrives, setGridArrives] = useState(false);
  if (view !== shownView) {
    setShownView(view);
    setGridArrives(view === "grid");
  }

  const sections = useRef<HTMLDivElement | null>(null);
  const results = useRef<HTMLDivElement | null>(null);
  const showGuide = q.trim() === "" && active === 0;
  useListMotion(
    sections,
    [active > 0, Boolean(filters.price), showGuide].join("|"),
    { arrive: "fade" },
  );
  useListMotion(results, view, { arrive: "fade" });

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
          {active > 0 ? <FilterCount count={active} arrive={touched} /> : null}
        </Button>
      </div>

      {/*
        Everything under the search bar moves as one: when a pill row, the
        price note or the guide line appears or goes, what is below slides to
        its new place instead of jumping (T14 A). Each part carries its own
        margin, so the copy that fades as a part leaves sits exactly where it
        was.
      */}
      <div ref={sections}>
        {/*
          WHAT IS APPLIED, before the results rather than inside the pop-up. A
          removal here writes the URL directly: no sheet, no draft, no Apply
          (yuvoy-app#37 item 1).
        */}
        <ActiveFilters
          filters={filters}
          vocabulary={vocabulary.data}
          onChange={apply}
          arrive={touched}
        />
        {/*
          What a price band leaves out, under the pill that applied it, for as
          long as it is applied (yuvoy-api#197). The API drops listings priced
          for a whole group from any price filter, so without this a traveller
          looking for a private boat reads its absence as "none exist".
        */}
        {filters.price ? (
          <div data-motion-key="group-note" className="mt-2">
            <GroupPricedNote />
          </div>
        ) : null}

        {/*
          A door to the guides, for somebody who opened Search without a plan
          (yuvoy-app#116 item 3). Guides were in the desktop rail only, so a
          phone had no way in. Shown only while nothing is typed or applied,
          where it is the next thing such a person needs; once they are
          searching it would be a line in the way.
        */}
        {showGuide ? (
          <p data-motion-key="guide" className="text-forest/70 mt-4 text-sm">
            Not sure where to start?{" "}
            <Link
              href="/guides"
              className="text-forest tap-target font-bold underline underline-offset-4"
            >
              Read a guide
            </Link>
          </p>
        ) : null}

        <div
          ref={results}
          data-motion-key="results"
          className="mt-8"
          // The answer on screen is the last one while the next one loads.
          aria-busy={stale && search.isFetching ? true : undefined}
        >
          {view === "loading" ? (
            /*
              One status for the whole wait, so a screen reader hears
              "Searching" once; the skeleton inside it appears only once the
              wait has lasted 300ms.
            */
            <div
              key="loading"
              data-motion-key="loading"
              data-motion-arrive="self"
            >
              <LoadingState label="Searching">
                {waiting ? <SearchSkeleton /> : null}
              </LoadingState>
            </div>
          ) : /*
              `isLoadingError`, not `isError`. On an infinite query `isError` is
              true whenever the LAST fetch failed, including a `fetchNextPage`
              with a full grid already on screen, which would throw a working
              grid away because page three did not arrive. The grid says so
              beside its own button instead.
            */
          view === "error" ? (
            <div key="error" data-motion-key="error">
              <ErrorState
                error={search.error}
                onRetry={() => void search.refetch()}
              />
            </div>
          ) : view === "empty" ? (
            /*
              The empty state names the filter most likely to be the cause.

              The day is checked first because it is the narrowest (fourteen
              dates against three islands), and because "Nothing on that day" is
              a claim about supply a traveller can act on by moving one chip.

              One thing changed here with the vocabulary endpoint. The old chips
              were derived from published listings, so a chip always returned
              something and an empty result could only mean the filters
              intersected badly. `GET /catalog/vocabulary` publishes the ACTIVE
              vocabulary rather than the populated one, so a single chip can now
              legitimately find nothing, which is why the last branch no longer
              assumes the word is at fault.
            */
            <div key="empty" data-motion-key="empty">
              <EmptyState
                title={
                  filters.bookableOn ? "Nothing on that day" : "No matches"
                }
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
            </div>
          ) : (
            <div key="grid" data-motion-key="grid" data-motion-arrive="self">
              <ReelGrid
                label="Search results"
                items={items}
                words
                arrive={gridArrives}
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
                /*
                  Not while the last answer stands in for the next: its pages
                  belong to the filters that were, and another of them is not
                  what anybody asked for.
                */
                hasNextPage={search.hasNextPage && !stale}
                isFetchingNextPage={search.isFetchingNextPage}
                isFetchNextPageError={search.isFetchNextPageError}
                fetchNextPage={() => void search.fetchNextPage()}
              />
            </div>
          )}
        </div>
      </div>

      {/*
        Mounted only while open (and through its exit, which is what the
        presence is for), which is what seeds the draft afresh each time and is
        why the sheet needs no effect to mirror the applied filters into it. An
        always-mounted sheet with an `open` prop looked tidier and was a
        cascading render React lints against.
      */}
      <SheetPresence open={sheetOpen}>
        <FilterSheet
          onClose={() => setSheetOpen(false)}
          filters={filters}
          onApply={apply}
        />
      </SheetPresence>
    </Screen>
  );
}

type ResultsView = "loading" | "error" | "empty" | "grid";

/**
 * The count on Filters. It rolls to its new figure (T14 A), and the badge
 * grows in when a first filter is applied on this screen. Hidden from
 * assistive technology: the button's own name carries the number.
 */
function FilterCount({ count, arrive }: { count: number; arrive: boolean }) {
  const ref = useRef<HTMLSpanElement | null>(null);
  // Read once: a badge drawn with the screen is simply there.
  const appears = useRef(arrive);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !appears.current || typeof el.animate !== "function") return;
    el.animate(
      prefersReducedMotion()
        ? [{ opacity: 0 }, { opacity: 1 }]
        : [
            { opacity: 0, transform: "scale(0.96)" },
            { opacity: 1, transform: "none" },
          ],
      prefersReducedMotion()
        ? { duration: DURATION.reducedFade, easing: "linear" }
        : { duration: DURATION.quick, easing: EASE.interaction },
    );
  }, []);
  return (
    <span
      ref={ref}
      aria-hidden="true"
      className="bg-forest text-paper ml-1.5 inline-flex size-5 items-center justify-center overflow-hidden rounded-full text-xs font-bold"
    >
      <RollingNumber value={count} />
    </span>
  );
}

/**
 * The shape of the answer that is coming (T11 A): `ReelGrid`'s own tiles,
 * two across at 4:5 with two lines of words, where the old skeleton was
 * three narrow 9:16 columns and the screen changed shape twice. It breathes
 * as ONE layer, rather than each shape on its own, and fades in when the
 * wait has lasted long enough to show it.
 */
function SearchSkeleton() {
  return (
    <div className="motion-fade-in" aria-hidden="true">
      <div className="skeleton-breath grid grid-cols-2 gap-x-3 gap-y-5 sm:grid-cols-3">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div key={i}>
            <div className="bg-forest/8 rounded-tile aspect-[4/5]" />
            <div className="bg-forest/8 mt-3 h-3 w-[85%] rounded-full" />
            <div className="bg-forest/8 mt-2 h-3 w-[55%] rounded-full" />
          </div>
        ))}
      </div>
    </div>
  );
}
