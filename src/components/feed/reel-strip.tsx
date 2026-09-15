"use client";

import { useEffect, useRef, type ReactNode } from "react";
import Link from "next/link";
import { ExperienceCard } from "./experience-card";
import { Wordmark } from "@/components/ui/wordmark";
import { LoginButton } from "@/components/auth/login-button";
import { useFeedStore, detectAutoplayAllowed } from "@/lib/feed/store";
import type { FeedTail, Reel } from "@/lib/feed/reels";
import { cn } from "@/lib/cn";

/**
 * The vertical reel scroller, with no opinion about where the reels came from.
 *
 * ## Why this is its own component
 *
 * There are four surfaces that show reels this way and they are the same
 * scroller every time: the feed, a shared reel opened by its own link
 * (yuvoy-app#36), the search grid's reel view (#37), and a business's own
 * reels (#33). Each has a different query behind it, a different chrome over
 * it and a different back, and none of that is the scroller's business.
 *
 * What IS the scroller's business is the part that took three attempts to get
 * right in `Feed` and would take three more in every copy of it: one
 * IntersectionObserver deciding the active card, a second on the tail fetching
 * two screens early and rebuilt when a page lands, the preload budget, the
 * `aria-setsize` claim, and the three different things the bottom of an
 * infinite list is allowed to say. Copying that per surface is how three of
 * them end up subtly wrong.
 *
 * Scroll snapping is CSS, not JS: a scroll handler fighting the browser's own
 * momentum is what makes a JS-driven feed feel heavy on a mid-range Android.
 */

/** The well's geometry, shared by the strip and by every state beside it. */
export const REEL_WELL =
  "bg-abyss relative h-dvh w-full lg:h-[calc(100dvh-3rem)] lg:rounded-sheet lg:ring-1 lg:ring-cream/10";

/**
 * How a message sits in the well, for the states that are one block of text.
 *
 * Both axes needed saying. `items-center` alone centres only the cross axis,
 * and the block sizes to its content (a `max-w-sm` body inside `px-6`, so
 * 432px), which left it flush against the left edge of a 480px well with 48px
 * of dead space beside it.
 *
 * `pb-17` is 68px: the bar's own 56px (44px targets in a `p-1.5` pill) plus
 * its 12px foot. The bar FLOATS over the well rather than sitting under it, so
 * centring against the well's full height put the message 34px below the
 * middle of the part a traveller can actually see. Cancelled from `lg` up,
 * where the rail takes over and nothing covers the well.
 */
export const REEL_WELL_CENTRED =
  "flex items-center justify-center pb-17 lg:pb-0";

/** The well, for the states that do not scroll. */
export function ReelFrame({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className="container-feed relative lg:my-6">
      <div className={cn(REEL_WELL, "lg:overflow-hidden", className)}>
        {children}
      </div>
    </div>
  );
}

/**
 * The mark that floats over a reel on a phone. The rail carries it on desktop.
 *
 * ## Top left, and without the tagline — yuvoy-app#36
 *
 * It was centred, and it was the full delivered lockup, which put "Experience
 * more." in handwriting across the top of every clip. The tagline is baked
 * into that SVG, so the fix is a second asset rather than a class: see
 * `scripts/generate-feed-lockup.mjs`, which derives the ensō and the YUVOY
 * caps from the delivered file and re-centres them.
 *
 * ## The geometry is measured, not chosen
 *
 * The block is 16px above the row, a 44px row, and 48px of tail: 108px, and
 * `feed-scrim-top`'s stops are percentages of exactly that. The mark is `h-7`
 * centred in the row, so it occupies 24px to 52px, which is 22% to 48% of the
 * gradient. Changing the padding or the height without changing the stops
 * slides the mark into a lighter band with every contrast test still passing,
 * which is the quietest way to break this; `palette.test.ts` pins all of it.
 *
 * The row is 44px because `LoginButton` is `size="md"` and is the tallest thing
 * in it (yuvoy-app#56). It was 28px, the mark alone, until 14 September, and
 * this arithmetic did not follow at the time: both the comment and the test
 * still described a 124px block that had become 140px. Both are corrected here
 * along with the tail, which came down from 80px to 48px when the owner asked
 * for less shade over the picture.
 *
 * `h-7` rather than the lockup's `h-9`: the ensō is 70% of the delivered
 * drawing's height and 95% of the compact one, so the same class would have
 * made the mark itself a third bigger. 28px keeps the ensō the size it has
 * always been on this screen.
 *
 * ## Inert on the feed, a link on a shared reel
 *
 * With nothing to press, `pointer-events-none` runs the full width and the
 * whole top of a reel scrolls the strip. It used to carry a Search disc while
 * the floating bar two inches below carried the same destination — two
 * controls for one screen, on the smallest surface in the product.
 *
 * `href` turns the mark into a way in, and only `/r/{id}` passes one: somebody
 * opening a shared clip from a message has no history to go back to and no
 * reason to know there is an app around it.
 */
export function ReelMasthead({ href }: { href?: string }) {
  return (
    /*
      `justify-between` puts Login opposite the mark. The strip stays
      `pointer-events-none` across its full width so the whole top of a reel
      still scrolls the feed; only the mark's link and the button take a press
      (yuvoy-app#56 item 2). Getting that wrong makes a two-inch band at the
      top of every reel dead to a swipe, which is where a thumb rests.
    */
    <div className="feed-scrim-top pointer-events-none absolute inset-x-0 top-0 z-20 flex items-start justify-between gap-3 px-5 pt-4 pb-12 lg:hidden">
      {href ? (
        <Link
          href={href}
          className="pointer-events-auto flex min-h-11 items-center"
          aria-label="Yuvoy home"
        >
          <Wordmark tone="cream" className="h-7" priority />
        </Link>
      ) : (
        <Wordmark tone="cream" className="h-7" priority />
      )}
      <LoginButton className="pointer-events-auto" />
    </div>
  );
}

export function ReelStrip({
  items,
  tail,
  hasNextPage,
  isFetchingNextPage,
  isFetchNextPageError,
  fetchNextPage,
  chrome,
  emptyTailNote,
  initialIndex = 0,
}: {
  /** In the server's order. Never re-sorted here — see `useReels`. */
  items: Reel[];
  tail: FeedTail;
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  isFetchNextPageError: boolean;
  fetchNextPage: () => void;
  /** Floats over the strip: a masthead, a way back. Positioned by the caller. */
  chrome?: ReactNode;
  /**
   * What the bottom says once there is provably nothing more.
   *
   * The feed says everything on sale; a business's reels say everything that
   * business has filmed. Same three-way logic, different subject, so the
   * sentence is the caller's and the logic is not.
   */
  emptyTailNote?: string;
  /**
   * Which reel the strip opens on.
   *
   * A grid that plays in place has to start where the thumb landed, and
   * swiping on from there has to continue the same sequence — Instagram's
   * behaviour, and what yuvoy-app#33 and #37 both ask for. Zero everywhere
   * else.
   */
  initialIndex?: number;
}) {
  const setActiveIndex = useFeedStore((s) => s.setActiveIndex);
  const setAutoplayAllowed = useFeedStore((s) => s.setAutoplayAllowed);
  const activeIndex = useFeedStore((s) => s.activeIndex);
  const muted = useFeedStore((s) => s.muted);
  const autoplayAllowed = useFeedStore((s) => s.autoplayAllowed);
  const shouldMount = useFeedStore((s) => s.shouldMount);
  const resetFeed = useFeedStore((s) => s.resetFeed);

  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  // Decide once, on mount, whether video may autoplay at all.
  useEffect(() => {
    setAutoplayAllowed(detectAutoplayAllowed());
  }, [setAutoplayAllowed]);

  /**
   * The active index belongs to a MOUNTED strip and to nothing else.
   *
   * The store outlives this component — it is a module, not a context — so a
   * traveller who reaches reel nine of the feed, opens a business page and
   * lands on its four reels would otherwise arrive with `activeIndex` at 9:
   * out of range, no card mounted by the preload budget, and a black well
   * until they scroll. Reset on mount because the scroller is a new element at
   * scrollTop 0, and on unmount because whatever comes next is not this strip.
   */
  useEffect(() => {
    resetFeed();
    return resetFeed;
  }, [resetFeed]);

  /**
   * Opening on a reel other than the first, for a grid that plays in place.
   *
   * ## Why `scrollTop` rather than `scrollTo`
   *
   * A smooth scroll through forty snap children is forty snap decisions and
   * lands somewhere the browser chose, so this has to be instant: the strip
   * must be on the tile the thumb hit before paint, with no flash of the first
   * reel and no travel. `scrollTop` IS instant by definition, needs no options
   * bag, and exists on every element everywhere — `scrollTo` is not
   * implemented on elements in jsdom, so the first version of this threw in
   * every unit test that opened a reel other than the first.
   *
   * ## Why `activeIndex` is set here rather than left to the observer
   *
   * The observer reports on intersection change, and it is set up in the same
   * commit as this scroll. The card at `initialIndex` may already be
   * intersecting by the time it attaches, in which case nothing ever fires and
   * the strip would play reel zero while showing reel five. Setting it here
   * makes the two agree from the first frame; the observer takes over on the
   * next real move, and its own same-index guard keeps that from being a
   * second render.
   *
   * `items.length` is in the deps, not `initialIndex`: the target card does
   * not exist until the page holding it has loaded, and a strip deep-linked
   * into page three mounts empty and fills in. Guarded so it runs once per
   * arrival rather than yanking the scroller back every time a page lands.
   */
  const jumped = useRef(false);
  useEffect(() => {
    if (jumped.current || initialIndex <= 0) return;
    const scroller = scrollerRef.current;
    if (!scroller || items.length <= initialIndex) return;

    jumped.current = true;
    scroller.scrollTop = scroller.clientHeight * initialIndex;
    setActiveIndex(initialIndex);
  }, [initialIndex, items.length, setActiveIndex]);

  /**
   * How many reels this strip HAS, or `-1` for "nobody knows yet".
   *
   * `aria-setsize` is a claim, and paging made the obvious value a false one:
   * `items.length` on a first page of twelve tells a screen reader user "1 of
   * 12" about a feed with forty in it, and then silently renumbers everything
   * when page two lands. `-1` is ARIA's own word for an unknown total and is
   * the honest answer until the server says `complete`.
   *
   * `server_stopped` counts as unknown too: the server stopped without a
   * cursor, which the contract is explicit is not the same as the feed having
   * ended, so the count in hand is not the total either.
   */
  const setSize = tail === "complete" ? items.length : -1;

  /**
   * ONE observer for the whole strip, wired in an effect.
   *
   * Three attempts led here, and the first two are worth recording.
   *
   * A per-card ref that returned nothing leaked an IntersectionObserver per
   * card per mount — React 19 runs a ref callback's returned cleanup on
   * detach, and that return is the only thing releasing the observer.
   *
   * Returning the cleanup fixed the leak but not the churn: an inline ref
   * arrow changes identity every render, so React re-attached every ref and
   * rebuilt every observer — and this component re-renders on every scroll,
   * because that is how activeIndex updates. Memoising the callbacks fixed
   * that but required reading a ref during render, which is not allowed.
   *
   * One observer over the scroller's children sidesteps all of it: it is set
   * up once per item count, torn down once, and the index travels on the DOM
   * node as a data attribute rather than through a closure.
   */
  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const index = Number(
            (entry.target as HTMLElement).dataset.feedIndex ?? "-1",
          );
          if (index >= 0) setActiveIndex(index);
        }
      },
      { threshold: 0.6, root: scroller },
    );

    for (const card of scroller.querySelectorAll("[data-feed-index]")) {
      observer.observe(card);
    }

    return () => observer.disconnect();
    // Re-runs when the item count changes, which is when a page arrives.
  }, [items.length, setActiveIndex]);

  /**
   * The decision to fetch, kept in a ref so the observer below never has to be
   * rebuilt to see a fresh one.
   *
   * Assigned in an effect rather than during render — writing a ref during
   * render is what React forbids, and the reason the active-card observer
   * above ended up on its third design. The guard lives here rather than in
   * the observer's dependency list, so a fetch starting and finishing does not
   * tear an IntersectionObserver down and build another.
   *
   * **A failed page is deliberately NOT guarded out**, and that is what makes
   * the retry work without a control. An IntersectionObserver reports CHANGES
   * in intersection, so a sentinel that is already on screen and stays there
   * cannot ask twice — the only thing that fires it again is the traveller
   * scrolling away and back, which is a deliberate act and exactly the gesture
   * somebody makes when a feed stops. The tail says so in words.
   *
   * That is also why there is no Try again button: `role="feed"` may not
   * contain one. See the tail.
   */
  const loadMore = useRef<() => void>(() => {});
  useEffect(() => {
    loadMore.current = () => {
      if (hasNextPage && !isFetchingNextPage) fetchNextPage();
    };
  });

  /**
   * The infinite scroll — one observer on the tail, not on every card.
   *
   * `rootMargin: "200% 0px"` fires it two screens early, so on a snap scroller
   * the next page is in flight while the traveller is still two cards away.
   * The alternative — firing when the tail is actually visible — means the
   * traveller reaches the end and waits there, which is precisely the moment a
   * feed feels broken.
   *
   * **Rebuilt when a page arrives**, which is what `items.length` is doing in
   * the dependency list and is not a leftover. An IntersectionObserver reports
   * CHANGES in intersection: if the tail is still on screen after page two
   * lands — a short page, a tall phone — no further entry ever fires and the
   * feed stalls one page in, with a sentinel sitting in view doing nothing. A
   * fresh observer re-reports the current state immediately. It costs one
   * observer per page, not one per scroll.
   */
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || !hasNextPage) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) loadMore.current();
      },
      { root: scrollerRef.current, rootMargin: "200% 0px" },
    );
    observer.observe(sentinel);

    return () => observer.disconnect();
  }, [hasNextPage, items.length]);

  return (
    <div className="container-feed relative lg:my-6">
      {chrome}
      <div
        ref={scrollerRef}
        className={cn(
          REEL_WELL,
          "snap-y snap-mandatory overflow-y-auto overscroll-y-contain",
        )}
        // A list of experiences; announce it as one.
        role="feed"
      >
        {/*
          Keyed by the CLIP, not the listing. One listing may appear several
          times with a different reel each — that is the whole point of
          `/reels` — and keying by `experience.id` would give React duplicate
          keys, unmount the wrong card on a refetch, and hand one clip's player
          state to another.
        */}
        {items.map((reel, i) => (
          <ExperienceCard
            key={reel.media!.id}
            experience={reel.experience!}
            media={reel.media}
            index={i}
            total={setSize}
            active={i === activeIndex}
            mounted={shouldMount(i)}
            muted={muted}
            autoplayAllowed={autoplayAllowed}
          />
        ))}

        {/*
          The bottom, and the sentinel that fetches before a traveller gets
          here.

          The completeness claim is the server's, not ours. `complete` is told;
          a short page is never read as an ending, because a page that happens
          to come back exactly full would stop the scroll early and a silently
          stopped scroll looks identical to one with nothing more to show — so
          nobody reports it.

          Four things can be true here and they read differently, which is the
          point: more is coming, more failed to come, the list ended, or the
          server stopped without a cursor to follow.
        */}
        <div
          ref={sentinelRef}
          className="tabbar-clearance flex snap-start items-center justify-center px-8 pt-12 text-center"
        >
          {isFetchNextPageError ? (
            <p className="text-cream/60 text-xs">
              More reels did not load: usually the island signal rather than
              you. Scroll up and back down to try again.
            </p>
          ) : hasNextPage || isFetchingNextPage ? (
            /*
              Deliberately not a spinner and deliberately not "the end". The
              sentinel fires two screens early, so a traveller reaching this is
              already past where more should have arrived — and a spinner that
              is usually gone before anybody sees it is a flicker at the bottom
              of every scroll.
            */
            <p className="text-cream/60 text-xs">Loading more reels…</p>
          ) : tail === "complete" ? (
            <p className="text-cream/60 text-xs">
              {emptyTailNote ?? "That is everything on sale right now."}
            </p>
          ) : (
            /*
              `complete: false` with no `nextCursor` — the contract's own third
              case, "a different thing from the feed having ended". There is
              nothing to page to, so this cannot be a retry of the next page;
              refetching from the top is the only move that exists, and the
              copy does not claim an ending it was not told about.
            */
            <p className="text-cream/60 text-xs">
              That is as far as we can load right now, not the end of what is on
              sale. Reload to try again.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
