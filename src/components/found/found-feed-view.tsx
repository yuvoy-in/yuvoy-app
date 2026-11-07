"use client";

import { useId, useRef, useState, useSyncExternalStore } from "react";
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
  comingUpCards,
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
} from "@/lib/found/found-words";
import { Screen } from "@/components/chrome/screen";
import { Button } from "@/components/ui/button";
import Link from "@/components/ui/link";
import { OfflineNotice, StaleNotice } from "@/components/states";
import { DepartmentChips } from "./department-chips";
import { FiltersButton, FoundFilterSheet } from "./filter-sheet";
import { FoundItemCard } from "./found-item-card";
import type { FoundFeed } from "./found-feed";
import { FeedBody } from "./found-feed-body";
import {
  onlineNow,
  onlineOnServer,
  subscribeOnline,
  useReport,
} from "./found-feed-parts";
import { FoundSearchBox } from "./found-search";
import { ReportSheet } from "./report-sheet";
import { UnderstoodRow } from "./understood-row";
import { WhenChips } from "./when-chips";

export function FoundFeedView({
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

  const body = (
    <FeedBody
      asked={asked}
      changed={changed}
      setAsked={setAsked}
      feed={feed}
      placeName={placeName}
      cards={cards}
      tail={tail}
      category={category}
      terms={terms}
      checkedCities={checkedCities}
      filters={filters}
      local={local}
      search={search}
      narrow={narrow}
      pickAnotherButton={pickAnotherButton}
      list={list}
      headingId={headingId}
      place={place}
      report={report}
      observe={observe}
      foot={foot}
    />
  );

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
