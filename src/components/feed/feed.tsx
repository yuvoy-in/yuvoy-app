"use client";

import { useEffect, useRef } from "react";
import { useFeed, flattenFeed, type FeedFilters } from "@/lib/feed/use-feed";
import type { components } from "@/lib/api/schema.gen";
import { useFeedStore, detectAutoplayAllowed } from "@/lib/feed/store";
import { ExperienceCard } from "./experience-card";
import {
  EmptyState,
  ErrorState,
  LoadingState,
  Skeleton,
} from "@/components/states";

/**
 * The reels feed — T2, the core of the product.
 *
 * Scroll snapping is CSS, not JS: a scroll handler that fights the browser's
 * own momentum is what makes a JS-driven feed feel heavy on a mid-range
 * Android. The only JS in the scroll path is one IntersectionObserver deciding
 * which card is active.
 *
 * All seven states are here. The offline and stale ones arrive with the
 * service worker; the other five are live.
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
 * the app's front door — the page that takes the ROOT DOMAIN at launch — as
 * having no subject.
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
  filters = {},
  initialPage,
  initialFetchedAt,
}: {
  filters?: FeedFilters;
  /** The first page, server-rendered. See app/page.tsx for why. */
  initialPage?: components["schemas"]["ExperiencePage"] | null;
  /** When the server fetched it. Epoch ms. */
  initialFetchedAt?: number;
}) {
  const {
    data,
    error,
    isPending,
    isError,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    refetch,
  } = useFeed(filters, initialPage, initialFetchedAt);

  const setActiveIndex = useFeedStore((s) => s.setActiveIndex);
  const setAutoplayAllowed = useFeedStore((s) => s.setAutoplayAllowed);
  const activeIndex = useFeedStore((s) => s.activeIndex);
  const muted = useFeedStore((s) => s.muted);
  const autoplayAllowed = useFeedStore((s) => s.autoplayAllowed);
  const shouldMount = useFeedStore((s) => s.shouldMount);

  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  // Decide once, on mount, whether video may autoplay at all.
  useEffect(() => {
    setAutoplayAllowed(detectAutoplayAllowed());
  }, [setAutoplayAllowed]);

  const items = flattenFeed(data?.pages);

  /**
   * ONE observer for the whole feed, wired in an effect.
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

  // Infinite scroll. Fires early enough that the next page is usually there
  // before the traveller reaches it, which on a slow connection is the whole
  // difference between a feed and a series of waits.
  useEffect(() => {
    const node = sentinelRef.current;
    if (!node || !hasNextPage || isFetchingNextPage) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) void fetchNextPage();
      },
      { root: scrollerRef.current, rootMargin: "200% 0px" },
    );
    obs.observe(node);
    return () => obs.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  /* ------------------------------------------------------------- loading */
  if (isPending) {
    return (
      <>
        <FeedHeading />
        <LoadingState label="Loading experiences">
          <div className="container-feed h-[calc(100dvh-3.5rem)] p-4 lg:h-dvh">
            <Skeleton className="h-full w-full" />
          </div>
        </LoadingState>
      </>
    );
  }

  /* --------------------------------------------------------------- error */
  if (isError) {
    return (
      <>
        <FeedHeading />
        <div className="container-feed flex h-[calc(100dvh-3.5rem)] items-center lg:h-dvh">
          <ErrorState
            error={error}
            onRetry={() => void refetch()}
            tone="abyss"
          />
        </div>
      </>
    );
  }

  /* --------------------------------------------------------------- empty */
  if (items.length === 0) {
    return (
      <>
        <FeedHeading />
        <div className="container-feed flex h-[calc(100dvh-3.5rem)] items-center lg:h-dvh">
          <EmptyState
            tone="abyss"
            title="Nothing bookable here yet"
            body="No operator has put anything on sale for this filter. Try another destination, or come back closer to the season."
          />
        </div>
      </>
    );
  }

  /* ------------------------------------------------------------- success */
  return (
    <>
      <FeedHeading />
      <div
        ref={scrollerRef}
        className="container-feed h-[calc(100dvh-3.5rem)] snap-y snap-mandatory overflow-y-auto overscroll-y-contain lg:h-dvh"
        // The feed is a list of experiences; announce it as one.
        role="feed"
        aria-busy={isFetchingNextPage}
      >
        {items.map((experience, i) => (
          <ExperienceCard
            key={experience.id}
            experience={experience}
            index={i}
            total={items.length}
            active={i === activeIndex}
            mounted={shouldMount(i)}
            muted={muted}
            autoplayAllowed={autoplayAllowed}
          />
        ))}

        {/* Sentinel. Only rendered while the server says there is more. */}
        {hasNextPage ? (
          <div ref={sentinelRef} className="h-px w-full" aria-hidden="true" />
        ) : null}

        {isFetchingNextPage ? (
          <div className="flex h-24 items-center justify-center">
            <span className="label text-cream/60">Loading more</span>
          </div>
        ) : null}

        {/*
        The end of the feed, stated. `complete` is told by the server, never
        inferred from a short page.
      */}
        {!hasNextPage ? (
          <div className="flex h-32 snap-start items-center justify-center px-8 text-center">
            <p className="text-cream/60 text-xs">
              That is everything on sale right now.
            </p>
          </div>
        ) : null}
      </div>
    </>
  );
}
