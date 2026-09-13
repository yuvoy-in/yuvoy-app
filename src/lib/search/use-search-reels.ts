"use client";

import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import { CACHE, qk } from "@/lib/query/policy";
import { REELS_PAGE_SIZE, type ReelsPage } from "@/lib/feed/reels";
import {
  isAsking,
  reelFilterKey,
  reelQuery,
  type ReelFilters,
} from "./filters";

/**
 * The words the filter sheet may offer — `GET /catalog/vocabulary`.
 *
 * ## Why this replaces `lib/search/facets.ts`
 *
 * The chips used to be DERIVED from a fifty-item page of `/experiences`, and
 * that file's own comment recorded the two reasons it had to be: there was no
 * public vocabulary endpoint (`/catalog/vocabulary` existed only on the
 * operator API), and `DestinationKey` is a pattern rather than an enum, so a
 * hardcoded list would go stale the day a destination opened.
 *
 * yuvoy-api#173 published the endpoint, so both reasons are gone — along with
 * the limit that file stated and could not fix: "a destination whose only
 * listings fall outside that page has no chip."
 *
 * ## One thing genuinely changes, and it is worth knowing
 *
 * The derived list only ever offered a facet with a published listing behind
 * it, so tapping a chip always returned something. This endpoint publishes the
 * **active** vocabulary rather than the populated one, and says so:
 *
 * > A value with no published listing behind it today is still offered;
 * > filtering by it answers an empty page. Narrowing to populated values would
 * > make a chip vanish when its only listing pauses for a week.
 *
 * That is the better trade — a filter that comes and goes is worse than one
 * that occasionally finds nothing — but it means the empty result is now a
 * state the screen has to say something useful about, rather than one that
 * could only be reached by combining filters.
 */
export function useVocabulary() {
  return useQuery({
    queryKey: qk.vocabulary(),
    queryFn: async ({ signal }) => {
      const { data, error } = await api.GET("/catalog/vocabulary", { signal });
      if (error) throw error;
      return data;
    },
    // The set of places and kinds on offer changes when a destination opens,
    // not between taps. Same policy as the catalog index it resembles.
    ...CACHE.catalogIndex,
  });
}

/**
 * Search results, as reels — `GET /reels` with filters.
 *
 * ## The cursor belongs to the filter set
 *
 * The contract's own warning, and the reason `reelFilterKey` is in the query
 * key rather than a subset of the filters:
 *
 * > A cursor belongs to the filters it was minted under. Sending it with any
 * > different filter set is a `400` … When the chips change, drop the cursor
 * > and start from the first page.
 *
 * React Query does exactly that for free, but only if the key changes with
 * EVERY filter. A key missing one field would keep the accumulated pages and
 * their cursor across a change to that field, and the next `fetchNextPage`
 * would be a 400 — on the second page only, which is the kind of bug that
 * reaches production because nobody scrolls in review.
 *
 * ## Filters narrow, they never rank
 *
 * The order is still the rotation, counted within the filtered set, so under
 * "scuba at Havelock" every business's first matching reel still comes before
 * anybody's second. There is no relevance ordering here and none is added: a
 * client that re-sorted would hand the results to whoever uploaded last.
 */
export function useSearchReels(filters: ReelFilters) {
  return useInfiniteQuery({
    queryKey: qk.searchReels(reelFilterKey(filters)),
    initialPageParam: undefined as string | undefined,
    // Nothing is asked until something is asked for. An unfiltered call here
    // would be the feed, and the feed is a tab away.
    enabled: isAsking(filters),
    queryFn: async ({ pageParam, signal }): Promise<ReelsPage> => {
      const { data, error } = await api.GET("/reels", {
        params: {
          query: {
            limit: REELS_PAGE_SIZE,
            ...reelQuery(filters),
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
    ...CACHE.search,
  });
}
