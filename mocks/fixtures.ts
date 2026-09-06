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

type Money = components["schemas"]["Money"];
type Media = components["schemas"]["Media"];
type ExperienceSummary = components["schemas"]["ExperienceSummary"];
type Experience = components["schemas"]["Experience"];
type Slot = components["schemas"]["Slot"];

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

const inr = (rupees: number): Money => ({
  amountMinor: rupees * 100,
  currency: "INR",
});

/**
 * Placeholder poster frames, built from the REAL tokens.
 *
 * The first version used #0D3B3E — which is `teal`, the colour Brand Kit v2.1
 * retired precisely because two darks read as a mistake — and a near-black that
 * was not `abyss`. Nothing off-palette can appear here now: the values come
 * from one map, and palette.test.ts scans this directory.
 *
 * Deliberately abstract rather than pretending to be dive footage. These are
 * data-URIs: no network, no rights question, and they still exercise the
 * poster-first path exactly as a real Cloudflare poster would.
 */
const TOKEN = {
  abyss: "#0a100e",
  forest: "#16362e",
  terra: "#be7149",
  cream: "#f4efe4",
} as const;

/** Each listing gets a different depth, so the feed does not look duplicated. */
const DEPTHS = [0.55, 0.72, 0.4, 0.85, 0.62] as const;

const poster = (seed: string, variant = 0): Media => {
  const depth = DEPTHS[variant % DEPTHS.length];
  // A vertical fall from forest into abyss — the media ground — with a single
  // terracotta mark for the accent. The whole palette and nothing else.
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="360" height="640" viewBox="0 0 360 640">
<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
<stop offset="0" stop-color="${TOKEN.forest}"/>
<stop offset="${depth}" stop-color="${TOKEN.abyss}"/>
<stop offset="1" stop-color="${TOKEN.abyss}"/>
</linearGradient></defs>
<rect width="360" height="640" fill="url(#g)"/>
<circle cx="180" cy="${Math.round(200 + variant * 24)}" r="52" fill="none" stroke="${TOKEN.cream}" stroke-opacity="0.14" stroke-width="1.5"/>
<rect x="176" y="${Math.round(196 + variant * 24)}" width="7" height="7" fill="${TOKEN.terra}"/>
</svg>`;

  return {
    id: `med_${seed}`,
    kind: "video",
    posterUrl: `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`,
    aspectRatio: "9:16",
    durationSeconds: 42,
    alt: "Placeholder poster frame",
    // hlsUrl deliberately absent by default — the feed must be complete
    // without it, and most fixtures keep proving that. `withClip()` adds one
    // for the cases that are about the player rather than the card.
  };
};

/**
 * The same poster, with a clip attached.
 *
 * Exactly one fixture uses this. The rest stay poster-only, because "a card is
 * COMPLETE with only a poster" is a property worth continuing to test — but
 * with NO fixture carrying `hlsUrl`, the entire player was unreachable from
 * the suite, which is how yuvoy-app#17 shipped: every reel a dead poster on
 * Safari, and nothing in the tests able to notice.
 *
 * The URL does not resolve, and does not need to. What it makes testable is
 * everything up to attaching the source: whether the `<video>` is allowed to
 * exist, and whether a play control is drawn when autoplay is refused. Real
 * playback against real HLS is not something this suite can prove, and the
 * tests that use this say so.
 */
export const withClip = (media: Media): Media => ({
  ...media,
  hlsUrl: "https://stream.example.invalid/mock/manifest.m3u8",
});

const operatorReef: components["schemas"]["OperatorSummary"] = {
  id: "op_reef",
  name: "Sample Dive Operator",
  verified: true,
  credentialsSummary: [
    "PADI dive centre registration checked",
    "Boat safety inspection on file",
    "Public liability insurance current",
  ],
};

const operatorBlue: components["schemas"]["OperatorSummary"] = {
  id: "op_blue",
  name: "Sample Boat Operator",
  verified: true,
  credentialsSummary: [
    "Vessel registration checked",
    "Skipper licence on file",
  ],
};

const operatorNew: components["schemas"]["OperatorSummary"] = {
  id: "op_new",
  name: "Sample New Operator",
  // Not yet verified — the card must not claim otherwise.
  verified: false,
};

export const EXPERIENCES: ExperienceSummary[] = [
  {
    id: "exp_try_dive",
    slug: "try-dive-nemo-reef",
    title: "Try-dive at Nemo Reef",
    marketKey: "andaman",
    destinationKey: "andaman/havelock",
    location: "Havelock",
    category: "adventure",
    bookingMode: "allotment",
    durationMinutes: 180,
    maxPartySize: 6,
    fromPrice: inr(4500),
    heroMedia: withClip(poster("dive", 0)),
    operator: operatorReef,
    nextAvailable: "2026-08-20",
    seatsOnNext: 4,
  },
  {
    id: "exp_snorkel",
    slug: "snorkel-elephant-beach",
    title: "Snorkel trip to Elephant Beach",
    marketKey: "andaman",
    destinationKey: "andaman/havelock",
    location: "Havelock",
    category: "nature_wildlife",
    bookingMode: "request",
    durationMinutes: 240,
    maxPartySize: 10,
    fromPrice: inr(2200),
    heroMedia: poster("snorkel", 1),
    operator: operatorBlue,
    nextAvailable: "2026-08-21",
    // No seatsOnNext: request mode holds nothing, so a number here would be a
    // promise we cannot keep.
  },
  {
    id: "exp_charter",
    slug: "private-boat-charter",
    title: "Private boat charter, whole day",
    marketKey: "andaman",
    destinationKey: "andaman/havelock",
    location: "Havelock",
    category: "adventure",
    bookingMode: "allotment",
    durationMinutes: 480,
    maxPartySize: 8,
    fromPrice: inr(18000),
    heroMedia: poster("charter", 2),
    operator: operatorBlue,
    nextAvailable: "2026-08-22",
    seatsOnNext: 8,
  },
  {
    id: "exp_kayak",
    slug: "mangrove-kayak-at-dawn",
    title: "Mangrove kayak at dawn",
    marketKey: "andaman",
    destinationKey: "andaman/neil-island",
    location: "Neil Island",
    category: "nature_wildlife",
    bookingMode: "allotment",
    durationMinutes: 150,
    // NO fromPrice — no contracted price exists yet. The card must say so
    // rather than render ₹0.
    heroMedia: poster("kayak", 3),
    operator: operatorNew,
    nextAvailable: "2026-08-23",
    seatsOnNext: 2,
  },
  {
    id: "exp_night",
    slug: "night-fishing-with-a-local-crew",
    title: "Night fishing with a local crew",
    marketKey: "andaman",
    destinationKey: "andaman/havelock",
    location: "Havelock",
    category: "local_life",
    bookingMode: "request",
    durationMinutes: 300,
    fromPrice: inr(3400),
    heroMedia: poster("night", 4),
    operator: operatorBlue,
    // NO nextAvailable — nothing bookable in the next 90 days. The card must
    // say that, not stay silent and cost the traveller a tap.
  },
];

const MEETING: components["schemas"]["MeetingPoint"] = {
  text: "Jetty 2, Havelock",
  landmark: "The blue kiosk. Be there 15 minutes before departure.",
  lat: 11.9756,
  lng: 92.9862,
};

export const EXPERIENCE_DETAIL: Record<string, Experience> = Object.fromEntries(
  EXPERIENCES.map((e): [string, Experience] => [
    e.slug,
    {
      ...e,
      summary:
        e.bookingMode === "request"
          ? "The operator confirms this one by hand. Ask, and you will have an answer before you pay."
          : "Seats we hold directly. Book now and the place is yours.",
      description:
        "A placeholder description for development. Real copy is written by the operator and reviewed before it publishes.",
      gallery: e.heroMedia ? [e.heroMedia] : [],
      meetingPoint: MEETING,
      included: ["Instructor", "All equipment", "Boat transfer"],
      requirements: ["Be able to swim", "No prior experience needed"],
      policyTier: "weather",
      cancellationPolicy:
        "Full refund if the sea calls it off, or move to another day at no cost.",
      // Only the dive asks a health question. The others must render a booking
      // form with no screener at all, which is the more common path.
      ...(e.slug === "try-dive-nemo-reef"
        ? {
            safety: {
              minAge: 12,
              screener: {
                key: "diving_rstc",
                version: 3,
                questions: [
                  "Any heart or circulatory condition?",
                  "Any lung or breathing condition?",
                  "Any recent ear or sinus surgery?",
                ],
                affirmation:
                  "I confirm that nobody in my party has any of the conditions listed above.",
              },
            },
          }
        : {}),
    },
  ]),
);

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
      availability: {
        asOf: isoAt(0, "06:00"),
        stale: false,
        verifiedVia: "manifest_call",
      },
    },
  ];
}
