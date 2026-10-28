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
import { useVocabulary } from "@/lib/search/use-search-reels";
import {
  useFoundFeed,
  useHiddenCards,
  useNextPage,
  useStale,
} from "@/lib/found/use-found-feed";
import { useFoundShown } from "@/lib/found/found-outcomes";
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
import {
  EmptyState,
  ErrorState,
  LoadingState,
  OfflineNotice,
  Skeleton,
  StaleNotice,
} from "@/components/states";
import { DepartmentChips } from "./department-chips";
import { FoundItemCard } from "./found-item-card";
import { ReportSheet } from "./report-sheet";

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
  signedIn: boolean;
  /** The place button, drawn under the place line. */
  trigger: ReactNode;
}) {
  /*
    One view per place and department the SERVER rendered. A new place, or a
    department arriving in the address from outside (a link, Back), is a new
    server render with its own first page, and starts afresh rather than
    carrying the last place's chips, seed and hidden notes into it.
  */
  return (
    <FoundFeedView
      key={`${props.place.key}|${props.category ?? ""}`}
      {...props}
    />
  );
}

function FoundFeedView({
  place,
  placeName,
  firstPage,
  category: serverCategory,
  signedIn,
  trigger,
}: Parameters<typeof FoundFeed>[0]) {
  const headingId = useId();
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
  const [changed, setChanged] = useState(false);
  // When this view received the server's page: the stale line counts from here.
  const [receivedAt] = useState(() => Date.now());
  // After a failed server read nothing is asked until Try again.
  const [asked, setAsked] = useState(firstPage !== null);

  const feed = useFoundFeed({
    placeKey: place.key,
    category,
    signedIn,
    seed: !changed && firstPage ? { page: firstPage, receivedAt } : null,
    enabled: asked || changed,
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

  const chooseCategory = (next: Category | null) => {
    if (next === category) return;
    setChanged(true);
    setCategory(next);
    /*
      Written in place, never navigated to: a navigation would ask the server
      for the whole page again, and the list is already being read from here.
      Replace, not push, as the search screen does: one list being narrowed.
      Every other parameter (`place`, a mocked build's `__scenario`) stays.
    */
    const params = new URLSearchParams(window.location.search);
    if (next) params.set("category", next);
    else params.delete("category");
    const query = params.toString();
    window.history.replaceState(
      null,
      "",
      `${window.location.pathname}${query ? `?${query}` : ""}`,
    );
  };

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
    body = category ? (
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
            onClick={() => chooseCategory(null)}
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

      <div className="mt-5">
        <DepartmentChips
          terms={terms}
          selected={category}
          onSelect={chooseCategory}
        />
      </div>

      <div className="mt-5 space-y-3 empty:hidden">
        {!online && feed.data ? <OfflineNotice /> : null}
        {stale && feed.data ? (
          <StaleNotice onRefresh={() => void feed.refetch()}>
            {foundWords.stale(feed.dataUpdatedAt, place.timezone)}
          </StaleNotice>
        ) : null}
      </div>

      <div className="mt-5 flex-1">{body}</div>

      {reporting ? (
        <ReportSheet
          key={reporting.id}
          itemId={reporting.id}
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
          <p className="text-body text-forest/70">
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
    let timer: ReturnType<typeof setTimeout> | undefined;
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
    timer = setTimeout(settle, 1_000);
  };

  return { item, open, close };
}
