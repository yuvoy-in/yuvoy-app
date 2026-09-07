"use client";

import { useInfiniteQuery } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import { CACHE, qk } from "@/lib/query/policy";
import { REELS_PAGE_SIZE, type ReelsPage } from "./reels";

/*
  The hook, and NOTHING else.

  Everything a Server Component might want — `REELS_PAGE_SIZE`, the types, the
  pure helpers — lives in `./reels.ts`, which declares no client boundary. That
  split is not organisation, it is correctness: a `"use client"` module turns
  every export into a client reference, so a server importing a constant from
  here gets a stub that throws rather than the value, silently, at runtime.
  `pnpm qa` fails a server file that tries.
*/

/**
 * The feed's data — **every published reel**, not one per listing, paged.
 *
 * ## Why this is not `/experiences`
 *
 * `/experiences` returns one listing per row with a single `heroMedia` each,
 * so the number of reels a traveller could see was capped at the number of
 * listings, whatever the operators had actually filmed. On 6 September that
 * was two visible against three published, and the third had been invisible
 * since the day it was uploaded (yuvoy-app#18).
 *
 * `/experiences` is untouched and still right for a search or a category
 * listing. It simply is not the feed.
 *
 * ## Why this became `useInfiniteQuery` (yuvoy-api#114)
 *
 * It was a plain `useQuery` that asked for the maximum and stopped, because
 * the endpoint had no cursor and the honest replacement for paging that does
 * not exist is no paging — not a client-side imitation, which over an
 * unresumable ordering re-requests rows it already holds. The gap was recorded
 * in `contracts/PINNED` and raised upstream rather than papered over, and the
 * API answered it: `cursor` in, `complete` and `nextCursor` out.
 *
 * ## The cursor is opaque, and constructing one would break the feed
 *
 * It carries the ROUND a reel is in for its own operator, then recency, then
 * id — the three terms the ordering itself has. The rotation is computed
 * across every eligible reel at query time, so a client cannot resume it from
 * what it holds: a cursor built from the last item's timestamp restarts the
 * rotation, one business's second reel arrives before another's first, and the
 * ordering stops being blind to which operator. That interleave is the one
 * property this endpoint exists to protect.
 *
 * So `getNextPageParam` returns the server's own string and never derives one.
 *
 * ## `complete` is read, never inferred
 *
 * A short page is not the end. `getNextPageParam` returning `undefined` stops
 * the scroll, and it does so for two different reasons — the feed ended, or
 * the server stopped with no cursor to follow — which the bottom of the screen
 * has to tell apart. `feedTail()` does that; this hook only decides whether
 * there is anything left to fetch.
 *
 * ## Ordering is the server's, and re-sorting it would be a product decision
 *
 * Reels are numbered within each business, so **everyone's first reel precedes
 * anybody's second**. That is deliberate and load-bearing: our anchor operator
 * is a co-founder's business, and the ordering is built so it *cannot* express
 * a preference for any operator — it rotates them, it never ranks them.
 * Sorting client-side by recency, or by anything at all, hands the feed to
 * whoever uploaded most recently. A test pins that this hook returns the
 * server's order untouched.
 */
export function useReels(
  /**
   * The first page, fetched on the server.
   *
   * Passed as `initialData` rather than fetched again: it is what puts the
   * first cards in the server HTML, which is what moved LCP off a
   * bundle-download-and-hydrate critical path. See `app/page.tsx`.
   */
  initialPage?: ReelsPage | null,
  /**
   * When the SERVER fetched it, as epoch milliseconds.
   *
   * Threaded through rather than read from the clock here: `Date.now()` during
   * render is impure and the React compiler refuses it — and the freshness
   * that matters is the server's fetch time, not the moment this component
   * happened to render.
   */
  initialFetchedAt?: number,
) {
  return useInfiniteQuery({
    queryKey: qk.reels(REELS_PAGE_SIZE),
    /*
      The first page carries no cursor. `undefined` rather than `null` because
      that is what the query string wants to omit, and because it is the value
      `initialData.pageParams` has to match for the server-rendered page to be
      recognised as page one rather than as a page fetched with the literal
      cursor "null".
    */
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam, signal }) => {
      const { data, error } = await api.GET("/reels", {
        params: {
          query: {
            limit: REELS_PAGE_SIZE,
            // Omitted entirely on the first page. Sending `cursor=` empty is a
            // different request from sending none, and the contract only
            // describes the latter.
            ...(pageParam ? { cursor: pageParam } : {}),
          },
        },
        signal,
      });
      if (error) throw error;
      return data;
    },
    /*
      The server's own answer, passed straight back. `complete` is checked
      FIRST and independently of the cursor: a complete page with a stale
      cursor still on it would otherwise fetch a page past the end.
    */
    getNextPageParam: (lastPage) =>
      lastPage.complete ? undefined : (lastPage.nextCursor ?? undefined),
    ...(initialPage
      ? {
          initialData: { pages: [initialPage], pageParams: [undefined] },
          // Without this the initial data is considered infinitely stale and
          // refetched on hydration, undoing the point of fetching it on the
          // server.
          initialDataUpdatedAt: initialFetchedAt,
        }
      : {}),
    ...CACHE.listReels,
  });
}
