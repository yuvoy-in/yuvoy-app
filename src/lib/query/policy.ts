/**
 * The caching policy, in one file.
 *
 * Sprinkling `staleTime` literals across components is how a seat count ends
 * up cached for five minutes because somebody copied a card component. Each
 * entry below is a decision with a reason attached.
 */

export const CACHE = {
  /** Feed pages. Cheap to refetch, and the feed is not a promise. */
  listExperiences: { staleTime: 60_000, gcTime: 30 * 60_000 },

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
  experiences: (filters?: Record<string, string | undefined>) =>
    ["listExperiences", filters ?? {}] as const,
  experience: (slug: string) => ["getExperience", slug] as const,
  availability: (slug: string, from?: string, to?: string) =>
    ["getAvailability", slug, from ?? null, to ?? null] as const,
  search: (q: string, bookableOn?: string) =>
    ["searchExperiences", q, bookableOn ?? null] as const,
  bookingStatus: (token: string) => ["getBookingStatus", token] as const,
};
