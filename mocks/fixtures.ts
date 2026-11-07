/**
 * Contract-faithful fixtures.
 *
 * Every fixture here exists to make a specific STATE reachable in development
 * and in tests, because the states that lose money are the ones nobody can
 * reproduce on demand. The set deliberately covers, between them: allotment
 * and request mode, an exact seat count and the "Available" bucket, a full
 * slot, a closed slot, a stale slot, an experience with no contracted price,
 * and an experience with a poster but no playable video.
 *
 * TRUTHFULNESS: these are fixtures, served only by MSW in dev and test. They
 * are never bundled into a production build. Operator names are marked as
 * samples for the same reason the marketing site bans invented operators.
 */
import type { components } from "@/lib/api/schema.gen";

import { inr } from "./fixtures-listings";
import { EXPERIENCE_DETAIL } from "./fixtures-pages";

export {
  EXPERIENCES,
  LONG_REEL_FEED,
  OPERATORS,
  REELS,
  withClip,
} from "./fixtures-listings";
export { EXPERIENCE_DETAIL, operatorProfileFor } from "./fixtures-pages";

type Slot = components["schemas"]["Slot"];
type PlaceList = components["schemas"]["PlaceList"];
type PlaceMarket = components["schemas"]["PlaceMarket"];

const TZ = "Asia/Kolkata";

/** A stable "today" so fixtures do not drift between runs. */
export const FIXTURE_NOW = new Date("2026-08-19T02:00:00.000Z");

/**
 * The mock's clock, running from FIXTURE_NOW.
 *
 * The fixture world is anchored on one morning so its dates are stable, but
 * a clock that stands still breaks anything that counts down or compares an
 * instant to "now". This one starts at FIXTURE_NOW when the module loads and
 * advances in real time, and every mocked response carries it in a `Date`
 * header — exactly as the real API does — so the app's measured clock offset
 * puts it in fixture time. Cutoffs, hold countdowns and "last checked" all
 * read against this clock rather than the device's.
 */
const LOADED_AT = Date.now();
export function mockNow(): number {
  return FIXTURE_NOW.getTime() + (Date.now() - LOADED_AT);
}

export function mockHeaders(requestId: string): Record<string, string> {
  return { "x-request-id": requestId, date: new Date(mockNow()).toUTCString() };
}

/**
 * `GET /places` as production answers it on 20 Oct 2026 (yuvoy-app#181):
 * Andaman alone, bookable, with the three destinations the vocabulary lists.
 */
export const PLACES: PlaceList = {
  markets: [
    {
      key: "andaman",
      name: "Andaman Islands",
      mode: "bookable",
      timezone: "Asia/Kolkata",
      currency: "INR",
      destinations: [
        {
          key: "andaman/havelock",
          name: "Havelock (Swaraj Dweep)",
          kind: "travel",
          visibleTo: "all",
        },
        {
          key: "andaman/neil",
          name: "Neil (Shaheed Dweep)",
          kind: "travel",
          visibleTo: "all",
        },
        {
          key: "andaman/port_blair",
          name: "Port Blair",
          kind: "travel",
          visibleTo: "all",
        },
      ],
    },
  ],
};

/**
 * A SAMPLE second bookable market, for the copy that names places from data
 * (`?__scenario=two-markets`). A fixture, not a market Yuvoy sells in: its
 * only job is to prove no sentence assumes there is one market.
 */
export const SAMPLE_SECOND_MARKET: PlaceMarket = {
  key: "goa",
  name: "Goa",
  mode: "bookable",
  timezone: "Asia/Kolkata",
  currency: "INR",
  destinations: [
    { key: "goa/panaji", name: "Panaji", kind: "travel", visibleTo: "all" },
  ],
};

/* ------------------------------------------------------------ availability */

function isoAt(dayOffset: number, hhmm: string): string {
  const d = new Date(FIXTURE_NOW);
  d.setUTCDate(d.getUTCDate() + dayOffset);
  const [h, m] = hhmm.split(":").map(Number);
  // IST is UTC+5:30; the fixture stores the UTC instant for that local time.
  d.setUTCHours(h - 5, m - 30, 0, 0);
  return d.toISOString();
}

function localDate(dayOffset: number): string {
  const d = new Date(FIXTURE_NOW);
  d.setUTCDate(d.getUTCDate() + dayOffset);
  return d.toISOString().slice(0, 10);
}

/**
 * Every availability state the UI must render, in one day range:
 *   open with an exact count · open in the "Available" bucket · full ·
 *   closed (past cutoff) · request mode · stale (count withheld)
 */
export function availabilityFor(slug: string): Slot[] {
  const price = EXPERIENCE_DETAIL[slug]?.fromPrice ?? inr(4500);
  const mode = EXPERIENCE_DETAIL[slug]?.bookingMode ?? "allotment";

  if (mode === "request") {
    return [1, 2, 3].map((d) => ({
      id: `slot_req_${slug}_${d}`,
      startsAt: isoAt(d, "09:00"),
      endsAt: isoAt(d, "13:00"),
      marketTimezone: TZ,
      localDate: localDate(d),
      localStartTime: "09:00:00",
      bookingCutoffAt: isoAt(d, "07:00"),
      status: "open",
      bookingMode: "request",
      maxPartySize: 10,
      price,
      // No remainingSeats, no count in the display: a request promises an
      // answer, never a seat.
      remainingDisplay: "Ask the operator",
      // The third day is granted out: the operator has already promised the
      // whole departure, so no further request could be accepted. This is the
      // ONLY signal a request-mode picker gets — seat counts stay withheld —
      // and it exists in the fixture so the greyed-out state is exercised in
      // request mode and not only in allotment.
      soldOut: d === 3,
      availability: {
        asOf: isoAt(0, "06:00"),
        stale: false,
        verifiedVia: "operator_portal",
      },
    }));
  }

  return [
    {
      id: `slot_${slug}_a`,
      startsAt: isoAt(1, "07:00"),
      endsAt: isoAt(1, "10:00"),
      marketTimezone: TZ,
      localDate: localDate(1),
      localStartTime: "07:00:00",
      bookingCutoffAt: isoAt(1, "05:00"),
      status: "open",
      bookingMode: "allotment",
      maxPartySize: 6,
      price,
      remainingSeats: 4,
      soldOut: false,
      remainingDisplay: "4 seats left",
      availability: {
        asOf: isoAt(0, "06:00"),
        stale: false,
        verifiedVia: "manifest_call",
      },
    },
    {
      id: `slot_${slug}_b`,
      startsAt: isoAt(1, "11:30"),
      endsAt: isoAt(1, "14:30"),
      marketTimezone: TZ,
      localDate: localDate(1),
      localStartTime: "11:30:00",
      bookingCutoffAt: isoAt(1, "09:30"),
      status: "open",
      bookingMode: "allotment",
      maxPartySize: 6,
      price,
      remainingSeats: 0,
      remainingDisplay: "Full",
      // The same fact `remainingDisplay` states as "Full". A picker greys out
      // on this, never on the count.
      soldOut: true,
      availability: {
        asOf: isoAt(0, "06:00"),
        stale: false,
        verifiedVia: "manifest_call",
      },
    },
    {
      id: `slot_${slug}_c`,
      startsAt: isoAt(2, "07:00"),
      endsAt: isoAt(2, "10:00"),
      marketTimezone: TZ,
      localDate: localDate(2),
      localStartTime: "07:00:00",
      bookingCutoffAt: isoAt(2, "05:00"),
      status: "open",
      bookingMode: "allotment",
      maxPartySize: 6,
      price,
      remainingSeats: 11,
      // Six or more reads "Available" — a counter that ticks 23, 21, 22 as
      // holds expire teaches the traveller the number is noise.
      remainingDisplay: "Available",
      soldOut: false,
      availability: {
        asOf: isoAt(0, "06:00"),
        stale: false,
        verifiedVia: "operator_portal",
      },
    },
    {
      id: `slot_${slug}_d`,
      startsAt: isoAt(2, "15:00"),
      endsAt: isoAt(2, "18:00"),
      marketTimezone: TZ,
      localDate: localDate(2),
      localStartTime: "15:00:00",
      bookingCutoffAt: isoAt(2, "13:00"),
      status: "open",
      bookingMode: "allotment",
      maxPartySize: 6,
      price,
      // Stale: the count is withheld entirely and the display reads Available.
      remainingDisplay: "Available",
      soldOut: false,
      availability: {
        asOf: isoAt(-2, "08:00"),
        stale: true,
        verifiedVia: "operator_message",
      },
    },
    {
      id: `slot_${slug}_e`,
      startsAt: isoAt(0, "07:00"),
      endsAt: isoAt(0, "10:00"),
      marketTimezone: TZ,
      localDate: localDate(0),
      localStartTime: "07:00:00",
      bookingCutoffAt: isoAt(-1, "19:00"),
      // Past cutoff. Shown DISABLED, never hidden, or the traveller concludes
      // the day does not exist.
      status: "closed",
      bookingMode: "allotment",
      maxPartySize: 6,
      price,
      remainingDisplay: "Booking closed",
      // Seats remain; it is the cutoff that closed it. The contract is
      // explicit that `soldOut` says nothing about `status`, so a picker must
      // disable on BOTH and this fixture is the case that proves it.
      soldOut: false,
      availability: {
        asOf: isoAt(0, "06:00"),
        stale: false,
        verifiedVia: "manifest_call",
      },
    },
  ];
}

/* ---------------------------------------------------------------- tables */

type TableView = components["schemas"]["TableView"];

/** The one table the mock serves (yuvoy-app#194). Any other id is a 404. */
export const TABLE_ID = "7d3f9a2e-4c1b-4e8a-9f60-2b5d8c1e7a40";

/**
 * A table as somebody who asked to join it reads it, two days after
 * `FIXTURE_NOW`: Friday 21 August, 18:00 to 20:00 in Kolkata, which is 12:30
 * to 14:30 UTC, so a page that reads it in the wrong zone shows the wrong
 * hours. The request is waiting, so there are names and no venue; each
 * scenario in `table-handlers.ts` moves it from here.
 */
export const TABLE_VIEW: TableView = {
  id: TABLE_ID,
  title: "Sample table: Friday supper at a café",
  about:
    "Six travellers and somebody from Yuvoy, at a long table in a quiet café. Come as you are.",
  destinationKey: "andaman/havelock",
  venueKind: "cafe",
  venueArea: "Govind Nagar",
  startsAt: "2026-08-21T12:30:00Z",
  endsAt: "2026-08-21T14:30:00Z",
  timeZone: TZ,
  gettingHome:
    "Autos wait outside until nine. The team walks anyone who wants to the main road.",
  seatsMax: 6,
  seatsTaken: 3,
  full: false,
  womenOnly: false,
  leader: { kind: "team", firstName: "Meera" },
  requestsCloseAt: "2026-08-20T12:30:00Z",
  myRequest: { state: "requested" },
  status: "listed",
  whoIsGoing: ["Asha", "Rohan", "Lena"],
};

/** What only an approved guest gets: the place and the day's number. */
export const TABLE_VENUE: NonNullable<TableView["venue"]> = {
  name: "Sample Café by the Bay",
  address: "Beach road, Govind Nagar",
  mapUrl: "https://www.google.com/maps/search/?api=1&query=11.98,92.99",
  meetingPoint: "The long table at the back, under the fan",
};

/** The day's number, in E.164, as the API sends it. A sample. */
export const TABLE_DAY_OF_CONTACT = "+919000000001";
