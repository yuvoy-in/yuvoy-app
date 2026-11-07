/**
 * What found cards' own pages state (yuvoy-app#195, R3-T6): the cards the
 * four rows of the filter sheet narrow, and the pages "As listed" is drawn
 * on, under `found-stated-facts` (and `found-stated-closed`, the same world
 * with `checkedCities` closed).
 *
 * On R3's clock (`CHECKED_NOW`, Friday 21 August 2026, 17:30 in Kolkata), as
 * `found-checked-fixtures.ts` is, and beside its cards: Bengaluru answers
 * the week there plus the nine below, 21 cards, so the list has a page two
 * and a cursor; Coorg answers its R2 cards plus the two below. None of the
 * week's or R2's cards states a fact, so each is an item that states
 * nothing, except that the week's fair runs over three days and so is
 * `longer`, as the API counts a multi-day item.
 *
 * ## Bengaluru (`local`, every card checked)
 *
 * A home city lists only cards whose check counts, and answers 404 for any
 * other (yuvoy-api `found_items_public.go`), so no card here is found or
 * lapsed.
 *
 * Each states the fact it is here for, with a start time of 10:00 where its
 * length is the point:
 *
 *   - kayaking, 10:00 to 11:30: under 2 hours; outdoors; friends, families;
 *     easy; and all seven facts, for the checked page;
 *   - pottery, 10:00 to 12:00: half a day at its lower edge; indoors; solo,
 *     couples; moderate;
 *   - trek, 10:00 to 15:00: half a day at its upper edge; outdoors; friends;
 *     hard;
 *   - cooking class, 10:00 to 15:30: longer; indoors; couples, families;
 *   - kite festival, three days with an end time on its page: longer, and
 *     no end time sent; outdoors; kids, families;
 *   - planetarium, start time only: no length; indoors and outdoors; kids,
 *     families; easy;
 *   - science museum, start time only: indoors; kids;
 *   - evening walk: states nothing;
 *   - calligraphy: states only what is included.
 *
 * ## Coorg (`travel`)
 *
 *   - river kayaking, found by Trigo and checked by nobody: the kayaking
 *     card's facts, so its page shows them without how hard and the note;
 *   - climbing, its check run out (tier `found`, `lapsed`): outdoors, and
 *     hard and a note on its page, neither of which the API sends.
 *
 * Samples, as everything in `found-fixtures.ts` is: "Sample" organisers and
 * `.example` hosts.
 */
import type { components } from "../src/lib/api/schema.gen";
import {
  BENGALURU,
  COORG,
  FOUND_PLACES,
  FREE,
  IN_PERSON,
  ORGANISER,
  VENUE,
  checked,
  foundSamples,
  inServerOrder,
  lapsed,
  paid,
  placeDate,
  trigo,
  type FoundSample,
  type Method,
} from "./found-fixtures";
import { CHECKED_NOW, checkedWeek } from "./found-checked-fixtures";

type FoundItem = components["schemas"]["FoundItem"];
type ExplorePlace = components["schemas"]["ExplorePlace"];
type StatedFacts = components["schemas"]["StatedFacts"];

/** The ids of the cards that state facts, for a spec that opens one. */
export const STATED_IDS = Object.freeze({
  kayak: "5d2b8c40-1e3f-4a5b-9c6d-7e8f9a0b1c01",
  pottery: "5d2b8c40-1e3f-4a5b-9c6d-7e8f9a0b1c02",
  trek: "5d2b8c40-1e3f-4a5b-9c6d-7e8f9a0b1c03",
  cooking: "5d2b8c40-1e3f-4a5b-9c6d-7e8f9a0b1c04",
  kites: "5d2b8c40-1e3f-4a5b-9c6d-7e8f9a0b1c05",
  planetarium: "5d2b8c40-1e3f-4a5b-9c6d-7e8f9a0b1c06",
  museum: "5d2b8c40-1e3f-4a5b-9c6d-7e8f9a0b1c07",
  walk: "5d2b8c40-1e3f-4a5b-9c6d-7e8f9a0b1c08",
  calligraphy: "5d2b8c40-1e3f-4a5b-9c6d-7e8f9a0b1c09",
  climbing: "5d2b8c40-1e3f-4a5b-9c6d-7e8f9a0b1c0a",
  riverKayak: "5d2b8c40-1e3f-4a5b-9c6d-7e8f9a0b1c0b",
});

/** Their titles, as a spec finds them on the page. */
export const STATED_TITLES = Object.freeze({
  kayak: "Kayaking on Hebbal lake",
  pottery: "Pottery wheel class for beginners",
  trek: "Skandagiri day trek",
  cooking: "Bisi bele bath cooking class",
  kites: "Kite festival at Jakkur",
  planetarium: "Planetarium show for young stargazers",
  museum: "Hands-on hour at the science museum",
  walk: "Evening walk in Lalbagh",
  calligraphy: "Kannada calligraphy workshop",
  climbing: "Bouldering at Mandalpatti",
  riverKayak: "River kayaking taster on the Kaveri",
});

/** Each card's source, which "From {source}." names. */
export const STATED_SOURCES = Object.freeze({
  kayak: "hebbalkayak.example",
  calligraphy: "akshara.example",
  climbing: "mandalpattiboulders.example",
  riverKayak: "kaverikayak.example",
});

/** What the kayaking page states, all seven; the river taster's page says the same. */
export const KAYAK_STATED: StatedFacts = {
  endTime: "11:30",
  setting: "outdoor",
  suits: ["friends", "families"],
  difficulty: "easy",
  venueType: "lake",
  included: "A kayak, a paddle and a life jacket.",
  goodToKnow: "No experience needed. Wear clothes that can get wet.",
};

/** Only what is included: the calligraphy page. */
export const CALLIGRAPHY_INCLUDED = "Pens, ink and paper.";

type Key = keyof typeof STATED_IDS;

/** One of the cards: `day` is days from Friday 21 August. */
function card(
  key: Key,
  department: components["schemas"]["Category"],
  day: number,
  startTime: string | null,
  price: FoundItem["price"],
  venue: string,
  host: string,
  check: FoundItem["check"],
  stated: Partial<StatedFacts>,
): FoundSample {
  return {
    card: {
      id: STATED_IDS[key],
      kind: "event",
      department,
      title: STATED_TITLES[key],
      when: {
        startsOn: placeDate(day, CHECKED_NOW),
        startTime,
        endsOn: null,
        repeats: null,
      },
      where: { placeText: venue, town: "Bengaluru" },
      price,
      status: "scheduled",
      check,
      seeDetailsUrl: `https://${host}/${key}`,
    },
    summary: null,
    organiser: venue.split(",")[0]!,
    stated,
  };
}

/** A person's check of this week, `ago` days back. */
const by = (host: string, key: Key, how: Method, ago: number) =>
  checked(host, `/${key}`, how, ago, CHECKED_NOW);

/** Bengaluru's cards that state facts. See above. */
function statedLocal(): FoundSample[] {
  const kites = card(
    "kites",
    "events",
    5,
    "10:00",
    FREE,
    "Sample Kite Club, Jakkur airfield",
    "kiteclub.example",
    by("kiteclub.example", "kites", ORGANISER, 1),
    // Its page says it ends at 18:00 each day; over three days, none is sent.
    { endTime: "18:00", setting: "outdoor", suits: ["kids", "families"] },
  );
  kites.card.when.endsOn = placeDate(7, CHECKED_NOW);
  return [
    card(
      "kayak",
      "adventure",
      1,
      "10:00",
      paid(1200),
      "Sample Kayak Club, Hebbal lake",
      STATED_SOURCES.kayak,
      by(STATED_SOURCES.kayak, "kayak", ORGANISER, 1),
      KAYAK_STATED,
    ),
    card(
      "pottery",
      "arts_creativity",
      2,
      "10:00",
      paid(1400),
      "Sample Wheel Studio, Jayanagar",
      "wheelstudio.example",
      by("wheelstudio.example", "pottery", VENUE, 2),
      {
        endTime: "12:00",
        setting: "indoor",
        suits: ["solo", "couples"],
        difficulty: "moderate",
        venueType: "studio",
      },
    ),
    card(
      "trek",
      "adventure",
      3,
      "10:00",
      paid(900),
      "Sample Trek Club, Skandagiri base",
      "trekclub.example",
      by("trekclub.example", "trek", IN_PERSON, 0),
      {
        endTime: "15:00",
        setting: "outdoor",
        suits: ["friends"],
        difficulty: "hard",
      },
    ),
    card(
      "cooking",
      "food_drink",
      4,
      "10:00",
      paid(1800),
      "Sample Kitchen School, Basavanagudi",
      "kitchenschool.example",
      by("kitchenschool.example", "cooking", ORGANISER, 3),
      {
        endTime: "15:30",
        setting: "indoor",
        suits: ["couples", "families"],
      },
    ),
    kites,
    card(
      "planetarium",
      "learning",
      6,
      "10:00",
      paid(100),
      "Sample Planetarium, Sankey Road",
      "planetarium.example",
      by("planetarium.example", "planetarium", VENUE, 2),
      { setting: "both", suits: ["kids", "families"], difficulty: "easy" },
    ),
    card(
      "museum",
      "learning",
      8,
      "15:00",
      paid(80),
      "Sample Science Museum, Kasturba Road",
      "sciencemuseum.example",
      by("sciencemuseum.example", "museum", VENUE, 1),
      { setting: "indoor", suits: ["kids"] },
    ),
    card(
      "walk",
      "nature_wildlife",
      9,
      "18:00",
      FREE,
      "Sample Garden Walks, Lalbagh west gate",
      "gardenwalks.example",
      by("gardenwalks.example", "walk", ORGANISER, 0),
      {},
    ),
    card(
      "calligraphy",
      "arts_creativity",
      10,
      "11:00",
      paid(500),
      "Sample Akshara Studio, Malleswaram",
      STATED_SOURCES.calligraphy,
      by(STATED_SOURCES.calligraphy, "calligraphy", ORGANISER, 2),
      { included: CALLIGRAPHY_INCLUDED },
    ),
  ];
}

/** Coorg's cards that state facts: the kayaking facts, and the lapsed climbing. */
function statedTravel(): FoundSample[] {
  const river = card(
    "riverKayak",
    "adventure",
    1,
    "10:00",
    paid(1500, true),
    "Sample River Camp, Dubare",
    STATED_SOURCES.riverKayak,
    trigo(STATED_SOURCES.riverKayak, "/riverKayak"),
    KAYAK_STATED,
  );
  river.card.where.town = "Kushalnagar";
  river.organiser = null;
  const climbing = card(
    "climbing",
    "adventure",
    11,
    "07:00",
    paid(700),
    "Sample Boulder Crew, Mandalpatti road",
    STATED_SOURCES.climbing,
    lapsed(STATED_SOURCES.climbing, "/climbing", 12, CHECKED_NOW),
    {
      setting: "outdoor",
      difficulty: "hard",
      venueType: "boulders",
      goodToKnow: "Bring shoes with a good grip.",
    },
  );
  climbing.card.where.town = "Madikeri";
  return [river, climbing];
}

/** A place's list under the stated scenarios, in the API's order, or null. */
export function statedSamples(key: string): FoundSample[] | null {
  if (key === BENGALURU) {
    return inServerOrder([...checkedWeek(), ...statedLocal()]);
  }
  if (key === COORG) {
    return inServerOrder([
      ...foundSamples(COORG, CHECKED_NOW)!,
      ...statedTravel(),
    ]);
  }
  return null;
}

/** One of the cards that state facts by id, with its place, or null. */
export function statedSampleById(
  id: string,
): { sample: FoundSample; place: ExplorePlace } | null {
  const asked = id.toLowerCase();
  const local = statedLocal().find((s) => s.card.id === asked);
  if (local) return { sample: local, place: FOUND_PLACES[BENGALURU]! };
  const travel = statedTravel().find((s) => s.card.id === asked);
  return travel ? { sample: travel, place: FOUND_PLACES[COORG]! } : null;
}
