import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import { CACHE, qk } from "@/lib/query/policy";
import type { components } from "@/lib/api/schema.gen";

export type OperatorProfile = components["schemas"]["OperatorProfile"];
export type ReelPage = components["schemas"]["ReelPage"];

/** How many reels a grid page asks for. Three across, four rows. */
export const OPERATOR_REELS_PAGE_SIZE = 12;

/**
 * A business, and everything it sells — yuvoy-app#30.
 *
 * A reel opens its listing and the operator on that listing opened nothing:
 * there was no public operator endpoint of any kind, so every business was a
 * name and a logo that went nowhere, and the other clips they had shot were
 * reachable only by scrolling the feed until one came round again.
 *
 * One request for the whole first paint — header, listings and the first
 * screen of the grid — because a profile that arrives in three waves is three
 * layout shifts on a jetty connection.
 */
export function useOperator(slug: string) {
  return useQuery({
    queryKey: qk.operator(slug),
    queryFn: async ({ signal }) => {
      const { data, error } = await api.GET("/operators/{slug}", {
        params: { path: { slug } },
        signal,
      });
      if (error) throw error;
      return data;
    },
    ...CACHE.getExperience,
  });
}

/**
 * The reel grid beyond the first screen.
 *
 * ## Newest first, and deliberately not the feed's ordering
 *
 * The feed rotates operators so no business owns the scroll. On one business's
 * own page that rotation means nothing, and somebody opening a portfolio wants
 * the most recent work first. The server does the ordering; this only pages.
 *
 * ## `complete` is told, not inferred
 *
 * "Do not stop the grid because a page came back short; stop when
 * `complete: true` or `nextCursor` is absent." A short page is a page, and
 * treating it as the end is how a grid silently loses the tail.
 *
 * The first page arrives inside `GET /operators/{slug}`, so it is seeded as
 * page one rather than fetched again — otherwise opening the page costs two
 * requests for the same twelve clips.
 */
export function useOperatorReels(
  slug: string,
  firstPage: ReelPage | null,
  /**
   * When the profile request that carried page one was fetched, as epoch
   * milliseconds — `dataUpdatedAt` from that query.
   *
   * Threaded in rather than read from the clock here: `Date.now()` during
   * render is impure and the React compiler refuses it, and the freshness that
   * matters is when the server answered rather than when this happened to
   * render. Same rule the feed's own hook follows.
   */
  firstPageFetchedAt?: number,
) {
  return useInfiniteQuery({
    queryKey: qk.operatorReels(slug),
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam, signal }) => {
      const { data, error } = await api.GET("/operators/{slug}/reels", {
        params: {
          path: { slug },
          query: {
            limit: OPERATOR_REELS_PAGE_SIZE,
            // Omitted entirely on the first page: `cursor=` empty is a
            // different request from sending none.
            ...(pageParam ? { cursor: pageParam } : {}),
          },
        },
        signal,
      });
      if (error) throw error;
      return data;
    },
    /*
      `complete` FIRST and independently of the cursor. A complete page with a
      stale cursor still on it would otherwise fetch a page past the end.
    */
    getNextPageParam: (lastPage) =>
      lastPage.complete ? undefined : (lastPage.nextCursor ?? undefined),
    ...(firstPage
      ? {
          initialData: { pages: [firstPage], pageParams: [undefined] },
          /*
            The profile request is what actually fetched this page. Without a
            timestamp React Query treats seeded data as infinitely stale and
            refetches page one immediately, which is the duplicate request the
            seeding exists to avoid.
          */
          initialDataUpdatedAt: firstPageFetchedAt,
        }
      : {}),
    // Only page once there is something to page from.
    enabled: Boolean(firstPage),
    ...CACHE.listReels,
  });
}
