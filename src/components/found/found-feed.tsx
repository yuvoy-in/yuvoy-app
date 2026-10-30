"use client";

import {
  useId,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
  type Ref,
  type RefObject,
} from "react";
import { onlineManager } from "@tanstack/react-query";
import { NetworkError } from "@/lib/api/errors";
import { clockOffsetMs } from "@/lib/booking/clock";
import { useVocabulary } from "@/lib/search/use-search-reels";
import {
  useFoundFeed,
  useHiddenCards,
  useNextPage,
  useStale,
} from "@/lib/found/use-found-feed";
import { useFoundShown } from "@/lib/found/found-outcomes";
import {
  NO_FOUND_FILTERS,
  clearRows,
  comingUpCards,
  foundEmpty,
  foundSearch,
  foundToday,
  thinWeekend,
  understoodRow,
  withAsText,
  withFoundState,
  type FoundFilters,
  type FoundSearch,
} from "@/lib/found/found-filters";
import {
  departmentName,
  foundTail,
  foundWords,
  visibleCards,
  type Category,
  type ExplorePlace,
  type FoundItemList,
} from "@/lib/found/found-words";
import { Screen } from "@/components/chrome/screen";
import { Button } from "@/components/ui/button";
import Link from "@/components/ui/link";
import {
  EmptyState,
  ErrorState,
  LoadingState,
  OfflineNotice,
  Skeleton,
  StaleNotice,
} from "@/components/states";
import { DepartmentChips } from "./department-chips";
import { FiltersButton, FoundFilterSheet } from "./filter-sheet";
import { FoundItemCard } from "./found-item-card";
import { FoundSearchBox } from "./found-search";
import { ReportSheet } from "./report-sheet";
import { UnderstoodRow } from "./understood-row";
import { WhenChips } from "./when-chips";

/**
 * What was found in a discover place (yuvoy-app#179, R2-T4): the heading,
 * the place's line, the place button, the department chips, and the cards,
 * with an honest foot.
 *
 * `/` renders this for a discover destination and today's reels `Feed` for a
 * bookable market, untouched. It is a list of article cards in a
 * `role="feed"`, not a reel strip: a found card has no film, and its job is
 * to be read and compared.
 *
 * ## The states, every one of them
 *
 * Branched on `isLoadingError` and `isFetchNextPageError` by name, never on
 * `isError` (banned in the lint config): a page that failed after the list was
 * on screen keeps the list and says so at the foot.
 *
 *   - **The server's first page failed** (`firstPage` null): the error with a
 *     retry, and nothing is asked until the retry. A 404 never reaches here:
 *     `/` shows the bookable feed with the gone line instead.
 *   - **Loading**: three skeleton cards, labelled for a screen reader.
 *   - **Empty place** and **empty department**, each with its way out.
 *   - **The foot**: more is loading, a later page failed (the list stays),
 *     the server stopped without a cursor (not the end, and never said as
 *     one), or the end the server declared.
 *   - **Offline**: the cached list under `OfflineNotice`.
 *   - **Stale**: half an hour after the list was read, `StaleNotice` says when
 *     by the place's clock, with Refresh.
 *
 * ## R3's chips, Filters and search (yuvoy-app#180)
 *
 * Only while `checkedCities` is open to the caller, which the server decided
 * (`checkedCities`): the search field, the day chips and Free with the
 * Filters button beside them, the understood row under a search, the
 * heading from the answer's `window` over a chosen day, R3's empty lines, and
 * Coming up on a thin weekend. Closed, none of it is drawn, nothing from the
 * address narrows, and the feed is exactly R2's. The sheet's How hard row
 * (yuvoy-app#195) is a local place's only (`local`).
 *
 * Every change is written into the address in place, like a department chip,
 * and starts the list again from page one (`useFoundFeed`'s key).
 *
 * ## The trigger is the place button
 *
 * The page hands in P1's place button and this draws it under the place line.
 * "Pick another place" (the empty place and the end) presses that same
 * button, so there is one picker and one way into it, and focus comes back to
 * the button the picker opened from.
 */
export function FoundFeed(props: {
  /** From the first page, or from the place list when the first page failed. */
  place: ExplorePlace;
  placeName: string;
  /** Null when the server's first page failed: the error, with a retry. */
  firstPage: FoundItemList | null;
  /** From `?category=`, already checked against the `Category` enum. */
  category: Category | null;
  /** Whether `checkedCities` is open to this caller, as the server decided. Closed when left out. */
  checkedCities?: boolean;
  /** The day, Free and Filters the server read from the address; only while `checkedCities` is open. */
  filters?: FoundFilters;
  /** The search the server read from the address; only while `checkedCities` is open. */
  search?: FoundSearch | null;
  /** The places a search's place chip may go to (`foundPlaceKeys`). */
  searchPlaces?: readonly string[];
  signedIn: boolean;
  /** The place button, drawn under the place line. */
  trigger: ReactNode;
}) {
  /*
    One view per place, department, filters and search the SERVER rendered.
    A new place, or a department or filter arriving in the address from
    outside (a link, Back), is a new server render with its own first page,
    and starts afresh rather than carrying the last place's chips, seed and
    hidden notes into it.
  */
  const narrowed = props.checkedCities
    ? JSON.stringify([props.filters ?? NO_FOUND_FILTERS, props.search ?? null])
    : "";
  return (
    <FoundFeedView
      key={`${props.place.key}|${props.category ?? ""}|${narrowed}`}
      {...props}
    />
  );
}

function FoundFeedView({
  place,
  placeName,
  firstPage,
  category: serverCategory,
  checkedCities = false,
  filters: serverFilters = NO_FOUND_FILTERS,
  search: serverSearch = null,
  searchPlaces = [],
  signedIn,
  trigger,
}: Parameters<typeof FoundFeed>[0]) {
  const headingId = useId();
  const comingId = useId();
  const heading = useRef<HTMLHeadingElement | null>(null);
  const list = useRef<HTMLDivElement | null>(null);
  const triggerSlot = useRef<HTMLDivElement | null>(null);

  /*
    The department on screen. Starts as the server's and changes with a chip,
    which writes `?category=` in place (`chooseCategory`). Once it has changed,
    the server's page one belongs to a list no longer on screen, and it is
    dropped for good rather than seeding the same department again later from
    a read long gone (the search screen's rule).
  */
  const [category, setCategory] = useState<Category | null>(serverCategory);
  // R3's, the same way; never anything but none while `checkedCities` is closed.
  const [filters, setFilters] = useState<FoundFilters>(
    checkedCities ? serverFilters : NO_FOUND_FILTERS,
  );
  const [search, setSearch] = useState<FoundSearch | null>(
    checkedCities ? serverSearch : null,
  );
  const [filtering, setFiltering] = useState(false);
  const [changed, setChanged] = useState(false);
  // When this view received the server's page: the stale line counts from here.
  const [receivedAt] = useState(() => Date.now());
  // After a failed server read nothing is asked until Try again.
  const [asked, setAsked] = useState(firstPage !== null);

  // How hard is matched on checked cards only, and a local place's are all checked.
  const local = place.kind === "local";
  const feed = useFoundFeed({
    placeKey: place.key,
    local,
    category,
    signedIn,
    seed: !changed && firstPage ? { page: firstPage, receivedAt } : null,
    enabled: asked || changed,
    filters,
    search,
  });
  const vocabulary = useVocabulary();
  const terms = vocabulary.data?.categories ?? null;
  const hidden = useHiddenCards();
  const online = useSyncExternalStore(
    subscribeOnline,
    onlineNow,
    onlineOnServer,
  );
  const stale = useStale(feed.dataUpdatedAt);
  const observe = useFoundShown("found_feed");
  const report = useReport({ list, heading });

  const pages = feed.data?.pages;
  const cards = visibleCards(pages, hidden.ids);
  const tail = foundTail(pages);

  /*
    Coming up (R3-T2): a weekend the server says is complete with fewer than
    three cards also reads the first page without the day, every other choice
    kept, and shows what starts in the next two weeks and is not already on
    screen. Asked only once the weekend is known to be thin.
  */
  const thin = checkedCities && thinWeekend(filters.when, tail, cards.length);
  const plain = useFoundFeed({
    placeKey: place.key,
    local,
    category,
    signedIn,
    enabled: thin,
    filters: { ...filters, when: null },
    search,
  });
  const coming =
    thin && plain.data
      ? comingUpCards(
          visibleCards(plain.data.pages.slice(0, 1), hidden.ids),
          cards,
          /*
            The place's today by the server's clock (the offset its Date
            header taught) when that page was read: drawn in the browser
            alone, since the server never seeds this read.
          */
          foundToday(plain.dataUpdatedAt + clockOffsetMs(), place.timezone),
        )
      : [];

  /*
    One change to what narrows the list: a department, R3's filters, or the
    search. Written in place, never navigated to: a navigation would ask the
    server for the whole page again, and the list is already being read from
    here. Replace, not push, as the search screen does: one list being
    narrowed. Every other parameter (`place`, a mocked build's `__scenario`)
    stays.
  */
  const narrow = (
    next: {
      category?: Category | null;
      filters?: FoundFilters;
      search?: FoundSearch | null;
    },
    /*
      "heading" when the control pressed goes as the list is read again (an
      understood chip, an empty state's button): focus moves to the page's
      heading, which stays, rather than falling to the body. The new list is
      said by the live line below.
    */
    then?: "heading",
  ) => {
    const nextCategory = next.category === undefined ? category : next.category;
    const nextFilters = next.filters ?? filters;
    const nextSearch = next.search === undefined ? search : next.search;
    if (
      nextCategory === category &&
      JSON.stringify([nextFilters, nextSearch]) ===
        JSON.stringify([filters, search])
    )
      return;
    setChanged(true);
    setCategory(nextCategory);
    setFilters(nextFilters);
    setSearch(nextSearch);
    const params = withFoundState(
      new URLSearchParams(window.location.search),
      nextFilters,
      local,
      nextSearch,
    );
    if (nextCategory) params.set("category", nextCategory);
    else params.delete("category");
    const query = params.toString();
    window.history.replaceState(
      null,
      "",
      `${window.location.pathname}${query ? `?${query}` : ""}`,
    );
    if (then === "heading") heading.current?.focus();
  };
  const chooseCategory = (next: Category | null) => narrow({ category: next });
  /*
    A new search is new words: none of them is kept as plain text yet. An
    empty field sent clears the search; words too short to search change
    nothing, so the applied search and the field's text both stay.
  */
  const searchFor = (typed: string) => {
    const next = foundSearch(typed);
    if (!next && typed.trim() !== "") return;
    narrow({ search: next });
  };
  const clearSearch = () => narrow({ search: null });

  /*
    What the words were taken to mean, as the list's first page says it. A
    place chip only for another place this caller can open, since all it does
    is take them there.
  */
  const understood = search
    ? understoodRow(
        pages?.[0]?.understood,
        (key) => key !== place.key && searchPlaces.includes(key),
      )
    : [];
  const searchIn = (key: string) => {
    const query = withFoundState(
      new URLSearchParams({ place: key }),
      NO_FOUND_FILTERS,
      false,
      search,
    ).toString();
    return `/?${query}`;
  };
  const windowLine = foundWords.windowHeading(filters.when, pages?.[0]?.window);

  // Presses the place button: one picker, one way in.
  const canPick = trigger !== null && trigger !== undefined;
  const pickAnother = () =>
    triggerSlot.current?.querySelector<HTMLElement>("button")?.click();
  const pickAnotherButton = canPick ? (
    <Button variant="outline" size="md" onClick={pickAnother}>
      {foundWords.pickAnother}
    </Button>
  ) : null;

  // The more-loading foot asks for the next page when it nears the screen.
  const foot = useNextPage({
    canAsk: feed.hasNextPage && !feed.isFetchingNextPage,
    ask: () => void feed.fetchNextPage(),
    pageCount: pages?.length ?? 0,
  });
  const reporting = report.item;

  /*
    Said politely once a list narrowed here lands: the focus stays on the
    control or moves to the heading, never onto the list, so without this a
    screen reader hears nothing come back. Empty while the new list is read,
    so the same words twice are still a change; counted from its first page,
    so scrolling on says nothing more. A count, never the empty state's own
    line, which is on screen already.
  */
  const pageOne = pages?.slice(0, 1);
  const landed =
    changed && feed.isSuccess
      ? foundWords.results(
          visibleCards(pageOne, hidden.ids).length,
          foundTail(pageOne) === "more",
        )
      : "";

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

  return (
    <Screen>
      <h1
        id={headingId}
        ref={heading}
        tabIndex={-1}
        className="font-display tracking-display leading-display text-forest text-3xl text-balance focus:outline-none"
      >
        {foundWords.heading(placeName)}
      </h1>
      <p className="text-body text-forest/70 mt-2 text-pretty">
        {foundWords.placeLine[place.kind]}
      </p>
      {canPick ? (
        <div ref={triggerSlot} className="mt-4">
          {trigger}
        </div>
      ) : null}

      {checkedCities ? (
        <>
          <div className="mt-4">
            <FoundSearchBox
              placeName={placeName}
              search={search}
              keep={[
                ...withFoundState(
                  new URLSearchParams(
                    category
                      ? { place: place.key, category }
                      : { place: place.key },
                  ),
                  filters,
                  local,
                  null,
                ),
              ]}
              onSearch={searchFor}
              onClear={clearSearch}
            />
          </div>
          <div className="mt-4">
            <WhenChips
              filters={filters}
              onChange={(next) => narrow({ filters: next })}
              after={
                <FiltersButton
                  filters={filters}
                  local={local}
                  onOpen={() => setFiltering(true)}
                />
              }
            />
          </div>
        </>
      ) : null}

      <div className={checkedCities ? "mt-3" : "mt-5"}>
        <DepartmentChips
          terms={terms}
          selected={category}
          onSelect={chooseCategory}
        />
      </div>

      {understood.length > 0 ? (
        <div className="mt-4">
          <UnderstoodRow
            chips={understood}
            onRemove={(chip) => {
              if (search)
                narrow({ search: withAsText(search, chip.from) }, "heading");
            }}
            placeHref={searchIn}
          />
        </div>
      ) : null}

      <div className="mt-5 space-y-3 empty:hidden">
        {!online && feed.data ? <OfflineNotice /> : null}
        {stale && feed.data ? (
          <StaleNotice onRefresh={() => void feed.refetch()}>
            {foundWords.stale(feed.dataUpdatedAt, place.timezone)}
          </StaleNotice>
        ) : null}
      </div>

      {windowLine && feed.data ? (
        <h2
          className="text-forest mt-5 font-bold text-pretty"
          data-testid="found-window"
        >
          {windowLine}
        </h2>
      ) : null}

      <div className="mt-5 flex-1">{body}</div>
      <p role="status" className="sr-only" data-testid="found-announce">
        {landed}
      </p>

      {thin ? (
        <div className="mt-2" data-testid="found-coming-up">
          {coming.length > 0 ? (
            <>
              <p className="text-body text-forest/80 text-pretty">
                {foundWords.thinWeekend}
              </p>
              <h2
                id={comingId}
                className="font-display tracking-display leading-display text-forest mt-4 text-2xl text-balance"
              >
                {foundWords.comingUp}
              </h2>
              <div
                role="feed"
                aria-labelledby={comingId}
                className="mt-4 space-y-3"
              >
                {coming.map((item, index) => (
                  <FoundItemCard
                    key={item.id}
                    item={item}
                    position={cards.length + index}
                    posInSet={index}
                    timezone={place.timezone}
                    departmentName={departmentName(item.department, terms)}
                    onReport={(id) => report.open(id, cards.length + index)}
                    observe={observe}
                    setSize={coming.length}
                  />
                ))}
              </div>
            </>
          ) : null}
          <p className="text-body text-forest/70 mt-6 text-pretty">
            {foundWords.askLead}{" "}
            <Link
              href="/help"
              className="text-forest tap-target font-bold underline underline-offset-4"
            >
              {foundWords.askLink}
            </Link>
          </p>
        </div>
      ) : null}

      {/* Opened only by Filters, which is drawn only while `checkedCities` is open. */}
      <FoundFilterSheet
        open={filtering}
        filters={filters}
        local={local}
        rows={vocabulary.data?.foundFilters}
        rowsPending={vocabulary.isPending}
        // The sheet's rows; the day is the chips', and stays.
        onApply={(next) => narrow({ filters: { ...next, when: filters.when } })}
        onClose={() => setFiltering(false)}
      />

      {reporting ? (
        <ReportSheet
          key={reporting.id}
          itemId={reporting.id}
          surface="found_feed"
          open={reporting.open}
          onOpenChange={(open) => {
            if (!open) report.close();
          }}
          signedIn={signedIn}
          onHidden={() => hidden.add(reporting.id)}
        />
      ) : null}
    </Screen>
  );
}

/*
  Whether the browser thinks it has a connection, as React Query does: the
  same signal that pauses a read, so the notice and the paused read agree.
*/
const subscribeOnline = (onChange: () => void) =>
  onlineManager.subscribe(() => onChange());
const onlineNow = () => onlineManager.isOnline();
const onlineOnServer = () => true;

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

/* ---------------------------------------------------------------- hooks -- */

/**
 * The one Report a problem sheet of this view, and where focus goes after it.
 *
 * Held here rather than in a card, because a report hides the card and the
 * sheet must outlive it to show the receipt. When it closes and the card is
 * still in the list, the sheet returns focus to the card's More button by
 * itself (the dialog's own return). When the card is gone, focus moves to the
 * card that took its place, or the one before it, or the heading: never left
 * on a node that no longer exists.
 */
function useReport({
  list,
  heading,
}: {
  list: RefObject<HTMLDivElement | null>;
  heading: RefObject<HTMLHeadingElement | null>;
}) {
  const [item, setItem] = useState<{
    id: string;
    index: number;
    open: boolean;
  } | null>(null);

  const open = (id: string, index: number) =>
    setItem({ id, index, open: true });

  const close = () => {
    // Closed already: asked twice, it is followed once.
    if (!item?.open) return;
    const { id, index } = item;
    setItem({ ...item, open: false });

    let done = false;
    const settle = () => {
      if (done) return;
      done = true;
      document.removeEventListener("close", settle, true);
      clearTimeout(timer);
      // After the dialog's own focus return, which runs as it closes.
      requestAnimationFrame(() => {
        const cards = [
          ...(list.current?.querySelectorAll<HTMLElement>(
            "article[data-found-id]",
          ) ?? []),
        ];
        if (cards.some((card) => card.dataset.foundId === id)) return;
        const next =
          cards[Math.min(index, cards.length - 1)] ?? heading.current;
        next?.focus();
      });
    };
    // A dialog's `close` does not bubble, but it is seen on the way down.
    document.addEventListener("close", settle, true);
    // And if the sheet leaves some other way, a second is long enough.
    const timer = setTimeout(settle, 1_000);
  };

  return { item, open, close };
}
