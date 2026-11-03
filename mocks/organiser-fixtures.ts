import type { components } from "../src/lib/api/schema.gen";
import { FIXTURE_NOW } from "./fixtures";

/**
 * Organiser pages for the mocks (yuvoy-app#224). Samples, as everything in
 * `found-fixtures.ts` is: "Sample" names, example.com links and addresses
 * that are not real. One organiser in each of the five states, so a screen
 * can be looked at in every one, and one event in each of the six states.
 *
 * The caller owns every organiser here but `ORG_HELPER_OF`, where they are a
 * helper: that one carries no `contactEmail` (owners only), and its helpers
 * list has no `travellerId`.
 */

type Organiser = components["schemas"]["Organiser"];
type OrganiserEvent = components["schemas"]["OrganiserEvent"];
type OrganiserEventNumbers = components["schemas"]["OrganiserEventNumbers"];
type OrganiserHelperListed = components["schemas"]["OrganiserHelperListed"];

const DAY_MS = 24 * 60 * 60 * 1000;

/** `FIXTURE_NOW` plus whole days, at a given UTC hour, as the API writes it. */
function at(days: number, utcHour: number): string {
  const d = new Date(FIXTURE_NOW.getTime() + days * DAY_MS);
  d.setUTCHours(utcHour, 0, 0, 0);
  return d.toISOString().replace(".000Z", "Z");
}

/** The calendar date `days` from `FIXTURE_NOW`, in India. */
function dayIn(days: number): string {
  const d = new Date(FIXTURE_NOW.getTime() + days * DAY_MS + 330 * 60_000);
  return d.toISOString().slice(0, 10);
}

export const ORG_IDS = {
  pending: "6f1c2a10-1b2c-4d3e-8f40-0a1b2c3d4e01",
  verified: "6f1c2a10-1b2c-4d3e-8f40-0a1b2c3d4e02",
  notVerified: "6f1c2a10-1b2c-4d3e-8f40-0a1b2c3d4e03",
  suspended: "6f1c2a10-1b2c-4d3e-8f40-0a1b2c3d4e04",
  closed: "6f1c2a10-1b2c-4d3e-8f40-0a1b2c3d4e05",
  helperOf: "6f1c2a10-1b2c-4d3e-8f40-0a1b2c3d4e06",
} as const;

const base = {
  destinationKey: "andaman/havelock",
  links: [],
  selfPublish: false,
  role: "owner",
  clubId: null,
} satisfies Partial<Organiser>;

export const ORG_PENDING: Organiser = {
  ...base,
  id: ORG_IDS.pending,
  slug: "sample-morning-swimmers",
  name: "Sample Morning Swimmers",
  departments: ["sports"],
  about: "Open water swims at sunrise, for anyone who can swim 500 metres.",
  state: "pending",
  verificationCode: "YUVOY-7KQ3MP",
  contactEmail: "swimmers@example.com",
};

export const ORG_VERIFIED: Organiser = {
  ...base,
  id: ORG_IDS.verified,
  slug: "sample-island-walkers",
  name: "Sample Island Walkers",
  departments: ["nature_wildlife", "adventure"],
  about: "Guided walks through the forest and along the shore, most weekends.",
  links: [
    { kind: "website", url: "https://walkers.example.com" },
    { kind: "meetup", url: "https://www.meetup.com/sample-island-walkers" },
  ],
  state: "verified",
  contactEmail: "walkers@example.com",
};

export const ORG_NOT_VERIFIED: Organiser = {
  ...base,
  id: ORG_IDS.notVerified,
  slug: "sample-beach-quiz",
  name: "Sample Beach Quiz",
  departments: ["entertainment"],
  state: "not_verified",
  verificationCode: "YUVOY-R4TW9X",
};

export const ORG_SUSPENDED: Organiser = {
  ...base,
  id: ORG_IDS.suspended,
  slug: "sample-night-market",
  name: "Sample Night Market",
  departments: ["food_drink"],
  state: "suspended",
  contactEmail: "market@example.com",
};

export const ORG_CLOSED: Organiser = {
  ...base,
  id: ORG_IDS.closed,
  slug: "sample-heritage-talks",
  name: "Sample Heritage Talks",
  departments: ["culture_heritage"],
  state: "closed",
};

/** A verified organiser the caller helps on: no `contactEmail`, self-publish on. */
export const ORG_HELPER_OF: Organiser = {
  ...base,
  id: ORG_IDS.helperOf,
  slug: "sample-reef-cleanup",
  name: "Sample Reef Cleanup",
  departments: ["nature_wildlife"],
  destinationKey: "andaman/port_blair",
  state: "verified",
  selfPublish: true,
  role: "helper",
};

/** `GET /me/organisers` with no scenario: every state, then the one helped on. */
export const MY_ORGANISERS: Organiser[] = [
  ORG_VERIFIED,
  ORG_PENDING,
  ORG_NOT_VERIFIED,
  ORG_SUSPENDED,
  ORG_CLOSED,
  ORG_HELPER_OF,
];

export const EVENT_IDS = {
  inChecking: "9a3e5c20-2d4f-4a6b-9c70-1b2c3d4e5f01",
  live: "9a3e5c20-2d4f-4a6b-9c70-1b2c3d4e5f02",
  changesInChecking: "9a3e5c20-2d4f-4a6b-9c70-1b2c3d4e5f03",
  cancelled: "9a3e5c20-2d4f-4a6b-9c70-1b2c3d4e5f04",
  notAccepted: "9a3e5c20-2d4f-4a6b-9c70-1b2c3d4e5f05",
  ended: "9a3e5c20-2d4f-4a6b-9c70-1b2c3d4e5f06",
} as const;

const walk = {
  department: "nature_wildlife",
  destinationKey: "andaman/havelock",
  venueName: "Sample Forest Gate",
  address: "Sample Road, Havelock",
  free: true,
  link: "https://walkers.example.com/walks",
} satisfies Partial<OrganiserEvent>;

/** One event in each of the six states, for `ORG_VERIFIED`. Newest first. */
export const VERIFIED_EVENTS: OrganiserEvent[] = [
  {
    ...walk,
    id: EVENT_IDS.inChecking,
    state: "in_checking",
    title: "Sample mangrove walk",
    startsAt: at(9, 1),
    endsAt: at(9, 3),
    about: "Two hours along the boardwalk. Wear shoes that can get wet.",
  },
  {
    ...walk,
    id: EVENT_IDS.live,
    eventId: "c41d7e30-3e5a-4b7c-8d90-2c3d4e5f6a01",
    state: "live",
    lastCheckedAt: at(-2, 6),
    title: "Sample Saturday forest walk",
    startsAt: at(3, 1),
    endsAt: at(3, 4),
    repeatsWeeklyUntil: dayIn(59),
    free: false,
    priceFromRupees: 300,
    priceNote: "Tea and a guide included",
  },
  {
    ...walk,
    id: EVENT_IDS.changesInChecking,
    eventId: "c41d7e30-3e5a-4b7c-8d90-2c3d4e5f6a02",
    state: "changes_in_checking",
    lastCheckedAt: at(-5, 6),
    title: "Sample bird count at the lagoon",
    startsAt: at(5, 0),
    endsAt: at(5, 2),
  },
  {
    ...walk,
    id: EVENT_IDS.cancelled,
    eventId: "c41d7e30-3e5a-4b7c-8d90-2c3d4e5f6a03",
    state: "cancelled",
    lastCheckedAt: at(-6, 6),
    title: "Sample night walk",
    startsAt: at(2, 14),
  },
  {
    ...walk,
    id: EVENT_IDS.notAccepted,
    state: "not_accepted",
    notAcceptedReason: "It does not look like a real event",
    lastCheckedAt: at(-1, 6),
    title: "Sample walk, details later",
    startsAt: at(12, 1),
  },
  {
    ...walk,
    id: EVENT_IDS.ended,
    eventId: "c41d7e30-3e5a-4b7c-8d90-2c3d4e5f6a04",
    state: "ended",
    lastCheckedAt: at(-20, 6),
    title: "Sample shore walk",
    startsAt: at(-7, 1),
    endsAt: at(-7, 3),
  },
];

/** The one event the helped-on organiser has: live, self-published. */
export const HELPER_OF_EVENTS: OrganiserEvent[] = [
  {
    id: "9a3e5c20-2d4f-4a6b-9c70-1b2c3d4e5f07",
    eventId: "c41d7e30-3e5a-4b7c-8d90-2c3d4e5f6a05",
    state: "live",
    title: "Sample beach clean-up",
    department: "nature_wildlife",
    startsAt: at(4, 0),
    endsAt: at(4, 2),
    destinationKey: "andaman/port_blair",
    venueName: "Sample Beach",
    free: true,
    link: "https://reef.example.com",
  },
];

/** An event not live yet: every count 0, `on` its own start's date. */
export function zeroNumbers(event: OrganiserEvent): OrganiserEventNumbers {
  return {
    going: 0,
    ticketTapsAtLeast: 0,
    checkedIn: 0,
    went: 0,
    on: event.startsAt.slice(0, 10),
    asOf: FIXTURE_NOW.toISOString(),
  };
}

/** The live weekly walk's counts: this week's date, or the week before. */
export function liveNumbers(on: string | null): OrganiserEventNumbers {
  const thisWeek = dayIn(3);
  const lastWeek = dayIn(-4);
  const past = on === lastWeek;
  return {
    going: past ? 9 : 14,
    ticketTapsAtLeast: past ? 11 : 6,
    checkedIn: past ? 7 : 0,
    went: past ? 8 : 0,
    on: on ?? thisWeek,
    asOf: FIXTURE_NOW.toISOString(),
  };
}

/** `ORG_VERIFIED`'s helpers, oldest first, as an owner sees them. */
export const VERIFIED_HELPERS: Required<OrganiserHelperListed>[] = [
  { travellerId: "b52e8f40-4f6b-4c8d-9ea0-3d4e5f6a7b01", firstName: "Ravi" },
  { travellerId: "b52e8f40-4f6b-4c8d-9ea0-3d4e5f6a7b02", firstName: "Meera" },
];

/** `ORG_HELPER_OF`'s helpers, as a helper sees them: first names only. */
export const HELPER_OF_HELPERS: OrganiserHelperListed[] = [
  { firstName: "Asha" },
  { firstName: "Kiran" },
];

/**
 * The accounts `POST /organisers/{id}/helpers` knows, by email: anyone else
 * is 400 `no_account_with_that_email`.
 */
export const KNOWN_HELPER_EMAILS: Record<
  string,
  { travellerId: string; firstName: string }
> = {
  // Already a helper: answered as they are.
  "ravi@example.com": {
    travellerId: "b52e8f40-4f6b-4c8d-9ea0-3d4e5f6a7b01",
    firstName: "Ravi",
  },
  "nisha@example.com": {
    travellerId: "b52e8f40-4f6b-4c8d-9ea0-3d4e5f6a7b03",
    firstName: "Nisha",
  },
};
