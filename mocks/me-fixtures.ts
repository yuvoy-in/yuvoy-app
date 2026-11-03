import type { components } from "../src/lib/api/schema.gen";

/**
 * Me's data (yuvoy-mobile#444, R10-M1): the caller's life list, the Did you
 * go question and the badges, typed from the pinned contract and ported from
 * yuvoy-mobile's `packages/mocks/src/me-fixtures.ts`, so both apps test the
 * same world. Dated against FIXTURE_NOW (2026-08-19T02:00Z): every entry is in
 * the past and the question's event ended within its 30 days.
 *
 * Imports no MSW, so a unit test can read it without a worker. Every export is
 * a function that returns a fresh copy: me-handlers.ts changes what it keeps.
 */

type LifeEntry = components["schemas"]["LifeEntry"];
type PersonRef = components["schemas"]["PersonRef"];
type Badge = components["schemas"]["Badge"];
type BadgeProgress = components["schemas"]["BadgeProgress"];
type MySettings = components["schemas"]["MySettings"];

/**
 * The one entry photo, as a PNG inside the URL, so the page draws it with no
 * network. On the API it is a five-minute signed link; the app never keeps it.
 */
export const ME_PHOTO =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAMAAAAECAIAAADETxJQAAAAEElEQVR42mPQ93eGIAa8LAC0KAkNjAaMTgAAAABJRU5ErkJggg==";

/** One of each kind and proof on the caller's list, newest first. Each is `kind:uuid`. */
export const ME_ENTRY_IDS = Object.freeze({
  tripChecked: "trip:b0a11000-0000-4000-8000-000000000001",
  tripBooked: "trip:b0a11000-0000-4000-8000-000000000002",
  wentChecked: "went:e7e10000-0000-4000-8000-000000000001",
  wentSaid: "went:e7e10000-0000-4000-8000-000000000002",
  plan: "plan:91a10000-0000-4000-8000-000000000001",
  table: "table:7ab1e000-0000-4000-8000-000000000001",
});

/** The second half of an entry id: a booking, an event, a plan or a table. */
export const refOf = (entryId: string) =>
  entryId.slice(entryId.indexOf(":") + 1);

/** Two friends who cheered the dive, as the owner reads who cheered. */
const BINA: PersonRef = {
  personId: "7e0f1a00-0000-4000-8000-000000000102",
  shortName: "Bina D.",
  firstName: "Bina",
  initial: "B",
};
const DIVYA: PersonRef = {
  personId: "7e0f1a00-0000-4000-8000-000000000104",
  shortName: "Divya M.",
  firstName: "Divya",
  initial: "D",
};

/** The caller's life list under `me-life-list`, newest first. */
export function meEntries(): LifeEntry[] {
  return [
    {
      entryId: ME_ENTRY_IDS.tripChecked,
      kind: "trip",
      title: "Try-dive at Nemo Reef",
      // 09:00 in India: the one early start Early bird counts so far.
      happenedAt: "2026-08-17T03:30:00.000Z",
      photoUrl: ME_PHOTO,
      destinationKey: "andaman/havelock",
      category: "adventure",
      experienceSlug: "try-dive-nemo-reef",
      proof: "checked_in",
      checked: true,
      rating: 5,
      visibility: "friends",
      cheers: 2,
      cheeredBy: [{ ...BINA }, { ...DIVYA }],
    },
    {
      entryId: ME_ENTRY_IDS.tripBooked,
      kind: "trip",
      title: "Mangrove kayak at dawn",
      happenedAt: "2026-08-13T05:30:00.000Z",
      photoUrl: null,
      destinationKey: "andaman/neil-island",
      category: "nature_wildlife",
      experienceSlug: "mangrove-kayak-at-dawn",
      proof: "booked",
      checked: false,
      rating: null,
      visibility: "only_me",
      cheers: 0,
      cheeredBy: [],
    },
    {
      entryId: ME_ENTRY_IDS.wentChecked,
      kind: "went",
      title: "Pottery evening at the studio",
      happenedAt: "2026-08-10T13:30:00.000Z",
      photoUrl: null,
      destinationKey: "telangana/hyderabad",
      category: "arts_creativity",
      eventId: refOf(ME_ENTRY_IDS.wentChecked),
      proof: "checked_in",
      checked: true,
      rating: 4,
      visibility: "friends",
      cheers: 0,
      cheeredBy: [],
    },
    {
      entryId: ME_ENTRY_IDS.wentSaid,
      kind: "went",
      title: "Indie night at the brewery",
      happenedAt: "2026-08-07T14:00:00.000Z",
      photoUrl: null,
      destinationKey: "telangana/hyderabad",
      category: "entertainment",
      eventId: refOf(ME_ENTRY_IDS.wentSaid),
      proof: "said_you_went",
      checked: false,
      rating: null,
      visibility: "only_me",
      cheers: 0,
      cheeredBy: [],
    },
    {
      entryId: ME_ENTRY_IDS.plan,
      kind: "plan",
      title: "Gokarna weekend with friends",
      happenedAt: "2026-08-03T06:30:00.000Z",
      photoUrl: null,
      destinationKey: "karnataka/gokarna",
      category: null,
      proof: "with_friends",
      checked: false,
      rating: null,
      visibility: "only_me",
      cheers: 0,
      cheeredBy: [],
    },
    {
      entryId: ME_ENTRY_IDS.table,
      kind: "table",
      title: "Supper table in Banjara Hills",
      happenedAt: "2026-07-30T14:30:00.000Z",
      photoUrl: null,
      destinationKey: "telangana/hyderabad",
      category: "food_drink",
      proof: "table_check_in",
      checked: true,
      rating: null,
      visibility: "only_me",
      cheers: 0,
      cheeredBy: [],
    },
  ];
}

/** The one Did you go question: an event that ended four days before now. */
export const ME_DID_YOU_GO = Object.freeze({
  eventId: "e7e10000-0000-4000-8000-000000000009",
  title: "Open mic at Lamakaan",
  startsAt: "2026-08-15T13:00:00.000Z",
});

/** Where the question's event was, for the went entry a yes adds. */
export const ME_DID_YOU_GO_PLACE = Object.freeze({
  destinationKey: "telangana/hyderabad",
  category: "entertainment" as const,
});

/** `first_step`, `explorer` and `early_bird` as yuvoy-api `internal/badges` names them. */
const FIRST_STEP = {
  key: "first_step",
  name: "First step",
  emoji: "👣",
  description: "Your first thing done",
};
const EXPLORER = {
  key: "explorer",
  name: "Explorer",
  emoji: "🧭",
  description: "Things in 3 different departments",
};
const EARLY_BIRD = {
  key: "early_bird",
  name: "Early bird",
  emoji: "🌅",
  description: "2 things that started before 10 in the morning",
};

function evidence(entries: LifeEntry[], i: number) {
  const e = entries[i]!;
  return { entryId: e.entryId, title: e.title, happenedAt: e.happenedAt };
}

/** The caller's badges under `me-life-list`: two earned, two on the way. */
export function meBadges(): { earned: Badge[]; inProgress: BadgeProgress[] } {
  const entries = meEntries();
  return {
    earned: [
      {
        ...FIRST_STEP,
        earnedAt: "2026-07-30T16:00:00.000Z",
        checked: true,
        seen: true,
        // The oldest entry: the table check-in.
        evidence: [evidence(entries, 5)],
      },
      {
        ...EXPLORER,
        earnedAt: "2026-08-17T06:00:00.000Z",
        // The said-you-went and the booked trip are not checked.
        checked: false,
        seen: false,
        evidence: [
          evidence(entries, 3),
          evidence(entries, 1),
          evidence(entries, 0),
        ],
      },
    ],
    inProgress: [
      { ...EARLY_BIRD, have: 1, need: 2 },
      {
        key: "monsoon_2026",
        name: "Monsoon 2026",
        emoji: "🌧️",
        description: "3 things outdoors before the rains end",
        have: 1,
        need: 3,
        endsOn: "2026-09-30",
      },
    ],
  };
}

/** How many entries `me-life-list-long` starts with: pages of 20, 20 and 5. */
export const ME_LONG_COUNT = 45;

const LONG_TITLES = [
  "Snorkel trip to Elephant Beach",
  "Night fishing with a local crew",
  "Private boat charter",
  "Mangrove kayak at dawn",
] as const;

/** The 39 older trips `me-life-list-long` adds after the six, a day apart, every other checked. */
export function longEntries(): LifeEntry[] {
  const all = meEntries();
  const oldest = Date.parse(all[all.length - 1]!.happenedAt);
  const out: LifeEntry[] = [];
  for (let i = 0; i < ME_LONG_COUNT - all.length; i++) {
    const checked = i % 2 === 0;
    out.push({
      entryId: `trip:b0a11000-0000-4000-8000-${(0x1000 + i).toString(16).padStart(12, "0")}`,
      kind: "trip",
      title: `${LONG_TITLES[i % LONG_TITLES.length]}, trip ${i + 1}`,
      happenedAt: new Date(oldest - (i + 1) * 24 * 60 * 60_000).toISOString(),
      photoUrl: null,
      destinationKey: "andaman/havelock",
      category: "adventure",
      experienceSlug: "try-dive-nemo-reef",
      proof: checked ? "checked_in" : "booked",
      checked,
      rating: null,
      visibility: "only_me",
      cheers: 0,
      cheeredBy: [],
    });
  }
  return out;
}

/**
 * `GET /me/settings` before the person changes anything: nothing chosen,
 * both emails on, women-only tables shown (the API's "true when never set").
 * Me's scenarios start with English chosen, as mobile's do.
 */
export function meSettings(languages: MySettings["languages"]): MySettings {
  return {
    analyticsConsent: null,
    reminderEmails: true,
    didYouGoEmails: true,
    goesWith: null,
    daySpend: null,
    cityTime: null,
    languages: [...languages],
    showWomenOnlyTables: true,
  };
}
