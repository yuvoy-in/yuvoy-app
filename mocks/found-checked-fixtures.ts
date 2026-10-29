/**
 * Bengaluru's week while `checkedCities` is open (yuvoy-app#180, R3-T2): the
 * cards the day chips, Free, search and the filter sheet narrow, on a clock
 * that stands still.
 *
 * ## The clock
 *
 * `CHECKED_NOW` is Friday 21 August 2026, 17:30 in Kolkata (12:00 UTC): half
 * an hour into the weekend, so "This weekend" is Friday 21 to Sunday 23 August
 * and a Friday card at 16:00 is today but not the weekend, while one at 18:00
 * is both. Under R3's scenarios every found route reads this instant (and says
 * it in its `Date` header), and the e2e spec puts the browser on the same one
 * with `page.clock.setFixedTime`.
 *
 * It stands still where `mockNow` runs, on purpose: the windows are the thing
 * under test, and a running clock on a server left up for an evening would
 * cross midnight and move "today" under a test. Nothing on the found feed
 * counts down, which is the reason `mockNow` runs.
 *
 * ## The cards
 *
 * Every one is checked, as a home city's are, and each check is from this
 * week (Monday 17 August on), so none is the stale card the weekend leaves
 * out. Each card is here for a rule:
 *
 *   - Friday 16:00 pottery: today, afternoon, not the weekend;
 *   - Friday 18:00 jazz: today and the weekend, evening, under ₹500;
 *   - the fair, Thursday to Saturday from 16:00: multi-day, so today, tomorrow
 *     and the weekend, and `longer`;
 *   - Saturday 07:00 try-dive: Adventure on Saturday, for "dive saturday";
 *   - Saturday flea market with no time: date-only, so never a time of day;
 *   - Saturday 06:30 yoga and Sunday 09:00 dive club: free;
 *   - Sunday 11:00 theatre: morning with no stated price, so under no budget;
 *   - Tuesday, Thursday and the Wednesday after: Coming up's next 14 days;
 *   - Monday 7 September: 17 days on, past Coming up.
 *
 * The dive club is called "Saturday Dive Club" and meets on a Sunday, so the
 * word "saturday" searched as plain text (`asText`) finds it while the
 * Saturday chip does not.
 *
 * Samples, as everything in `found-fixtures.ts` is: "Sample" organisers and
 * `.example` hosts.
 */
import type { components } from "../src/lib/api/schema.gen";
import {
  BENGALURU,
  FOUND_PLACES,
  FREE,
  IN_PERSON,
  ORGANISER,
  UNPRICED,
  VENUE,
  checked,
  inServerOrder,
  paid,
  placeDate,
  type FoundSample,
  type Method,
} from "./found-fixtures";

type FoundItem = components["schemas"]["FoundItem"];
type ExplorePlace = components["schemas"]["ExplorePlace"];

/** Friday 21 August 2026, 17:30 in Kolkata. See above. */
export const CHECKED_NOW = Date.parse("2026-08-21T12:00:00.000Z");

/** The ids of the week's cards, for a spec that opens one. */
export const CHECKED_IDS = Object.freeze({
  pottery: "7a1d3e20-5c4b-4f6a-8e19-3b2c1d0e5f01",
  jazz: "7a1d3e20-5c4b-4f6a-8e19-3b2c1d0e5f02",
  fair: "7a1d3e20-5c4b-4f6a-8e19-3b2c1d0e5f03",
  tryDive: "7a1d3e20-5c4b-4f6a-8e19-3b2c1d0e5f04",
  flea: "7a1d3e20-5c4b-4f6a-8e19-3b2c1d0e5f05",
  yoga: "7a1d3e20-5c4b-4f6a-8e19-3b2c1d0e5f06",
  diveClub: "7a1d3e20-5c4b-4f6a-8e19-3b2c1d0e5f07",
  theatre: "7a1d3e20-5c4b-4f6a-8e19-3b2c1d0e5f08",
  comedy: "7a1d3e20-5c4b-4f6a-8e19-3b2c1d0e5f09",
  heritage: "7a1d3e20-5c4b-4f6a-8e19-3b2c1d0e5f0a",
  birds: "7a1d3e20-5c4b-4f6a-8e19-3b2c1d0e5f0b",
  craft: "7a1d3e20-5c4b-4f6a-8e19-3b2c1d0e5f0c",
});

/** The week's cards by title, as a spec finds them on the page. */
export const CHECKED_TITLES = Object.freeze({
  pottery: "Wheel pottery taster",
  jazz: "Jazz on the lawns",
  fair: "Groundnut fair in Basavanagudi",
  tryDive: "Scuba try-dive in a training pool",
  flea: "Flea market at Jayanagar",
  yoga: "Sunrise yoga in Cubbon Park",
  diveClub: "Saturday Dive Club open day",
  theatre: "Kannada theatre matinee",
  comedy: "Stand-up comedy open mic",
  heritage: "Old Pete heritage walk",
  birds: "Bird walk at Hebbal lake",
  craft: "Handloom and craft fair",
});

type Key = keyof typeof CHECKED_IDS;

/** One of the week's cards: `day` is days from Friday 21 August. */
function card(
  key: Key,
  department: components["schemas"]["Category"],
  day: number,
  startTime: string | null,
  price: FoundItem["price"],
  venue: string,
  host: string,
  how: Method,
  ago: number,
): FoundSample {
  return {
    card: {
      id: CHECKED_IDS[key],
      kind: "event",
      department,
      title: CHECKED_TITLES[key],
      when: {
        startsOn: placeDate(day, CHECKED_NOW),
        startTime,
        endsOn: null,
        repeats: null,
      },
      where: { placeText: venue, town: "Bengaluru" },
      price,
      status: "scheduled",
      check: checked(host, `/${key}`, how, ago, CHECKED_NOW),
      seeDetailsUrl: `https://${host}/${key}`,
    },
    summary: null,
    organiser: venue.split(",")[0]!,
  };
}

/** Bengaluru's week in the API's order. Checks are 0 to 4 days old. */
export function checkedWeek(): FoundSample[] {
  const fair = card(
    "fair",
    "local_life",
    -1,
    "16:00",
    paid(50),
    "Sample Fair Committee, Bull Temple Road",
    "groundnutfair.example",
    ORGANISER,
    3,
  );
  fair.card.when.endsOn = placeDate(1, CHECKED_NOW);
  return inServerOrder([
    card(
      "pottery",
      "arts_creativity",
      0,
      "16:00",
      paid(900),
      "Sample Clay Studio, Indiranagar",
      "claystudio.example",
      VENUE,
      1,
    ),
    card(
      "jazz",
      "entertainment",
      0,
      "18:00",
      paid(400),
      "Sample Jazz Club, Cubbon Park bandstand",
      "jazzclub.example",
      ORGANISER,
      2,
    ),
    fair,
    card(
      "tryDive",
      "adventure",
      1,
      "07:00",
      paid(2500),
      "Sample Dive School, Koramangala",
      "diveschool.example",
      IN_PERSON,
      0,
    ),
    card(
      "flea",
      "local_life",
      1,
      null,
      paid(100),
      "Sample Flea Market, Jayanagar 4th Block",
      "fleamarket.example",
      ORGANISER,
      4,
    ),
    card(
      "yoga",
      "wellness",
      1,
      "06:30",
      FREE,
      "Sample Yoga Circle, Cubbon Park",
      "yogacircle.example",
      ORGANISER,
      1,
    ),
    card(
      "diveClub",
      "adventure",
      2,
      "09:00",
      FREE,
      "Sample Saturday Dive Club, Ulsoor lake",
      "saturdaydive.example",
      ORGANISER,
      2,
    ),
    card(
      "theatre",
      "culture_heritage",
      2,
      "11:00",
      UNPRICED,
      "Sample Rangashala, Malleswaram",
      "rangashala.example",
      VENUE,
      3,
    ),
    card(
      "comedy",
      "entertainment",
      4,
      "19:30",
      paid(300),
      "Sample Comedy Room, Church Street",
      "comedyroom.example",
      ORGANISER,
      1,
    ),
    card(
      "heritage",
      "culture_heritage",
      6,
      "08:00",
      paid(600),
      "Sample Heritage Walks, KR Market",
      "heritagewalks.example",
      IN_PERSON,
      2,
    ),
    card(
      "birds",
      "nature_wildlife",
      12,
      "06:45",
      FREE,
      "Sample Birders, Hebbal lake gate",
      "birders.example",
      ORGANISER,
      0,
    ),
    card(
      "craft",
      "arts_creativity",
      17,
      "10:00",
      paid(150),
      "Sample Craft Council, Palace Grounds",
      "craftcouncil.example",
      ORGANISER,
      1,
    ),
  ]);
}

/** One of the week's cards by id, with its place, or null. */
export function checkedSampleById(
  id: string,
): { sample: FoundSample; place: ExplorePlace } | null {
  const asked = id.toLowerCase();
  const sample = checkedWeek().find((s) => s.card.id === asked);
  return sample ? { sample, place: FOUND_PLACES[BENGALURU]! } : null;
}
