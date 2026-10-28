/**
 * What was found in each discover place (yuvoy-app#179, R2-T4), typed from the
 * pinned contract: the cards `GET /events` lists and the pages
 * `GET /events/{id}` answers.
 *
 * Two places, one of each kind, because the API treats them differently:
 *
 *   - **Bengaluru** (`karnataka/bengaluru`) is a home city (`local`), where
 *     only cards a person checked ever show. Three, each checked a different
 *     way, so the trust line has three shapes to render.
 *   - **Coorg** (`karnataka/coorg`) is a trip place (`travel`), where cards
 *     Trigo found show too, labelled. One card for each state the feed and the
 *     card page must draw: checked, found, lapsed, cancelled, undated, free
 *     and unpriced. Beside them, a card that has ended (never listed, its page
 *     still answers) and an id that was merged into the checked card.
 *
 * Everything here is a SAMPLE: organisers are "Sample ...", and every address
 * is on the reserved `.example` domain, so nothing points at a real business.
 * The trust line, the price words and the card page's sentence are written as
 * the API composes them, the same way mobile's twin does
 * (yuvoy-mobile `packages/mocks/src/found-fixtures.ts`): the web renders them
 * verbatim, so a mock that paraphrased them would test a sentence no server
 * sends.
 *
 * ## Dates
 *
 * The cards are dated from the mocks' own clock (`mockNow`, which starts at
 * `FIXTURE_NOW` and runs), counted in the place's calendar, when a request is
 * answered. The API only ever lists what is coming up, so a fixed date would
 * go stale against the running clock and the "this has ended" branch would
 * swallow the whole list. Each builder takes `now` for that reason.
 */
import type { components } from "../src/lib/api/schema.gen";

type FoundItem = components["schemas"]["FoundItem"];
type FoundItemDetail = components["schemas"]["FoundItemDetail"];
type ExplorePlace = components["schemas"]["ExplorePlace"];
type PlaceMarket = components["schemas"]["PlaceMarket"];
type Category = components["schemas"]["Category"];
type Check = FoundItem["check"];
type Price = FoundItem["price"];

/* ------------------------------------------------------------------ ids */

/**
 * The ids an e2e spec names. Fixed UUIDs, because the contract types `id` as
 * one and the outcomes mock refuses anything else as a subject.
 *
 * `merged` is an id that no list carries: the API answers it with the card it
 * was merged into (`mergedInto`, the checked card), under the survivor's id,
 * which is how the card page learns to redirect.
 */
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

/* ---------------------------------------------------------------- words */

/** India keeps one offset all year: the place's day is this far ahead of UTC. */
const IST_MS = 5.5 * 60 * 60_000;
const DAY_MS = 24 * 60 * 60_000;
const WEEKDAYS = "Sun Mon Tue Wed Thu Fri Sat".split(" ");
const MONTHS = "Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec".split(" ");

/** Today plus `offset` days in the place, as a calendar date (`2026-08-20`). */
export function placeDate(offset: number, now: number): string {
  return new Date(now + IST_MS + offset * DAY_MS).toISOString().slice(0, 10);
}

/** That day as the API's trust line writes it (Go's "Mon, 2 Jan"). */
function spoken(offset: number, now: number): string {
  const d = new Date(now + IST_MS + offset * DAY_MS);
  return `${WEEKDAYS[d.getUTCDay()]}, ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

/** A person's check `ago` days back, at 11:00 in the place. */
function checkedAt(ago: number, now: number): string {
  return `${placeDate(-ago, now)}T05:30:00Z`;
}

/** How a person checked: the trust line's ending, and the page's sentence. */
type Method = { line: string; sentence: (on: string) => string };
const onPage = (page: string): Method => ({
  line: ` · ${page}`,
  sentence: (on) =>
    `A person at Yuvoy checked the date, time, place and price on the ${page} on ${on}.`,
});
const ORGANISER = onPage("organiser's page");
const VENUE = onPage("venue's page");
const IN_PERSON: Method = {
  line: " · in person",
  sentence: (on) => `A person at Yuvoy checked this in person on ${on}.`,
};

function checked(
  host: string,
  path: string,
  how: Method,
  ago: number,
  now: number,
): Check {
  const on = spoken(-ago, now);
  return {
    tier: "staff_checked",
    label: `Checked by Yuvoy · ${on}${how.line}`,
    checkedAt: checkedAt(ago, now),
    lapsed: false,
    sentence: how.sentence(on),
    sourceName: host,
    sourceUrl: `https://${host}${path}`,
  };
}

function confirmed(
  host: string,
  path: string,
  ago: number,
  now: number,
): Check {
  const on = spoken(-ago, now);
  return {
    tier: "organiser_confirmed",
    label: `Confirmed with the organiser · ${on}`,
    checkedAt: checkedAt(ago, now),
    lapsed: false,
    sentence: `A person at Yuvoy confirmed this with the organiser on ${on}.`,
    sourceName: host,
    sourceUrl: `https://${host}${path}`,
  };
}

/** Trigo's find. `host` null is a source no page may be linked to. */
function trigo(host: string | null, path = "/"): Check {
  return {
    tier: "found",
    label: host
      ? `Found by Trigo · not checked yet · source: ${host}`
      : "Found by Trigo · not checked yet",
    checkedAt: null,
    lapsed: false,
    sentence: host
      ? `Trigo found this on ${host}. Nobody at Yuvoy has checked it yet, so check the details on their page before you go.`
      : "Trigo found this. Nobody at Yuvoy has checked it yet, so check the details on their page before you go.",
    sourceName: host,
    sourceUrl: host ? `https://${host}${path}` : null,
  };
}

/**
 * A check that no longer counts: the tier falls back to `found`, and the API
 * has no sentence for its page yet, so the key is absent rather than empty.
 */
function lapsed(host: string, path: string, ago: number, now: number): Check {
  return {
    tier: "found",
    label: `Last checked by Yuvoy ${ago} days ago`,
    checkedAt: checkedAt(ago, now),
    lapsed: true,
    sourceName: host,
    sourceUrl: `https://${host}${path}`,
  };
}

const FREE: Price = { kind: "free", from: null, text: "Free" };
const UNPRICED: Price = {
  kind: "unknown",
  from: null,
  text: "Price on the organiser's page",
};

/** Whole rupees in the Indian grouping (1,500; 1,25,000). */
function grouped(rupees: number): string {
  const digits = String(rupees);
  if (digits.length <= 3) return digits;
  const lakhs = digits.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ",");
  return `${lakhs},${digits.slice(-3)}`;
}

/** A price a person checked, or (`asListed`) one only the page states. */
function paid(rupees: number, asListed = false): Price {
  return {
    kind: "paid",
    from: { amountMinor: rupees * 100, currency: "INR" },
    text: `From ₹${grouped(rupees)}${asListed ? ", as listed" : ""}`,
  };
}

/* ---------------------------------------------------------------- cards */

/** A card, and what only its page says. */
export interface FoundSample {
  card: FoundItem;
  summary: string | null;
  organiser: string | null;
  /** Other pages it is listed on, by host ("Also listed on"). */
  also?: string[];
}

const at = (offset: number, now: number, startTime: string | null) => ({
  startsOn: placeDate(offset, now),
  startTime,
  endsOn: null,
  repeats: null,
});

function bengaluru(now: number): FoundSample[] {
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

function coorg(now: number): FoundSample[] {
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
function ended(now: number): FoundSample {
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
function fillers(key: string, count: number, now: number): FoundSample[] {
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

/* ---------------------------------------------------------------- order */

/**
 * The API's order: by local day, checked before found within a day, then
 * start time, then department; undated items last. Applied rather than
 * written by hand, so the long list cannot drift out of it.
 */
function inServerOrder(samples: FoundSample[]): FoundSample[] {
  const rank = (s: FoundSample) => (s.card.check.tier === "found" ? 1 : 0);
  return [...samples].sort((a, b) => {
    const da = a.card.when.startsOn;
    const db = b.card.when.startsOn;
    if (da !== db) {
      if (da === null) return 1;
      if (db === null) return -1;
      return da < db ? -1 : 1;
    }
    if (rank(a) !== rank(b)) return rank(a) - rank(b);
    const ta = a.card.when.startTime ?? "99:99";
    const tb = b.card.when.startTime ?? "99:99";
    if (ta !== tb) return ta < tb ? -1 : 1;
    return (a.card.department ?? "~").localeCompare(b.card.department ?? "~");
  });
}

/** The shapes a place's list takes: as drawn, or long enough to page. */
export type FoundShape = "full" | "long";

/**
 * A place's listed cards in the API's order, or null for a key that is not a
 * discover place (Andaman's included: the API answers a bookable place 404).
 */
export function foundSamples(
  key: string,
  now: number,
  shape: FoundShape = "full",
): FoundSample[] | null {
  const own =
    key === BENGALURU ? bengaluru(now) : key === COORG ? coorg(now) : null;
  if (!own) return null;
  if (shape === "full") return inServerOrder(own);
  return inServerOrder([
    ...own,
    ...fillers(key, LONG_LIST_LENGTH - own.length, now),
  ]);
}

/** A card by id, in any shape of any place, ended included; with its place. */
export function sampleById(
  id: string,
  now: number,
): { sample: FoundSample; place: ExplorePlace } | null {
  const asked = id.toLowerCase();
  if (asked === FOUND_IDS.ended) {
    return { sample: ended(now), place: FOUND_PLACES[COORG]! };
  }
  for (const key of Object.keys(FOUND_PLACES)) {
    const sample = foundSamples(key, now, "long")!.find(
      (s) => s.card.id === asked,
    );
    if (sample) return { sample, place: FOUND_PLACES[key]! };
  }
  return null;
}

/** A card as the lists send it: the page's sentence is on `getEvent` only. */
export function listCard(card: FoundItem): FoundItem {
  const check = { ...card.check };
  delete check.sentence;
  return { ...card, check };
}

/**
 * A card's page as `GET /events/{id}` answers it. `indexable` is the API's
 * rule: a checked, live card (not lapsed, not cancelled, not ended) in a
 * place open to all, while `explore` is at `all`.
 */
export function foundDetail(
  sample: FoundSample,
  place: ExplorePlace,
  exploreAll: boolean,
): FoundItemDetail {
  const { card } = sample;
  const sources = [
    ...(card.check.sourceUrl
      ? [{ name: card.check.sourceName ?? "", url: card.check.sourceUrl }]
      : []),
    ...(sample.also ?? []).map((host) => ({
      name: host,
      url: `https://${host}/e/${card.id}`,
    })),
  ];
  const live = card.status !== "ended" && card.status !== "cancelled";
  return {
    ...card,
    place,
    // Our words, only once a person has ever checked the item.
    summary: card.check.checkedAt ? sample.summary : null,
    organiser: sample.organiser,
    sources,
    indexable:
      exploreAll && card.check.tier !== "found" && !card.check.lapsed && live,
    // Nothing stated: `checkedCities` is off, so the web never shows the block.
    stated: {
      endTime: null,
      setting: null,
      suits: [],
      difficulty: null,
      venueType: null,
      included: null,
      goodToKnow: null,
    },
  };
}

/** Whether `id` is a found card the outcomes mock should know as a subject. */
export function isFoundId(id: string, now: number): boolean {
  return sampleById(id, now) !== null;
}

/** The receipt's words, as the API sends them (yuvoy-api `event_reports.go`). */
export const REPORT_RECEIPTS = {
  everyone:
    "Thanks. We've taken this card down while someone at Yuvoy checks it.",
  you: "Thanks. We've hidden this card for you, and someone at Yuvoy will check it.",
  device:
    "Thanks. We've hidden this card on this device, and someone at Yuvoy will check it.",
} as const;

/** The case a signed-in reporter with a number is given. */
export const REPORT_REFERENCE = "SR-3F9A12C0";
