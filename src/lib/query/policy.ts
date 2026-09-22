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

  /**
   * One reel, opened by its own link.
   *
   * The same minute as the feed, and for the same reason: a reel is not a
   * promise about a seat, and the listing beside it carries no availability
   * this screen acts on. It is fetched once on arrival and then the feed pages
   * in underneath it.
   */
  getReel: { staleTime: 60_000, gcTime: 30 * 60_000 },

  /**
   * The saves on a signed-in account (yuvoy-api#192).
   *
   * A minute, and refetched on focus by the queries that use it. Putting saves
   * on the account is so that a save made on the phone is on the laptop, and
   * the laptop only learns that by asking. The device half needs none of this:
   * nothing but this tab writes to it, so it never goes stale.
   */
  accountSaved: { staleTime: 60_000, gcTime: 30 * 60_000 },

  /**
   * The help requests this number sent (yuvoy-api#196).
   *
   * Thirty seconds, and refetched on focus by the list that reads it. The one
   * thing on it that moves is the status, and it moves when a person at Yuvoy
   * picks a request up, which is exactly when a traveller comes back from
   * WhatsApp to look. Kept five minutes: it belongs to a number, and sign in
   * and sign out remove it outright rather than letting it age.
   */
  supportRequests: { staleTime: 30_000, gcTime: 5 * 60_000 },
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
  /** One reel by its own id — a shared link (yuvoy-app#36). */
  reel: (id: string) => ["getReel", id] as const,
  /**
   * Whether this device is signed in (yuvoy-app#57).
   *
   * One entry, read by every screen that shows a Login button or a signed-in
   * branch, so signing in on Account fills Trips without a reload. There is
   * nothing to key it by: the token is in an HttpOnly cookie now and the
   * browser cannot see it, which is the point.
   */
  session: () => ["session"] as const,
  /**
   * The signed-in traveller's own profile (yuvoy-app#32, #38).
   *
   * Not keyed by anything, for the same reason `myBookings` is not: the token
   * is in an HttpOnly cookie and the browser cannot see it. Removed rather
   * than invalidated on both sign-in and sign-out, so a shared phone never
   * paints the previous number's name into a form while a refetch runs.
   */
  myAccount: () => ["getMyAccount"] as const,
  /**
   * Trips the traveller was invited to. Not paged by the API (yuvoy-app#38).
   *
   * Its own entry rather than part of `myBookings`: it is a different endpoint
   * with a different shape and no cursor, and a guest's trip carries no price,
   * no payment and no booking link.
   */
  invitedTrips: () => ["listInvitedTrips"] as const,
  /** One invited trip, for `/trips/invited/{id}`. */
  invitedTrip: (id: string) => ["getInvitedTrip", id] as const,
  /** An invite link's preview, unauthenticated, for `/i/{token}`. */
  invitePreview: (token: string) => ["previewTripInvite", token] as const,
  /** The guests on a booking, as the booker sees them. */
  tripInvites: (token: string) => ["listTripInvites", token] as const,
  /** The first-sign-in screen's tiles. */
  interestOptions: () => ["listInterestOptions"] as const,
  /**
   * Every trip on a signed-in number (yuvoy-app#34).
   *
   * This used to be keyed by the session token, so that two numbers on one
   * phone could not read each other's trips out of the cache. The token is no
   * longer visible to the browser (yuvoy-app#57), so the key cannot carry it
   * and the separation has to come from somewhere else: `useTravellerSession`
   * REMOVES this entry on both sign-in and sign-out, rather than invalidating
   * it. Invalidating would leave the previous number's trips on screen while
   * the refetch runs, which is the exact failure the token key existed to
   * prevent.
   */
  myBookings: (tab?: string, from?: string, to?: string) =>
    ["listMyBookings", tab ?? "", from ?? "", to ?? ""] as const,
  /** The filter chips' word list (yuvoy-app#37). */
  vocabulary: () => ["getPublicVocabulary"] as const,
  /**
   * Search results as reels, keyed by the WHOLE filter set.
   *
   * Not a convenience. `GET /reels` mints a cursor against the filters it was
   * called with and answers `400` to a cursor replayed under different ones,
   * so a key missing one field would keep the accumulated pages across a
   * change to it and turn the next page into an error. See `reelFilterKey`.
   */
  searchReels: (filterKey: string) =>
    ["listReels", "search", filterKey] as const,
  experience: (slug: string) => ["getExperience", slug] as const,
  /** A business and its whole first paint — yuvoy-app#30. */
  operator: (slug: string) => ["getOperator", slug] as const,
  /**
   * The reel grid on a business's page.
   *
   * Not keyed by cursor: the cursor is a page param React Query stores inside
   * this entry. A key that included it would give every page its own entry and
   * lose the accumulated grid on the first refetch.
   */
  operatorReels: (slug: string) => ["listOperatorReels", slug] as const,
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
  /*
    Every axis is part of the key. Leaving one out means two different
    searches share a cache entry and the second renders the first's results —
    silently, and only for the length of `staleTime`, which is the hardest
    kind of wrong answer to reproduce.
  */
  bookingStatus: (token: string) => ["getBookingStatus", token] as const,
  /**
   * The saved set as ids, which is what every feed card asks about
   * (yuvoy-api#192). Keyed by WHERE the saves live, because the device's set
   * and the account's are different answers: signed out it is this browser's,
   * signed in it is the number's. One key for both would paint one over the
   * other for the length of a refetch, which on a shared phone is somebody
   * else's list.
   *
   * Both halves are REMOVED, not invalidated, on sign in and sign out, for
   * the reason `myBookings` gives.
   */
  savedIds: (where: "device" | "account") =>
    ["listSavedExperienceIds", where] as const,
  /**
   * The list screen's read, beside the feed's rather than derived from it: the
   * feed wants ids and nothing else, twelve times a page, and a shared entry
   * would re-render every card whenever the list refetched bodies. On the
   * account it is an infinite query; on the device, a list of entries.
   */
  savedList: (where: "device" | "account") =>
    ["listSavedExperiences", where] as const,
  /**
   * The help requests on a signed-in number (yuvoy-api#196), newest first and
   * paged. Not keyed by anything, for the reason `myBookings` gives: the
   * session is in a cookie the browser cannot see, so the separation between
   * two numbers on one phone comes from REMOVING this on sign in and sign out.
   */
  supportRequests: () => ["listSupportRequests"] as const,
  /**
   * One help request, by its reference, and by WHICH credential asked.
   *
   * The same reference can be asked for by the session and by a booking's
   * status token, and the two can get different answers: the token opens only
   * requests about its own booking, and a 404 for one is not a 404 for the
   * other. Sharing an entry would paint one credential's answer as the
   * other's. The token rides in the key the way `bookingStatus` carries it.
   */
  supportRequest: (reference: string, token: string | null) =>
    ["getSupportRequest", reference, token ?? "session"] as const,
};
