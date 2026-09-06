"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import { CACHE, qk } from "@/lib/query/policy";
import type { components } from "@/lib/api/schema.gen";

type Media = components["schemas"]["Media"];
type ExperienceSummary = components["schemas"]["ExperienceSummary"];

/** One reel, and the whole listing it sells. */
export interface Reel {
  media?: Media;
  experience?: ExperienceSummary;
}

export interface ReelsPage {
  items?: Reel[];
}

/**
 * The most reels the API will return in one answer.
 *
 * `GET /reels` takes `limit` (1–60, default 30) and returns **no cursor**, so
 * this is not a page size — it is the whole feed. Asking for the maximum is
 * therefore not greed: at the default of 30 a traveller would silently see 30
 * of 45 reels, and the end of the feed would claim to be the end of the
 * catalogue.
 *
 * Which is exactly why {@link isPossiblyTruncated} exists. When precisely this
 * many come back, we cannot tell a complete feed from a clipped one, and the
 * screen must not claim either.
 */
export const REELS_LIMIT = 60;

/**
 * The feed's data — **every published reel**, not one per listing.
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
 * ## Why `useQuery` and not `useInfiniteQuery`
 *
 * There is no cursor on this endpoint. The previous feed paged properly, and
 * the honest replacement for paging that does not exist is no paging — not a
 * client-side imitation, which over an unordered-by-cursor endpoint re-requests
 * rows it already has. The gap is recorded in `contracts/PINNED` and raised
 * upstream rather than papered over here.
 *
 * ## Ordering is the server's, and re-sorting it would be a product decision
 *
 * Reels are numbered within each business and ordered by that number, so
 * **everyone's first reel precedes anybody's second**. That is deliberate and
 * load-bearing: our anchor operator is a co-founder's business, and the
 * ordering is built so it *cannot* express a preference for any operator — it
 * rotates them, it never ranks them. Sorting client-side by recency, or by
 * anything at all, hands the feed to whoever uploaded most recently. A test
 * pins that this hook returns the server's order untouched.
 */
export function useReels(
  /**
   * The first answer, fetched on the server.
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
  return useQuery({
    queryKey: qk.reels(REELS_LIMIT),
    ...(initialPage
      ? {
          initialData: initialPage,
          // Without this the initial data is considered infinitely stale and
          // refetched on hydration, undoing the point of fetching it on the
          // server.
          initialDataUpdatedAt: initialFetchedAt,
        }
      : {}),
    queryFn: async ({ signal }) => {
      const { data, error } = await api.GET("/reels", {
        params: { query: { limit: REELS_LIMIT } },
        signal,
      });
      if (error) throw error;
      return data;
    },
    ...CACHE.listReels,
  });
}

/**
 * The reels worth rendering, in the order the server gave them.
 *
 * An item with no `media` is dropped rather than drawn. Both halves are
 * optional in the contract, and this is the reels feed — a row with nothing to
 * play is a black rectangle that scrolls past, and there is a catalogue
 * endpoint for listings without footage. An item with no `experience` is
 * dropped for the harder reason: the card's whole job is to offer the booking,
 * and a clip nobody can act on is a dead stop in a scroll.
 *
 * **Never sorted.** See {@link useReels}.
 */
export function playableReels(page: ReelsPage | undefined): Reel[] {
  return (page?.items ?? []).filter((item) => item.media && item.experience);
}

/**
 * Might the server be holding reels this answer did not carry?
 *
 * True when the answer is exactly {@link REELS_LIMIT} long, because an unpaged
 * endpoint gives no other signal — a full answer and a coincidentally-full one
 * are identical on the wire.
 *
 * The feed uses it to withhold "that is everything", which is the only claim on
 * that screen that can be false without anybody noticing. Counted against the
 * RAW items rather than the playable ones: dropping an item with no media
 * makes the list shorter without making the feed any more complete.
 */
export function isPossiblyTruncated(page: ReelsPage | undefined): boolean {
  return (page?.items?.length ?? 0) >= REELS_LIMIT;
}
