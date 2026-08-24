"use client";

import { useEffect, useRef, useCallback } from "react";
import { useFeed, flattenFeed, type FeedFilters } from "@/lib/feed/use-feed";
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
export function Feed({ filters = {} }: { filters?: FeedFilters }) {
  const {
    data,
    error,
    isPending,
    isError,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    refetch,
  } = useFeed(filters);

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
   * A STABLE ref callback per card index.
   *
   * Two bugs live here if this is written the obvious way.
   *
   * The first: returning nothing (or discarding the return with `void`) means
   * the IntersectionObserver is never disconnected. React 19 runs a ref
   * callback's returned cleanup on detach, and that return is the only thing
   * releasing the observer.
   *
   * The second is worse and less visible: an INLINE arrow in the JSX has a new
   * identity on every render, so React detaches and re-attaches every ref —
   * tearing down and rebuilding every card's observer — and this component
   * re-renders on every scroll, because that is how `activeIndex` updates. The
   * callbacks are therefore memoised per index and reused.
   */
  const refCallbacks = useRef(
    new Map<number, (node: HTMLElement | null) => (() => void) | undefined>(),
  );

  const cardRef = useCallback(
    (index: number) => {
      const existing = refCallbacks.current.get(index);
      if (existing) return existing;

      const fn = (node: HTMLElement | null) => {
        if (!node) return undefined;
        const obs = new IntersectionObserver(
          (entries) => {
            for (const e of entries) {
              if (e.isIntersecting) setActiveIndex(index);
            }
          },
          { threshold: 0.6, root: scrollerRef.current },
        );
        obs.observe(node);
        return () => obs.disconnect();
      };

      refCallbacks.current.set(index, fn);
      return fn;
    },
    [setActiveIndex],
  );

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
      <LoadingState label="Loading experiences">
        <div className="container-feed h-[calc(100dvh-3.5rem)] p-4 lg:h-dvh">
          <Skeleton className="h-full w-full" />
        </div>
      </LoadingState>
    );
  }

  /* --------------------------------------------------------------- error */
  if (isError) {
    return (
      <div className="container-feed flex h-[calc(100dvh-3.5rem)] items-center lg:h-dvh">
        <ErrorState error={error} onRetry={() => void refetch()} tone="abyss" />
      </div>
    );
  }

  /* --------------------------------------------------------------- empty */
  if (items.length === 0) {
    return (
      <div className="container-feed flex h-[calc(100dvh-3.5rem)] items-center lg:h-dvh">
        <EmptyState
          tone="abyss"
          title="Nothing bookable here yet"
          body="No operator has put anything on sale for this filter. Try another destination, or come back closer to the season."
        />
      </div>
    );
  }

  /* ------------------------------------------------------------- success */
  return (
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
          ref={cardRef(i)}
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
          <span className="label text-cream/50">Loading more</span>
        </div>
      ) : null}

      {/*
        The end of the feed, stated. `complete` is told by the server, never
        inferred from a short page.
      */}
      {!hasNextPage ? (
        <div className="flex h-32 snap-start items-center justify-center px-8 text-center">
          <p className="text-cream/50 text-xs">
            That is everything on sale right now.
          </p>
        </div>
      ) : null}
    </div>
  );
}
