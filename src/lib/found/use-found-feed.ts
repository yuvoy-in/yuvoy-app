"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { api, createProxyClient } from "@/lib/api/client";
import { qk } from "@/lib/query/policy";
import { HIDDEN_CARDS_CHANGED, hiddenCardIds } from "./device-store";
import {
  NO_FOUND_FILTERS,
  foundFilterKey,
  foundListQuery,
  type FoundFilters,
  type FoundSearch,
} from "./found-filters";
import {
  FOUND_PAGE_SIZE,
  FOUND_STALE_AFTER_MS,
  type Category,
  type FoundItemList,
} from "./found-words";

/*
  The feed's hooks, and nothing else: the page size, the types and the pure
  helpers live in `./found-words.ts`, which declares no client boundary, so
  the server's first page can read them (`pnpm qa`, 7b).
*/

/**
 * How long a place's found feed is kept, and when it is read again.
 *
 * A found feed is not shuffled (unlike the reels, `CACHE.reelVisit`), so a
 * refetch is not a different feed. But it IS a re-walk of every page loaded,
 * under the reader's thumb, and the cards move only when staff check one or a
 * finder run lands, which is hours, not seconds. So nothing refetches behind
 * the reader: after half an hour the screen says the list is from earlier
 * and offers Refresh, and the reader decides. The same half hour is how long
 * an unwatched place stays in memory.
 *
 * Here rather than in `CACHE` (`lib/query/policy.ts`) only because that file
 * belongs to another part of yuvoy-app#179; it can move there unchanged.
 */
export const FOUND_FEED_CACHE = {
  staleTime: 30 * 60_000,
  gcTime: 30 * 60_000,
  refetchOnWindowFocus: false,
  refetchOnReconnect: false,
} as const;

/**
 * One place's found feed, `GET /events`, a page at a time (yuvoy-app#179).
 *
 * ## Page one comes from the server; the rest from here
 *
 * The server render fetched page one with the session and the visitor's
 * address (`firstFoundPage`), and it is handed in as `initialData` so the
 * browser does not ask again. Only the department it was fetched for: a
 * different chip is a different list, read from its own first page, because
 * "a cursor belongs to the filters it was minted under".
 *
 * ## Signed in through the proxy, signed out straight to the API
 *
 * Signed in, the session lives in an HttpOnly cookie the browser cannot read,
 * and `/api/v1/events` attaches it (`createProxyClient`, the proxied paths
 * list). That is what lets a staff number page through a place still at the
 * staff stage. Signed out there is nothing to attach, so the plain client goes
 * straight to the API and skips a hop.
 *
 * ## `complete` is read, never inferred
 *
 * `getNextPageParam` stops on `complete: true` first, so a complete page with
 * a stray cursor is still the end, and passes the server's own cursor back
 * untouched otherwise. A page answering `complete: false` with no cursor stops
 * the paging too, but it is NOT the end: `foundTail` tells the two apart for
 * the foot of the screen.
 *
 * ## The chips, Filters and search are in the key
 *
 * R3's day, Free, Filters and search (yuvoy-app#180) narrow the same list,
 * and the key's filter slot and the request are built from the same object
 * (`foundFilterKey`, `foundListQuery`), so a cursor only ever goes back with
 * the filters, `q` and `asText` it was minted under, and a change to any of
 * them starts again from page one. With nothing chosen the slot is empty and
 * the request is R2's.
 *
 * ## The server's order, untouched
 *
 * "Ordered by local day, checked before found within a day, then start time,
 * then department". Re-sorting it here would be ranking, which the web does
 * not do.
 */
export function useFoundFeed(options: {
  placeKey: string;
  category: Category | null;
  signedIn: boolean;
  /**
   * Page one from the server render, for THIS place, department, filters
   * and search only, and when this view received it. Left out, the list is read from here.
   */
  seed?: { page: FoundItemList; receivedAt: number } | null;
  /** False asks nothing until it turns true (after a failed server read, until Try again). */
  enabled?: boolean;
  /** R3's day, Free and Filters; nothing chosen when left out. */
  filters?: FoundFilters;
  /** R3's search, or none. */
  search?: FoundSearch | null;
}) {
  const {
    placeKey,
    category,
    signedIn,
    seed,
    enabled = true,
    filters = NO_FOUND_FILTERS,
    search = null,
  } = options;
  const narrow = foundListQuery(filters, search);
  return useInfiniteQuery({
    queryKey: qk.foundFeed(placeKey, category, foundFilterKey(filters, search)),
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam, signal }): Promise<FoundItemList> => {
      const client = signedIn ? createProxyClient() : api;
      const { data, error } = await client.GET("/events", {
        params: {
          query: {
            destinationKey: placeKey,
            limit: FOUND_PAGE_SIZE,
            ...(category ? { category } : {}),
            ...narrow,
            // Omitted on the first page: an empty cursor is a different request.
            ...(pageParam ? { cursor: pageParam } : {}),
          },
        },
        signal,
      });
      if (error) throw error;
      return data;
    },
    getNextPageParam: (last) =>
      last.complete ? undefined : last.nextCursor || undefined,
    enabled,
    ...(seed
      ? {
          initialData: { pages: [seed.page], pageParams: [undefined] },
          /*
            When this view received it, not "now" at some later render: the
            stale line is measured from here. Without a stamp the seed would
            count as infinitely stale and be fetched again on hydration,
            throwing away the server's work (`pnpm qa`, 9).
          */
          initialDataUpdatedAt: seed.receivedAt,
        }
      : {}),
    ...FOUND_FEED_CACHE,
  });
}

/**
 * The cards this browser hides: the device's list, read on arrival and again
 * whenever a card is hidden anywhere (`HIDDEN_CARDS_CHANGED`), plus this
 * view's own notes, which survive a browser that refuses to store the list.
 */
export function useHiddenCards() {
  const [ids, setIds] = useState<ReadonlySet<string>>(() => new Set());
  // Stable, so the listener below is bound once.
  const add = useCallback(
    (id: string) =>
      setIds((was) => {
        const clean = id.toLowerCase();
        if (was.has(clean)) return was;
        return new Set([...was, clean]);
      }),
    [],
  );

  useEffect(() => {
    let live = true;
    const read = () => {
      void hiddenCardIds().then((stored) => {
        if (!live || stored.size === 0) return;
        setIds((was) => {
          const next = new Set(was);
          for (const id of stored) next.add(id);
          return next.size === was.size ? was : next;
        });
      });
    };
    const onHidden = (event: Event) => {
      const id = (event as CustomEvent<{ id?: string }>).detail?.id;
      if (typeof id === "string" && id) add(id);
      read();
    };
    read();
    window.addEventListener(HIDDEN_CARDS_CHANGED, onHidden);
    return () => {
      live = false;
      window.removeEventListener(HIDDEN_CARDS_CHANGED, onHidden);
    };
  }, [add]);

  return { ids, add };
}

/**
 * Whether the list on screen is from more than half an hour ago. Turns true
 * by a timer set from when the list was read, so it appears at the half hour
 * without anything on the page moving, and false the moment a fresh read
 * lands (a different `updatedAt`).
 */
export function useStale(updatedAt: number): boolean {
  const [staleFor, setStaleFor] = useState(0);
  useEffect(() => {
    if (!updatedAt) return;
    const timer = setTimeout(
      () => setStaleFor(updatedAt),
      Math.max(0, updatedAt + FOUND_STALE_AFTER_MS - Date.now()),
    );
    return () => clearTimeout(timer);
  }, [updatedAt]);
  return updatedAt > 0 && staleFor === updatedAt;
}

/**
 * A ref for the foot: when it comes within a screen of view, ask for the next
 * page. An observer only reports a CHANGE, so after a failed page the foot
 * has to leave and come back before it asks again, which is exactly what the
 * failed line asks the reader to do, and nothing retries in a loop behind
 * them on a bad connection.
 */
export function useNextPage({
  canAsk,
  ask,
  pageCount,
}: {
  canAsk: boolean;
  ask: () => void;
  /**
   * How many pages are loaded. A page that arrives and still leaves the foot
   * in view changes nothing an observer can see, so the foot is observed
   * afresh for each page, and an observer reports a target's state when it
   * starts watching. A FAILED page adds no page, so it is not observed afresh.
   */
  pageCount: number;
}) {
  const latest = useRef({ canAsk, ask });
  useEffect(() => {
    latest.current = { canAsk, ask };
  });
  return useCallback(
    (element: HTMLElement | null) => {
      if (!element || typeof IntersectionObserver === "undefined") return;
      // Said on the foot, so a test (and a reader of the DOM) can see why it was observed again.
      element.dataset.pages = String(pageCount);
      // One observer per foot and page count, made here rather than during
      // render: its callback reads the ref, which render may not.
      const observer = new IntersectionObserver(
        (entries) => {
          if (!entries.some((entry) => entry.isIntersecting)) return;
          if (latest.current.canAsk) latest.current.ask();
        },
        { rootMargin: "0px 0px 600px 0px" },
      );
      observer.observe(element);
      return () => observer.disconnect();
    },
    [pageCount],
  );
}
