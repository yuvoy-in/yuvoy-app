/**
 * The ids, places and markets, for `found-fixtures.ts` (yuvoy-app#243 split it).
 * Import from `found-fixtures.ts`: it re-exports what the mocks and specs use.
 */
import type { components } from "../src/lib/api/schema.gen";

type ExplorePlace = components["schemas"]["ExplorePlace"];
type PlaceMarket = components["schemas"]["PlaceMarket"];

/* ------------------------------------------------------------------ ids */

/**
 * The ids an e2e spec names. Fixed UUIDs, because the contract types `id` as
 * one and the outcomes mock refuses anything else as a subject.
 *
 * `merged` is an id that no list carries: the API answers it with the card it
 * was merged into (`mergedInto`, the checked card), under the survivor's id,
 * which is how the card page learns to redirect.
 */
/** `foundFilters` on `GET /catalog/vocabulary`, as the live API sends it (yuvoy-api#589). */
export const FOUND_FILTER_ROWS: components["schemas"]["FoundFilterRow"][] = [
  {
    key: "budget",
    label: "Budget",
    localOnly: false,
    options: [
      { key: "free", label: "Free" },
      { key: "under_500", label: "Under ₹500" },
      { key: "under_1500", label: "Under ₹1,500" },
      { key: "any", label: "Any" },
    ],
  },
  {
    key: "timeOfDay",
    label: "Time of day",
    localOnly: false,
    options: [
      { key: "morning", label: "Morning" },
      { key: "afternoon", label: "Afternoon" },
      { key: "evening", label: "Evening" },
    ],
  },
  {
    key: "duration",
    label: "How long",
    localOnly: false,
    options: [
      { key: "under_2h", label: "Under 2 hours" },
      { key: "half_day", label: "Half a day" },
      { key: "longer", label: "Longer" },
    ],
  },
  {
    key: "setting",
    label: "Indoors or out",
    localOnly: false,
    options: [
      { key: "indoor", label: "Indoors" },
      { key: "outdoor", label: "Outdoors" },
    ],
  },
  {
    key: "suits",
    label: "Who it suits",
    localOnly: false,
    options: [
      { key: "solo", label: "Solo" },
      { key: "couples", label: "Couples" },
      { key: "friends", label: "Friends" },
      { key: "families", label: "Families" },
      { key: "kids", label: "Kids" },
    ],
  },
  {
    key: "difficulty",
    label: "How hard",
    localOnly: true,
    options: [
      { key: "easy", label: "Easy" },
      { key: "moderate", label: "Moderate" },
      { key: "hard", label: "Hard" },
    ],
  },
];

export const FOUND_IDS = Object.freeze({
  checked: "3c9e5a10-7b2d-4e8f-9a61-2d4f6b8c0a01",
  found: "3c9e5a10-7b2d-4e8f-9a61-2d4f6b8c0a02",
  lapsed: "3c9e5a10-7b2d-4e8f-9a61-2d4f6b8c0a03",
  cancelled: "3c9e5a10-7b2d-4e8f-9a61-2d4f6b8c0a04",
  free: "3c9e5a10-7b2d-4e8f-9a61-2d4f6b8c0a05",
  unpriced: "3c9e5a10-7b2d-4e8f-9a61-2d4f6b8c0a06",
  undated: "3c9e5a10-7b2d-4e8f-9a61-2d4f6b8c0a07",
  ended: "3c9e5a10-7b2d-4e8f-9a61-2d4f6b8c0a08",
  merged: "3c9e5a10-7b2d-4e8f-9a61-2d4f6b8c0a99",
  mergedInto: "3c9e5a10-7b2d-4e8f-9a61-2d4f6b8c0a01",
});

/** Bengaluru's three, all checked. */
export const BENGALURU_IDS = Object.freeze({
  ride: "6b0e2d14-3f5a-4c71-9d28-0a1b2c3d4e01",
  coffee: "6b0e2d14-3f5a-4c71-9d28-0a1b2c3d4e02",
  poetry: "6b0e2d14-3f5a-4c71-9d28-0a1b2c3d4e03",
});

export const BENGALURU = "karnataka/bengaluru";
export const COORG = "karnataka/coorg";

/* --------------------------------------------------------------- places */

/**
 * The discover market, as `listMyPlaces` sends it to a staff caller while
 * `explore` is at `staff`: both places `visibleTo: staff`. `listPlaces` never
 * carries it at that stage; at `all` both lists carry `KARNATAKA_FOR_ALL`.
 */
export const KARNATAKA_MARKET: PlaceMarket = {
  key: "karnataka",
  name: "Karnataka",
  mode: "discover",
  timezone: "Asia/Kolkata",
  currency: "INR",
  destinations: [
    { key: BENGALURU, name: "Bengaluru", kind: "local", visibleTo: "staff" },
    { key: COORG, name: "Coorg", kind: "travel", visibleTo: "staff" },
  ],
};

/** The same market once `explore` is open to everybody. */
export const KARNATAKA_FOR_ALL: PlaceMarket = {
  ...KARNATAKA_MARKET,
  destinations: KARNATAKA_MARKET.destinations.map((d) => ({
    ...d,
    visibleTo: "all" as const,
  })),
};

/** Each discover place as `FoundItemList.place` and the card page name it. */
export const FOUND_PLACES: Readonly<Record<string, ExplorePlace>> = {
  [BENGALURU]: {
    key: BENGALURU,
    name: "Bengaluru",
    regionName: "Karnataka",
    kind: "local",
    timezone: "Asia/Kolkata",
  },
  [COORG]: {
    key: COORG,
    name: "Coorg",
    regionName: "Karnataka",
    kind: "travel",
    timezone: "Asia/Kolkata",
  },
};
