/**
 * The caching policy, in one file.
 *
 * Sprinkling `staleTime` literals across components is how a seat count ends
 * up cached for five minutes because somebody copied a card component. Each
 * entry below is a decision with a reason attached.
 */

export const CACHE = {
  /**
   * The reels feed. Cheap to refetch, and the feed is not a promise.
   *
   * Same numbers the experience feed used, for the same reason: it changes as
   * operators put footage up and as seats go, and a minute-old feed costs
   * nothing.
   *
   * It is an infinite query (yuvoy-api#114), so `staleTime` governs the whole
   * accumulated feed rather than one answer: going stale refetches every page
   * loaded so far, in sequence, which is why the number is a minute and not
   * five seconds. A traveller twelve pages deep does not want the scroll
   * position they earned spent on a background re-walk of the cursor.
   */
  listReels: { staleTime: 60_000, gcTime: 30 * 60_000 },

  /** The experience page. Also precached by the service worker. */
  getExperience: { staleTime: 5 * 60_000, gcTime: 24 * 60 * 60_000 },

  /**
   * NEVER trusted stale. The contract calls availability "the authority on
   * seats"; a cached count sells a seat that does not exist. Refetched on
   * focus, always.
   */
  getAvailability: { staleTime: 0, gcTime: 60_000 },

  /** Polled, not cached. See the booking status poller. */
  getBookingStatus: { staleTime: 0, gcTime: Infinity },

  /** Drives prefetch and the sitemap. */
  catalogIndex: { staleTime: 60 * 60_000, gcTime: 24 * 60 * 60_000 },

  search: { staleTime: 30_000, gcTime: 5 * 60_000 },
} as const;

/** Query keys derive from the operationId so invalidation is mechanical. */
export const qk = {
  /**
   * The feed. Keyed by page size, and NOT by cursor — the cursor is a page
   * param, which React Query stores inside this entry rather than beside it.
   * A key that included the cursor would give every page its own entry and
   * lose the accumulated feed on the first refetch.
   *
   * The page size stays in the key because a feed paged twelve at a time is
   * not the same accumulated answer as one paged sixty at a time, and sharing
   * an entry between them would hand one page size's pages to the other's
   * cursor.
   */
  reels: (pageSize: number) => ["listReels", pageSize] as const,
  experience: (slug: string) => ["getExperience", slug] as const,
  availability: (slug: string, from?: string, to?: string) =>
    ["getAvailability", slug, from ?? null, to ?? null] as const,
  /**
   * Checkout's own availability entry, kept separate from the picker's on
   * purpose.
   *
   * Not a cache optimisation — the opposite. Sharing the picker's entry would
   * let React Query paint its cached seat count first and refetch behind it,
   * and "a seat count that was true when the previous screen rendered" is the
   * one thing checkout may not show. A distinct key means checkout always
   * starts from its own fetch.
   *
   * It used to be spelled `qk.availability(slug, "checkout", slotId)`, which
   * smuggled the separation through the `from` and `to` parameters. This says
   * what it means.
   */
  availabilityForCheckout: (slug: string, slotId: string) =>
    ["getAvailability", "checkout", slug, slotId] as const,
  search: (q: string, bookableOn?: string) =>
    ["searchExperiences", q, bookableOn ?? null] as const,
  bookingStatus: (token: string) => ["getBookingStatus", token] as const,
};
