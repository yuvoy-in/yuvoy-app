import type { components } from "../src/lib/api/schema.gen";

/**
 * Made-up groups for the groups directory (yuvoy-mobile#386, web backfill),
 * typed from the pinned contract's `Club`. Ported from mobile's
 * `packages/mocks/src/club-fixtures.ts`, without the follow parts.
 *
 * Every name is invented and every host is an example host, so nothing here
 * points at a real group or site. Havelock has five groups, in the order the
 * API sends them (by name): one on Yuvoy, one with `meets` and `area`, one
 * with neither, one with very long words, and one that stays on Yuvoy after
 * its holder erased their account. Neil has none, for the empty state.
 */

type Club = components["schemas"]["Club"];

/** The places the club mocks list: one with groups, one with none. */
export const CLUB_PLACES = {
  havelock: "andaman/havelock",
  empty: "andaman/neil",
} as const;

/** The slugs a test reaches for by name. */
export const CLUB_SLUGS = {
  /** `onYuvoy: true`, `claimable: false`: a claim is 409 `already_claimed`. */
  onYuvoy: "havelock-book-club",
  /** `onYuvoy: false`, `claimable: true`, meets "Sundays, 6 am", area "Govind Nagar". */
  reefRunners: "havelock-reef-runners",
  /** `onYuvoy: false`, `claimable: true`, `meets` and `area` null. */
  noMeetsNoArea: "havelock-trek-group",
  /** `onYuvoy: false`, `claimable: true`, a very long name, `what` and `sourceName`. */
  longNames: "havelock-long-names",
  /**
   * `onYuvoy: true` and `claimable: true`: the person who held the group has
   * erased their account, so it still reads On Yuvoy and a claim is taken.
   */
  holderGone: "havelock-walking-circle",
} as const;

/** Each group's `clubId`, by the same names: the three forms take these. */
export const CLUB_IDS = {
  onYuvoy: "c10b0000-0000-4000-8000-000000000001",
  reefRunners: "c10b0000-0000-4000-8000-000000000002",
  noMeetsNoArea: "c10b0000-0000-4000-8000-000000000003",
  longNames: "c10b0000-0000-4000-8000-000000000004",
  holderGone: "c10b0000-0000-4000-8000-000000000005",
} as const;

/** The sentences the API answers with (yuvoy-api `internal/handler/clubs.go` and `people.go`). */
export const CLUB_MESSAGES = {
  signIn: "Sign in to do that.",
  notOpen: "People isn't open to your account yet.",
  notFound: "We couldn't find that group.",
  unavailable: "People is not available right now. Try again later.",
  noPlace: "Send destinationKey, the place to list groups for.",
  claimWords:
    "Send roleText (2 to 80 characters) and contactEmail, and proofUrl and note if you like.",
  removalWords:
    "Send reason (we_run_it_and_want_off, not_a_real_group or other) and a note if you like.",
  reportWords:
    "Send reason (not_a_real_group, wrong_details, offensive or other) and a note, which other needs.",
  claimWaiting: "Your claim on this group is already waiting for our team.",
  claimed: "This group has already been claimed.",
  claimTooMany: "You have sent a lot of claims today. Try again tomorrow.",
  reportTooMany: "You have sent a lot of reports today. Try again tomorrow.",
  removalBusy:
    "This listing has had a lot of requests today. Try again tomorrow.",
  claimReceived:
    "Thanks. A person on our team will check with the group and write to you.",
  reportThanks: "Thanks. A person on our team will look at this listing.",
  removedNow:
    "Thanks. The listing is hidden now, and a person on our team will look at it.",
  removalQueued: "Thanks. A person on our team will look at this listing.",
  adultsOnly: "People is for adults. Tell us your birth year first.",
  needsName: "Add your first name before you use People.",
  paused: "Your use of People is paused for now.",
  ended: "Your use of People has ended.",
} as const;

/** The contract's `ClubRemovalRequest.reason` list; the first hides the group at once. */
export const CLUB_REMOVAL_REASON_KEYS = [
  "we_run_it_and_want_off",
  "not_a_real_group",
  "other",
] as const;

/** The contract's `ClubReport.reason` list; `other` needs a note. */
export const CLUB_REPORT_REASON_KEYS = [
  "not_a_real_group",
  "wrong_details",
  "offensive",
  "other",
] as const;

/** Havelock's groups, by name, as `listClubs` sends them. */
export const HAVELOCK_CLUBS: readonly Club[] = [
  {
    clubId: CLUB_IDS.onYuvoy,
    slug: CLUB_SLUGS.onYuvoy,
    destinationKey: CLUB_PLACES.havelock,
    name: "Havelock Book Club",
    what: "Book club",
    category: "learning",
    meets: "First Saturday of the month, 5 pm",
    area: "Radhanagar",
    emoji: "📚",
    sourceName: "Havelock Book Club's page",
    sourceUrl: "https://havelock-book-club.example/about",
    onYuvoy: true,
    claimable: false,
  },
  {
    clubId: CLUB_IDS.longNames,
    slug: CLUB_SLUGS.longNames,
    destinationKey: CLUB_PLACES.havelock,
    name: "Havelock Island Early Morning Sea Swimmers, Snorkellers and Beach Clean-up Volunteers Collective",
    what: "Sea swimming, snorkelling and beach clean-up group for residents and visitors of every level",
    category: null,
    meets: "Every day, 6:30 am",
    area: "Vijay Nagar beach",
    emoji: "🏊",
    sourceName:
      "Andaman and Nicobar Islands Community Noticeboard for Residents, Volunteers and Clubs",
    sourceUrl:
      "https://andaman-community-noticeboard.example/havelock/sea-swimmers",
    onYuvoy: false,
    claimable: true,
  },
  {
    clubId: CLUB_IDS.reefRunners,
    slug: CLUB_SLUGS.reefRunners,
    destinationKey: CLUB_PLACES.havelock,
    name: "Havelock Reef Runners",
    what: "Running club",
    category: "sports",
    meets: "Sundays, 6 am",
    area: "Govind Nagar",
    emoji: "🏃",
    sourceName: "Havelock Reef Runners",
    sourceUrl: "https://reef-runners.example/",
    onYuvoy: false,
    claimable: true,
  },
  {
    clubId: CLUB_IDS.noMeetsNoArea,
    slug: CLUB_SLUGS.noMeetsNoArea,
    destinationKey: CLUB_PLACES.havelock,
    name: "Havelock Trek Group",
    what: "Trek group",
    category: "adventure",
    meets: null,
    area: null,
    emoji: "🥾",
    sourceName: "Trek group noticeboard",
    sourceUrl: "https://trek-group.example/havelock",
    onYuvoy: false,
    claimable: true,
  },
  {
    clubId: CLUB_IDS.holderGone,
    slug: CLUB_SLUGS.holderGone,
    destinationKey: CLUB_PLACES.havelock,
    name: "Havelock Walking Circle",
    what: "Walking group",
    category: "sports",
    meets: "Saturdays, 7 am",
    area: "Beach No. 3",
    emoji: "🚶",
    sourceName: "Havelock Walking Circle",
    sourceUrl: "https://walking-circle.example/",
    onYuvoy: true,
    claimable: true,
  },
];
