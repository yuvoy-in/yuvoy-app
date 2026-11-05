// This file was split in four (yuvoy-app#243). It keeps the order, the lists
// and the card page, and re-exports the rest by name, so importers are unchanged:
// found-fixture-ids.ts has the ids and places, found-fixture-words.ts the trust
// line and price words, found-fixture-cards.ts the cards and the long list.
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
import { BENGALURU, COORG, FOUND_IDS, FOUND_PLACES } from "./found-fixture-ids";
import { lapsed } from "./found-fixture-words";
import {
  bengaluru,
  coorg,
  ended,
  fillers,
  type FoundSample,
  LONG_LIST_LENGTH,
} from "./found-fixture-cards";

type FoundItem = components["schemas"]["FoundItem"];
type FoundItemDetail = components["schemas"]["FoundItemDetail"];
type ExplorePlace = components["schemas"]["ExplorePlace"];
type StatedFacts = components["schemas"]["StatedFacts"];

export {
  BENGALURU,
  BENGALURU_IDS,
  COORG,
  FOUND_FILTER_ROWS,
  FOUND_IDS,
  FOUND_PLACES,
  KARNATAKA_FOR_ALL,
  KARNATAKA_MARKET,
} from "./found-fixture-ids";
export {
  checked,
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
export type { Method } from "./found-fixture-words";
export { LONG_LIST_LENGTH } from "./found-fixture-cards";
export type { FoundSample } from "./found-fixture-cards";

/* ---------------------------------------------------------------- order */

/**
 * The API's order: by local day, checked before found within a day, then
 * start time, then department; undated items last. Applied rather than
 * written by hand, so the long list cannot drift out of it.
 */
export function inServerOrder(samples: FoundSample[]): FoundSample[] {
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
    stated: statedOf(sample),
    /*
      Required since the ad4fa894 pin. The web offers no claim (the card page
      has no organiser button, R2-T4 notes), so a card never reads as one.
    */
    claimable: false,
  };
}

/** Runs over more than one day. */
export const multiDay = (item: FoundItem) =>
  item.when.endsOn !== null &&
  item.when.startsOn !== null &&
  item.when.endsOn > item.when.startsOn;

const STATED_NONE: StatedFacts = {
  endTime: null,
  setting: null,
  suits: [],
  difficulty: null,
  venueType: null,
  included: null,
  goodToKnow: null,
};

/**
 * What a card's page states, as the API sends it (R3-T6, yuvoy-app#195):
 * only what the page states; no end time on an item over more than one day;
 * how hard and the note never on a card no person checked (or one whose
 * check ran out, whose tier is `found` again), whatever its page says. A
 * card with no `stated` states nothing, as every R2 fixture.
 */
export function statedOf(sample: FoundSample): StatedFacts {
  const page = { ...STATED_NONE, ...sample.stated };
  const checkedByPerson = sample.card.check.tier !== "found";
  return {
    ...page,
    suits: [...page.suits],
    endTime: multiDay(sample.card) ? null : page.endTime,
    difficulty: checkedByPerson ? page.difficulty : null,
    goodToKnow: checkedByPerson ? page.goodToKnow : null,
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
