/**
 * Each place's cards and the long list, for `found-fixtures.ts` (yuvoy-app#243 split it).
 * Import from `found-fixtures.ts`: it re-exports what the mocks and specs use.
 */
import type { components } from "../src/lib/api/schema.gen";
import {
  BENGALURU,
  BENGALURU_IDS,
  FOUND_IDS,
  FOUND_PLACES,
} from "./found-fixture-ids";
import {
  checked,
  confirmed,
  FREE,
  IN_PERSON,
  lapsed,
  ORGANISER,
  paid,
  placeDate,
  trigo,
  UNPRICED,
  VENUE,
} from "./found-fixture-words";

type FoundItem = components["schemas"]["FoundItem"];
type Category = components["schemas"]["Category"];
type StatedFacts = components["schemas"]["StatedFacts"];

/* ---------------------------------------------------------------- cards */

/** A card, and what only its page says. */
export interface FoundSample {
  card: FoundItem;
  summary: string | null;
  organiser: string | null;
  /** Other pages it is listed on, by host ("Also listed on"). */
  also?: string[];
  /** What its own page states, as the finder recorded it (R3-T6); nothing when absent. */
  stated?: Partial<StatedFacts>;
}

const at = (offset: number, now: number, startTime: string | null) => ({
  startsOn: placeDate(offset, now),
  startTime,
  endsOn: null,
  repeats: null,
});

export function bengaluru(now: number): FoundSample[] {
  return [
    {
      card: {
        id: BENGALURU_IDS.ride,
        kind: "recurring_event",
        department: "sports",
        title: "Morning cycle ride round Cubbon Park",
        when: { ...at(1, now, "06:30"), repeats: "Every week" },
        where: {
          placeText: "Sample Cycle Club, Cubbon Park gate",
          town: "Bengaluru",
        },
        price: FREE,
        status: "scheduled",
        check: checked("cycleclub.example", "/thursdays", ORGANISER, 1, now),
        seeDetailsUrl: "https://cycleclub.example/thursdays",
      },
      summary:
        "An easy ten kilometres at walking pace, with a stop for coffee at the bandstand. Bring your own cycle.",
      organiser: "Sample Cycle Club",
    },
    {
      card: {
        id: BENGALURU_IDS.coffee,
        kind: "event",
        department: "food_drink",
        title: "Filter coffee tasting in Basavanagudi",
        when: at(2, now, "11:00"),
        where: {
          placeText: "Sample Coffee House, Bull Temple Road",
          town: "Bengaluru",
        },
        price: paid(350),
        status: "scheduled",
        check: confirmed("coffeehouse.example", "/tasting", 2, now),
        seeDetailsUrl: "https://coffeehouse.example/tasting",
      },
      summary:
        "Four roasts brewed the old way, and how chicory changes the cup.",
      organiser: "Sample Coffee House",
    },
    {
      card: {
        id: BENGALURU_IDS.poetry,
        kind: "event",
        department: "entertainment",
        title: "Open mic poetry night",
        when: at(3, now, "19:00"),
        where: {
          placeText: "Sample Bookshop, Church Street",
          town: "Bengaluru",
        },
        price: paid(200),
        // Its date or venue changed since it was first listed.
        status: "moved",
        check: checked("bookshop.example", "/open-mic", IN_PERSON, 3, now),
        seeDetailsUrl: "https://bookshop.example/open-mic",
      },
      summary: "Five minutes each, in any language. Sign up at the door.",
      organiser: "Sample Bookshop",
    },
  ];
}

export function coorg(now: number): FoundSample[] {
  return [
    {
      card: {
        id: FOUND_IDS.checked,
        kind: "activity",
        department: "food_drink",
        title: "Coffee estate walk and tasting",
        when: at(1, now, "09:00"),
        where: {
          placeText: "Sample Coffee Estate, Madikeri road",
          town: "Madikeri",
        },
        price: paid(800),
        status: "scheduled",
        check: checked("coffee-estate.example", "/walk", ORGANISER, 2, now),
        seeDetailsUrl: "https://coffee-estate.example/walk",
      },
      summary:
        "Two hours through the estate with the planter, from the bush to the cup, and a tasting of three roasts.",
      organiser: "Sample Coffee Estate",
      also: ["coorgtrails.example", "estatewalks.example"],
    },
    {
      card: {
        id: FOUND_IDS.found,
        kind: "activity",
        department: "adventure",
        title: "White water rafting on the Barapole",
        when: at(1, now, "10:30"),
        where: {
          placeText: "Sample Rafting Camp, Kithu Kakkatu",
          town: "Virajpet",
        },
        price: paid(1500, true),
        status: "scheduled",
        check: trigo("coorgrafting.example", "/barapole"),
        // `www.` on the link and not on the source: "Opens {host}" drops it.
        seeDetailsUrl: "https://www.coorgrafting.example/barapole",
      },
      summary: null,
      organiser: null,
    },
    {
      card: {
        id: FOUND_IDS.lapsed,
        kind: "event",
        department: "nature_wildlife",
        title: "Sunset walk at Raja's Seat",
        when: at(2, now, "17:30"),
        where: { placeText: "Raja's Seat garden", town: "Madikeri" },
        price: paid(50),
        status: "scheduled",
        check: lapsed("madikeriwalks.example", "/sunset", 12, now),
        seeDetailsUrl: "https://madikeriwalks.example/sunset",
      },
      summary: "A short guided walk to the viewpoint, timed for the light.",
      organiser: "Sample Madikeri Walks",
    },
    {
      card: {
        id: FOUND_IDS.cancelled,
        kind: "event",
        department: "nature_wildlife",
        title: "Morning at Dubare elephant camp",
        when: at(3, now, "08:00"),
        where: { placeText: "Dubare camp, river side", town: "Kushalnagar" },
        price: paid(600),
        status: "cancelled",
        check: checked("dubare.example", "/mornings", VENUE, 1, now),
        seeDetailsUrl: "https://dubare.example/mornings",
      },
      summary:
        "Bath time at the camp, and a walk along the Kaveri with a naturalist.",
      organiser: "Sample Dubare Camp",
    },
    {
      card: {
        id: FOUND_IDS.free,
        kind: "event",
        department: "culture_heritage",
        title: "Heritage talk at Madikeri Fort",
        when: at(4, now, "16:00"),
        where: { placeText: "Madikeri Fort, museum hall", town: "Madikeri" },
        price: FREE,
        status: "scheduled",
        check: trigo("madikerifort.example", "/talks"),
        seeDetailsUrl: "https://madikerifort.example/talks",
      },
      summary: null,
      organiser: null,
    },
    {
      card: {
        id: FOUND_IDS.unpriced,
        kind: "event",
        department: "food_drink",
        title: "Kodava food evening",
        when: at(5, now, "19:30"),
        where: { placeText: null, town: "Madikeri" },
        price: UNPRICED,
        status: "scheduled",
        // No source page may be linked, so there is no See details either.
        check: trigo(null),
      },
      summary: null,
      organiser: null,
    },
    {
      card: {
        id: FOUND_IDS.undated,
        kind: "activity",
        department: "adventure",
        title: "Guided trek to Tadiandamol",
        when: { startsOn: null, startTime: null, endsOn: null, repeats: null },
        where: { placeText: null, town: "Kakkabe" },
        price: paid(1200, true),
        status: "scheduled",
        check: trigo("coorgtrails.example", "/tadiandamol"),
        seeDetailsUrl: "https://coorgtrails.example/tadiandamol",
      },
      summary: null,
      organiser: null,
    },
  ];
}

/**
 * Coorg's card that has ended: never listed, as the API lists only what is
 * coming up, while its page answers `200` with `status: ended`.
 */
export function ended(now: number): FoundSample {
  return {
    card: {
      id: FOUND_IDS.ended,
      kind: "event",
      department: "food_drink",
      title: "Honey and spice fair",
      when: {
        startsOn: placeDate(-3, now),
        startTime: "10:00",
        endsOn: placeDate(-2, now),
        repeats: null,
      },
      where: {
        placeText: "Sample Fair Ground, Gonikoppal",
        town: "Gonikoppal",
      },
      price: FREE,
      status: "ended",
      check: checked("spicefair.example", "/2026", ORGANISER, 6, now),
      seeDetailsUrl: "https://spicefair.example/2026",
    },
    summary:
      "Stalls of forest honey, pepper and cardamom from the estates around.",
    organiser: "Sample Spice Growers",
  };
}

/* ----------------------------------------------------------- the long list */

const FILLER_NOUNS = ["walk", "workshop", "concert", "market", "talk", "class"];
const FILLER_DEPARTMENTS: Category[] = [
  "adventure",
  "nature_wildlife",
  "food_drink",
];

/** How long `found-long` makes each place's list: past one page of 30. */
export const LONG_LIST_LENGTH = 45;

/**
 * The cards that make a place's list long enough to page, dated after the
 * place's own cards (from a week on) so the order stays the API's. In a home
 * city every one is checked, as there; elsewhere every other one is found.
 */
export function fillers(
  key: string,
  count: number,
  now: number,
): FoundSample[] {
  const local = FOUND_PLACES[key]!.kind === "local";
  const place = key === BENGALURU ? 1 : 2;
  const town = FOUND_PLACES[key]!.name;
  return Array.from({ length: count }, (_, i) => {
    const id = `9f3c0a00-0000-4000-8000-${(place * 1000 + i).toString(16).padStart(12, "0")}`;
    const host = `sample${i + 1}.example`;
    return {
      card: {
        id,
        kind: "event" as const,
        department: FILLER_DEPARTMENTS[i % FILLER_DEPARTMENTS.length]!,
        title: `Sample ${FILLER_NOUNS[i % FILLER_NOUNS.length]} ${i + 1}`,
        when: at(
          7 + Math.floor(i / 3),
          now,
          `${String(9 + (i % 3) * 3).padStart(2, "0")}:00`,
        ),
        where: { placeText: `Sample venue ${i + 1}`, town },
        price: i % 4 === 0 ? FREE : paid(100 * (i + 1)),
        status: "scheduled" as const,
        check:
          local || i % 2 === 0
            ? checked(host, "/", ORGANISER, 1 + (i % 5), now)
            : trigo(host),
        seeDetailsUrl: `https://${host}/`,
      },
      summary: null,
      organiser: null,
    };
  });
}
