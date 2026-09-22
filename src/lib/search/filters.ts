import type { components } from "@/lib/api/schema.gen";
import { formatMoney } from "@/lib/format/money";

/**
 * The search filter set, and the one place it is turned into a query.
 *
 * ## Why this is a module and not five `useState`s in the screen
 *
 * `GET /reels` is explicit, and it is the sharpest edge in this whole feature:
 *
 * > A cursor belongs to the filters it was minted under. Sending it with any
 * > different filter set is a `400`, because the rotation is counted within
 * > the filters and the same position means a different card under different
 * > ones. When the chips change, drop the cursor and start from the first
 * > page.
 *
 * A React Query key that does not carry every filter is therefore not a
 * caching mistake, it is a `400` on the second page of every changed search.
 * `reelFilterKey` is the key and `reelQuery` is the request, built from the
 * same object, so the two cannot drift — the failure would be silent until
 * somebody scrolled.
 *
 * The same object also travels in the URL, which is what lets a reel opened
 * from the grid swipe on through the same filtered order and come back.
 */

export type Category = components["schemas"]["Category"];

/* ------------------------------------------------ length and price bands */

/*
  HOW LONG AND HOW MUCH, AS A FEW HONEST PRESETS (yuvoy-api#197).

  `GET /reels` takes `minDurationMinutes`, `maxDurationMinutes`,
  `minPriceMinor` and `maxPriceMinor`, inclusive. The app offers three bands of
  each rather than two sliders, and the reasons are the traveller's:

    - The asks are ceilings in words ("something under two hours", "something
      under three thousand", from the issue itself), and a chip says the words.
      A slider asks for a number nobody has, drawn at a precision the catalogue
      does not have.
    - A band is a URL a person can read and share (`?length=short`), where a
      slider's pair of numbers is noise.
    - A preset cannot express an inverted range. `min` above `max` is a 400,
      and "never send one" is easier to keep true of three rows in a table
      than of two independent thumbs. `bandRange` still refuses one, in case
      this table is ever edited into one.

  Inclusive at both ends, as the API is, so a label says "up to" and "and up"
  rather than "under" and "over": a 2 hour trip is honestly both "Up to 2
  hours" and "2 to 4 hours", and appears under either.

  The price bands are cut for the catalogue that exists. On 22 Sep 2026 the
  live listings were ₹3,000 and ₹5,000 per person and the fixtures run from
  ₹2,200 to ₹4,500, so ₹2,000 and ₹4,000 put a real listing on each side of
  the middle band. The lowest band is empty today and is offered anyway, for
  the reason the vocabulary gives about a chip with nothing behind it: a
  filter that comes and goes is worse than one that finds nothing. Where the
  edges sit is the owner's call and moves by changing `PRICE_EDGES` alone.
*/

/** Inclusive bounds, in the API's own parameter names. */
interface DurationRange {
  minDurationMinutes?: number;
  maxDurationMinutes?: number;
}
interface PriceRange {
  minPriceMinor?: number;
  maxPriceMinor?: number;
}

/** Keys are the address's words; the order here is the order on screen. */
export const DURATION_BANDS = {
  short: { label: "Up to 2 hours", maxDurationMinutes: 120 },
  medium: {
    label: "2 to 4 hours",
    minDurationMinutes: 120,
    maxDurationMinutes: 240,
  },
  long: { label: "Half a day or more", minDurationMinutes: 240 },
} as const satisfies Record<string, DurationRange & { label: string }>;

export type DurationBand = keyof typeof DURATION_BANDS;

/** `₹2,000`: whole rupees, the way every price in this product reads. */
const rupees = (minor: number) =>
  formatMoney({ amountMinor: minor, currency: "INR" });

const PRICE_EDGES = { low: 200_000, high: 400_000 } as const;

/**
 * Per person, in paise, against the same amount `fromPrice` shows.
 *
 * The labels are built from the bounds rather than typed beside them, so the
 * words on a chip cannot drift from the numbers the chip sends.
 */
export const PRICE_BANDS = {
  low: {
    label: `Up to ${rupees(PRICE_EDGES.low)}`,
    maxPriceMinor: PRICE_EDGES.low,
  },
  mid: {
    label: `${rupees(PRICE_EDGES.low)} to ${rupees(PRICE_EDGES.high)}`,
    minPriceMinor: PRICE_EDGES.low,
    maxPriceMinor: PRICE_EDGES.high,
  },
  high: {
    label: `${rupees(PRICE_EDGES.high)} and up`,
    minPriceMinor: PRICE_EDGES.high,
  },
} as const satisfies Record<string, PriceRange & { label: string }>;

export type PriceBand = keyof typeof PRICE_BANDS;

/**
 * A key the address carried, if it names a band.
 *
 * An OWN property, not `key in BANDS`: `?length=toString` would otherwise name
 * a function on the prototype and reach the query as a band. Spelled with
 * `hasOwnProperty.call` rather than `Object.hasOwn`, which an iPhone on iOS
 * 15.3 or older does not have.
 */
const own = (table: object, key: string) =>
  Object.prototype.hasOwnProperty.call(table, key);

export function isDurationBand(value: unknown): value is DurationBand {
  return typeof value === "string" && own(DURATION_BANDS, value);
}

export function isPriceBand(value: unknown): value is PriceBand {
  return typeof value === "string" && own(PRICE_BANDS, value);
}

/**
 * An inclusive range as query parameters, or nothing at all.
 *
 * Refuses a minimum above its maximum by sending NEITHER, rather than trusting
 * the table above to stay well formed: the API answers that with a 400, and a
 * search that fails outright is worse than one filter quietly not applying.
 * A bound that is not a whole number of zero or more is dropped the same way,
 * which is what the API would refuse too.
 */
export function bandRange<Min extends string, Max extends string>(
  minName: Min,
  maxName: Max,
  min: number | undefined,
  max: number | undefined,
): Partial<Record<Min | Max, number>> {
  const ok = (n: number | undefined): n is number =>
    typeof n === "number" && Number.isInteger(n) && n >= 0;
  const lo = ok(min) ? min : undefined;
  const hi = ok(max) ? max : undefined;
  if (lo !== undefined && hi !== undefined && lo > hi) return {};
  return {
    ...(lo !== undefined ? { [minName]: lo } : {}),
    ...(hi !== undefined ? { [maxName]: hi } : {}),
  } as Partial<Record<Min | Max, number>>;
}

export interface ReelFilters {
  /** Free text. Trimmed, and absent rather than empty. */
  q?: string;
  /** `YYYY-MM-DD`, in the market's timezone. */
  bookableOn?: string;
  /** `<market>/<destination>`. */
  destinationKey?: string;
  /** A CLOSED enum: an unknown value is a 400, not an empty page. */
  category?: Category;
  /** An OPEN set: an unknown value is an empty page, not a 400. */
  activityType?: string;
  /** How long, as one of {@link DURATION_BANDS}. `/reels` only. */
  duration?: DurationBand;
  /**
   * How much per person, as one of {@link PRICE_BANDS}. `/reels` only.
   *
   * Setting one leaves listings priced for a whole group OUT of the results,
   * by the owner's decision on yuvoy-api#197: a price for the whole boat is
   * never compared with a price for one person. The screen says so wherever a
   * band is chosen.
   */
  price?: PriceBand;
}

/** Whether anything at all has been asked for. */
export function isAsking(filters: ReelFilters): boolean {
  return Object.values(filters).some((v) => v !== undefined && v !== "");
}

/**
 * The filter set as a stable query key.
 *
 * An ordered ARRAY, stringified. Two things are load-bearing about that and
 * both were wrong in a first draft.
 *
 * It is not `JSON.stringify(filters)` on the object: key order in JavaScript
 * is insertion order, so the same filter set built by two code paths would
 * stringify differently, get two cache entries, and each re-fetch what the
 * other already held.
 *
 * And it is not the five values joined on a separator. A traveller may type
 * one: `q: "diving | havelock"` and `q: "diving ", bookableOn: " havelock"`
 * are different searches that flatten to nearly the same string, and "nearly"
 * is not a property to rest a cursor on. `JSON.stringify` escapes the parts
 * for us, so no value can impersonate a boundary.
 */
export function reelFilterKey(filters: ReelFilters): string {
  return JSON.stringify([
    filters.q?.trim() ?? "",
    filters.bookableOn ?? "",
    filters.destinationKey ?? "",
    filters.category ?? "",
    filters.activityType ?? "",
    /*
      The bands, by KEY. A key names exactly one pair of bounds (see
      `reelQuery`), and `bandRange` is pure, so the same key always sends the
      same numbers and a cursor minted under one band is never replayed under
      another (yuvoy-api#197: "the new parameters are part of the filter set a
      cursor is minted under").
    */
    isDurationBand(filters.duration) ? filters.duration : "",
    isPriceBand(filters.price) ? filters.price : "",
  ]);
}

/** The filter set as `GET /reels` query parameters, omitting what is absent. */
export function reelQuery(filters: ReelFilters) {
  const q = filters.q?.trim();
  const length = isDurationBand(filters.duration)
    ? (DURATION_BANDS[filters.duration] as DurationRange)
    : undefined;
  const price = isPriceBand(filters.price)
    ? (PRICE_BANDS[filters.price] as PriceRange)
    : undefined;
  return {
    ...(q ? { q } : {}),
    ...(filters.bookableOn ? { bookableOn: filters.bookableOn } : {}),
    ...(filters.destinationKey
      ? { destinationKey: filters.destinationKey }
      : {}),
    ...(filters.category ? { category: filters.category } : {}),
    ...(filters.activityType ? { activityType: filters.activityType } : {}),
    ...bandRange(
      "minDurationMinutes",
      "maxDurationMinutes",
      length?.minDurationMinutes,
      length?.maxDurationMinutes,
    ),
    ...bandRange(
      "minPriceMinor",
      "maxPriceMinor",
      price?.minPriceMinor,
      price?.maxPriceMinor,
    ),
  };
}

/**
 * The filter set as URL search parameters, and back.
 *
 * Short names, because this string is on screen. `on` rather than `bookableOn`
 * and `place` rather than `destinationKey`: the API's names are the API's, and
 * a traveller sharing a search should not be sharing our field names.
 *
 * The filters live in the URL — a change from the chips-in-state screen this
 * replaces — and that is load-bearing rather than tidy. A reel opened from the
 * grid has to swipe on through the SAME filtered order, so the sequence has to
 * survive a navigation; and "back returns to the same grid" is the browser's
 * own behaviour once the state that built the grid is in the address.
 */
const PARAM = {
  q: "q",
  bookableOn: "on",
  destinationKey: "place",
  category: "kind",
  activityType: "doing",
  // The band's own key, never its numbers: `?length=short&price=mid` reads as
  // what it is, and a band whose edges move keeps its address.
  duration: "length",
  price: "price",
} as const;

export function filtersToParams(filters: ReelFilters): URLSearchParams {
  const params = new URLSearchParams();
  for (const [field, name] of Object.entries(PARAM)) {
    const value = filters[field as keyof ReelFilters]?.trim();
    if (!value) continue;
    // A band the table does not know has no numbers behind it, so it is not
    // written into an address a traveller might share.
    if (field === "duration" && !isDurationBand(value)) continue;
    if (field === "price" && !isPriceBand(value)) continue;
    params.set(name, value);
  }
  return params;
}

export function filtersFromParams(
  params: URLSearchParams | null | undefined,
): ReelFilters {
  if (!params) return {};
  const read = (name: string) => params.get(name)?.trim() || undefined;
  return {
    q: read(PARAM.q),
    bookableOn: read(PARAM.bookableOn),
    destinationKey: read(PARAM.destinationKey),
    /*
      Not validated against the enum here, and deliberately.

      An unknown `category` is a 400 from the server, which is the contract
      telling us this build and the API disagree about a closed vocabulary —
      a real bug, and one worth surfacing as the error state rather than
      silently dropping the filter and showing results for a different search
      than the one in the address bar.
    */
    category: read(PARAM.category) as Category | undefined,
    activityType: read(PARAM.activityType),
    /*
      VALIDATED here, unlike `category`, and the difference is whose word it
      is. An unknown category is the API and this build disagreeing about the
      API's closed vocabulary, which is worth surfacing as the server's 400. A
      band is THIS app's vocabulary: an unknown one is an old or hand-edited
      address, it has no numbers to send, and dropping it is the only honest
      reading of it.
    */
    duration: isDurationBand(read(PARAM.duration))
      ? (read(PARAM.duration) as DurationBand)
      : undefined,
    price: isPriceBand(read(PARAM.price))
      ? (read(PARAM.price) as PriceBand)
      : undefined,
  };
}
