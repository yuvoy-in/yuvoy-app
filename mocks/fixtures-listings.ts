/**
 * Moved word for word from fixtures.ts, which re-exports what other files
 * import: the poster frames, the fixture businesses, the listings and the
 * reel feed.
 */
import type { components } from "@/lib/api/schema.gen";

type Money = components["schemas"]["Money"];
type Media = components["schemas"]["Media"];
type ExperienceSummary = components["schemas"]["ExperienceSummary"];

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
  paper: "#ffffff",
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
<circle cx="180" cy="${Math.round(200 + variant * 24)}" r="52" fill="none" stroke="${TOKEN.paper}" stroke-opacity="0.14" stroke-width="1.5"/>
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

/*
  `slug` on every operator — yuvoy-api#152, required since it shipped. It is
  what a card links to the business's own page with (yuvoy-app#30), and the
  fixtures carry it because a fixture without it would only ever exercise the
  fallback that renders the name with no link.
*/
const operatorReef: components["schemas"]["OperatorSummary"] = {
  id: "op_reef",
  slug: "sample-dive-operator",
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
  slug: "sample-boat-operator",
  name: "Sample Boat Operator",
  verified: true,
  credentialsSummary: [
    "Vessel registration checked",
    "Skipper licence on file",
  ],
};

const operatorNew: components["schemas"]["OperatorSummary"] = {
  id: "op_new",
  slug: "sample-new-operator",
  name: "Sample New Operator",
  // Not yet verified — the card must not claim otherwise.
  verified: false,
};

/** Every fixture business. A card's `operator.slug` resolves to one of these. */
export const OPERATORS = [operatorReef, operatorBlue, operatorNew] as const;

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
    /*
      Present exactly when `fromPrice` is — the contract's own rule. The LABEL
      is what screens render; the key is here because the API sends both and a
      fixture that dropped one would let a client quietly start deriving the
      phrase itself.
    */
    pricingUnit: "per_person",
    pricingUnitLabel: "per person",
    activityType: "scuba",
    activityTypeLabel: "Scuba diving",
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
    /*
      The listing this field exists for: a private charter priced FOR THE
      GROUP. Before yuvoy-app#20 both traveller surfaces rendered "per person"
      next to this figure on their own authority, so ₹18,000 for a whole boat
      read as ₹18,000 each on the two screens somebody decides from.
    */
    pricingUnit: "per_group",
    pricingUnitLabel: "for the group",
    activityType: "private_charter",
    activityTypeLabel: "Private charter",
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
    /*
      SEPTEMBER, ON PURPOSE, AND IT IS THE ONLY ONE (yuvoy-app#67).

      September is the single month whose short name differs between runtimes:
      node and Chromium abbreviate it to "Sept" for `en-IN`, WebKit to "Sep".
      That one character threw React #418 on every reel in production, and no
      fixture in this file was ever in September, so `hydration.spec.ts` could
      run green against the defect it was written to catch.

      Well inside the ninety-day window from `FIXTURE_NOW` (19 August), so the
      card is still bookable and its shape is unchanged. Do not move this back
      into August: the guard is only as good as the data that reaches it.
    */
    nextAvailable: "2026-09-23",
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

/**
 * The feed — **every published reel**, not one per listing.
 *
 * This is the fixture for `GET /reels` (yuvoy-app#18), and it exists to model
 * the two things `EXPERIENCES` structurally cannot:
 *
 * ## 1. A listing appears more than once
 *
 * `exp_try_dive` carries THREE clips and `exp_charter` two. That is the whole
 * defect the endpoint fixes: `/experiences` returns one `heroMedia` per row, so
 * a traveller saw as many reels as there were listings however much footage
 * existed. In production on 6 September that was two visible against three
 * published.
 *
 * A card keyed by `experience.id` would give React duplicate keys against this
 * fixture, which is exactly why it is shaped this way.
 *
 * ## 2. The ordering interleaves operators, and is not ours to change
 *
 * Reels are numbered within each BUSINESS and ordered by that number, so
 * everyone's first reel precedes anybody's second. Below, reading down: reef#1,
 * blue#1, new#1, reef#2, blue#2, reef#3 — three operators taking turns, never
 * one operator's whole catalogue in a row.
 *
 * That is not a nicety. Our anchor operator is a co-founder's business, and the
 * ordering is built so it *cannot* express a preference for any operator: it
 * rotates them, it never ranks them. A client that re-sorts this — by recency,
 * by anything — hands the feed to whoever uploaded most recently. The order
 * here is deliberately NOT sorted by any field a client could reconstruct, so
 * a test can tell "passed through" from "coincidentally agrees".
 */
export const REELS: { media: Media; experience: ExperienceSummary }[] = (() => {
  const by = (id: string) => EXPERIENCES.find((e) => e.id === id)!;
  const dive = by("exp_try_dive");
  const snorkel = by("exp_snorkel");
  const kayak = by("exp_kayak");
  const charter = by("exp_charter");

  return [
    // Round one: each business's first clip.
    { media: withClip(poster("dive", 0)), experience: dive },
    { media: poster("snorkel", 1), experience: snorkel },
    { media: poster("kayak", 3), experience: kayak },
    // Round two: each business's second, in the same rotation.
    { media: poster("dive-b", 2), experience: dive },
    { media: poster("charter", 4), experience: charter },
    // Round three: only the business that has a third.
    { media: poster("dive-c", 1), experience: dive },
  ];
})();

/**
 * The same feed, long enough to page — `?__scenario=long-feed`.
 *
 * `REELS` stays six because six across three rounds is what makes the operator
 * rotation legible, and legibility is that fixture's whole job. But six is
 * smaller than one page, so nothing in a browser or in Playwright would ever
 * reach a second request against it, and every cursor path would be exercised
 * only in unit tests with a bespoke handler.
 *
 * Forty is three-and-a-bit pages at the app's page size, so a scroll crosses
 * more than one boundary — one boundary can be crossed by accident, two cannot.
 *
 * **Every media id is unique**, and that is the load-bearing detail rather
 * than a formality. The feed keys cards by media id; repeating one across
 * pages would give React duplicate keys and hand one clip's player state to
 * another, which is exactly the corruption `playableReels` drops a duplicate
 * to avoid. A fixture that repeated ids would make that guard fire constantly
 * and hide the real thing it is watching for.
 *
 * The rotation is preserved: cycling a rotation that already interleaves four
 * businesses keeps everyone's Nth reel ahead of anybody's (N+1)th.
 */
export const LONG_REEL_FEED: { media: Media; experience: ExperienceSummary }[] =
  Array.from({ length: 40 }, (_, i) => {
    const source = REELS[i % REELS.length];
    return {
      ...source,
      media: { ...source.media, id: `long-${i}` },
    };
  });

export { inr, TOKEN, DEPTHS };
