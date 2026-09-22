import { describe, it, expect } from "vitest";
import {
  bandRange,
  DURATION_BANDS,
  filtersFromParams,
  filtersToParams,
  isAsking,
  PRICE_BANDS,
  reelFilterKey,
  reelQuery,
  type DurationBand,
  type PriceBand,
  type ReelFilters,
} from "./filters";

/**
 * The filter set, and the rule that makes it dangerous to get wrong.
 *
 * `GET /reels` mints a cursor against the filters it was called with:
 *
 * > A cursor belongs to the filters it was minted under. Sending it with any
 * > different filter set is a `400` … When the chips change, drop the cursor
 * > and start from the first page.
 *
 * React Query drops the cursor for free when the key changes — but only if the
 * key changes with EVERY filter. A key missing one field keeps the accumulated
 * pages and their cursor across a change to that field, and the next
 * `fetchNextPage` is a 400. On the SECOND page only, which is the kind of bug
 * that reaches production because nobody scrolls in review.
 *
 * So the key is tested field by field rather than in the obvious one case.
 */

const FIELDS: (keyof ReelFilters)[] = [
  "q",
  "bookableOn",
  "destinationKey",
  "category",
  "activityType",
  "duration",
  "price",
];

const SAMPLE: Required<ReelFilters> = {
  q: "kayak",
  bookableOn: "2026-09-20",
  destinationKey: "andaman/havelock",
  category: "adventure",
  activityType: "kayaking",
  duration: "medium",
  price: "mid",
};

describe("reelFilterKey", () => {
  it("changes when ANY single field changes", () => {
    const base = reelFilterKey({});
    for (const field of FIELDS) {
      const key = reelFilterKey({ [field]: SAMPLE[field] });
      expect(key, `${field} does not reach the query key`).not.toBe(base);
    }
  });

  it("changes when any single field is REMOVED from a full set", () => {
    // The direction that matters more: taking a chip off must also start a new
    // page one, and a key built by concatenating only what is present would
    // collide with a different set that happens to concatenate the same way.
    const full = reelFilterKey(SAMPLE);
    for (const field of FIELDS) {
      const without = { ...SAMPLE, [field]: undefined };
      expect(reelFilterKey(without), `removing ${field}`).not.toBe(full);
    }
  });

  it("is stable whatever order the object was built in", () => {
    /*
      Not `JSON.stringify(filters)`. Object key order is insertion order in
      JavaScript, so two identical filter sets built by different code paths
      would stringify differently, get separate cache entries, and each
      re-fetch what the other already held.
    */
    const a: ReelFilters = { q: "kayak", category: "adventure" };
    const b: ReelFilters = { category: "adventure", q: "kayak" };
    expect(reelFilterKey(a)).toBe(reelFilterKey(b));
  });

  it("treats a blank word as no word", () => {
    expect(reelFilterKey({ q: "   " })).toBe(reelFilterKey({}));
  });

  it("cannot be confused by a value that looks like a separator", () => {
    /*
      A traveller may type one. The first draft joined the five values on `|`,
      which made these two different searches flatten to strings differing only
      in a trailing separator — distinct by luck of position rather than by
      construction, and a cursor is not something to rest on luck.
    */
    // A real collision under `join("|")`, not a near miss: both flatten to
    // exactly "a|b|c|||". Two different searches, one cursor.
    expect(reelFilterKey({ q: "a|b", bookableOn: "c" })).not.toBe(
      reelFilterKey({ q: "a", bookableOn: "b|c" }),
    );
    expect(reelFilterKey({ q: "a|b" })).not.toBe(
      reelFilterKey({ q: "a", bookableOn: "b" }),
    );
    expect(reelFilterKey({ q: "a", destinationKey: "b" })).not.toBe(
      reelFilterKey({ q: "a", bookableOn: "b" }),
    );
  });
});

describe("reelQuery", () => {
  it("omits what is absent rather than sending it empty", () => {
    // `cursor=` empty is a different request from sending none, and the same
    // is true of every filter: the contract describes the absent form.
    expect(reelQuery({})).toEqual({});
    expect(reelQuery({ q: "  kayak  " })).toEqual({ q: "kayak" });
    expect(reelQuery({ q: "   " })).toEqual({});
  });

  it("sends every field the API declares", () => {
    expect(reelQuery(SAMPLE)).toEqual({
      q: "kayak",
      bookableOn: "2026-09-20",
      destinationKey: "andaman/havelock",
      category: "adventure",
      activityType: "kayaking",
      minDurationMinutes: 120,
      maxDurationMinutes: 240,
      minPriceMinor: 200_000,
      maxPriceMinor: 400_000,
    });
  });
});

/**
 * How long and how much, as presets (yuvoy-api#197).
 *
 * `GET /reels` takes four inclusive bounds and answers a minimum above its
 * maximum with a 400. The bands are what a traveller picks; these tests pin
 * what each band SENDS, because that, not the chip's word, is what the API
 * filters on.
 */
describe("the length and price bands", () => {
  it("sends exactly the bounds each length band names, and no others", () => {
    expect(reelQuery({ duration: "short" })).toEqual({
      maxDurationMinutes: 120,
    });
    expect(reelQuery({ duration: "medium" })).toEqual({
      minDurationMinutes: 120,
      maxDurationMinutes: 240,
    });
    expect(reelQuery({ duration: "long" })).toEqual({
      minDurationMinutes: 240,
    });
  });

  it("sends exactly the bounds each price band names, in paise", () => {
    expect(reelQuery({ price: "low" })).toEqual({ maxPriceMinor: 200_000 });
    expect(reelQuery({ price: "mid" })).toEqual({
      minPriceMinor: 200_000,
      maxPriceMinor: 400_000,
    });
    expect(reelQuery({ price: "high" })).toEqual({ minPriceMinor: 400_000 });
  });

  it("says in words what it sends in numbers", () => {
    // Inclusive at both ends, as the API is: "up to" and "and up", never
    // "under" and "over", which would be false at the edge.
    expect(DURATION_BANDS.short.label).toBe("Up to 2 hours");
    expect(DURATION_BANDS.medium.label).toBe("2 to 4 hours");
    expect(DURATION_BANDS.long.label).toBe("Half a day or more");
    expect(PRICE_BANDS.low.label).toBe("Up to ₹2,000");
    expect(PRICE_BANDS.mid.label).toBe("₹2,000 to ₹4,000");
    expect(PRICE_BANDS.high.label).toBe("₹4,000 and up");
  });

  it("never offers a band the API would refuse", () => {
    /*
      A minimum above its maximum is a 400 naming both parameters, and so is a
      negative or fractional bound. Walked over the whole of both tables, so a
      band added later is held to it too.
    */
    const bounds = [
      ...(Object.keys(DURATION_BANDS) as DurationBand[]).map((b) =>
        reelQuery({ duration: b }),
      ),
      ...(Object.keys(PRICE_BANDS) as PriceBand[]).map((b) =>
        reelQuery({ price: b }),
      ),
    ];
    for (const query of bounds) {
      const q = query as Record<string, number | undefined>;
      for (const value of Object.values(q)) {
        expect(Number.isInteger(value) && value! >= 0).toBe(true);
      }
      for (const [lo, hi] of [
        ["minDurationMinutes", "maxDurationMinutes"],
        ["minPriceMinor", "maxPriceMinor"],
      ]) {
        if (q[lo] !== undefined && q[hi] !== undefined) {
          expect(q[lo]!).toBeLessThanOrEqual(q[hi]!);
        }
      }
    }
  });

  it("refuses to build an inverted or malformed range, sending neither bound", () => {
    // The guard under the table: if an edit ever inverts a band, the search
    // loses that one filter rather than failing outright with a 400.
    expect(bandRange("minPriceMinor", "maxPriceMinor", 5, 3)).toEqual({});
    expect(bandRange("minPriceMinor", "maxPriceMinor", 3, 3)).toEqual({
      minPriceMinor: 3,
      maxPriceMinor: 3,
    });
    expect(bandRange("minPriceMinor", "maxPriceMinor", -1, 3)).toEqual({
      maxPriceMinor: 3,
    });
    expect(bandRange("minPriceMinor", "maxPriceMinor", 1.5, undefined)).toEqual(
      {},
    );
  });

  it("sends nothing for a band it does not know", () => {
    // Only reachable by hand, since the address drops unknown bands. Nothing
    // is guessed: an unknown band has no numbers behind it.
    expect(
      reelQuery({
        duration: "forever" as DurationBand,
        price: "free" as PriceBand,
      }),
    ).toEqual({});
  });

  it("starts a new first page whenever a band changes", () => {
    // A cursor minted under one band replayed under another is a 400.
    const keys = new Set([
      reelFilterKey({}),
      reelFilterKey({ duration: "short" }),
      reelFilterKey({ duration: "medium" }),
      reelFilterKey({ duration: "long" }),
      reelFilterKey({ price: "low" }),
      reelFilterKey({ price: "mid" }),
      reelFilterKey({ price: "high" }),
      reelFilterKey({ duration: "short", price: "low" }),
    ]);
    expect(keys.size).toBe(8);
  });
});

describe("the address", () => {
  it("round-trips a whole filter set", () => {
    expect(filtersFromParams(filtersToParams(SAMPLE))).toEqual(SAMPLE);
  });

  it("uses short names, because the string is on screen", () => {
    // The API's field names are the API's. A traveller sharing a search should
    // not be sharing `destinationKey`.
    const params = filtersToParams(SAMPLE);
    expect(params.get("on")).toBe("2026-09-20");
    expect(params.get("place")).toBe("andaman/havelock");
    expect(params.get("kind")).toBe("adventure");
    expect(params.get("doing")).toBe("kayaking");
    expect(params.get("length")).toBe("medium");
    expect(params.get("price")).toBe("mid");
    expect(params.has("destinationKey")).toBe(false);
    // The band's key, never its numbers.
    expect(params.has("minPriceMinor")).toBe(false);
  });

  it("reads an empty address as no filters at all", () => {
    expect(filtersFromParams(new URLSearchParams())).toEqual({
      q: undefined,
      bookableOn: undefined,
      destinationKey: undefined,
      category: undefined,
      activityType: undefined,
    });
    expect(filtersFromParams(null)).toEqual({});
  });

  it("passes an unknown category through rather than dropping it", () => {
    /*
      Deliberate. An unknown `category` is a 400 from the server, which is the
      contract saying this build and the API disagree about a CLOSED
      vocabulary — a real bug. Dropping it here would show results for a
      different search than the one in the address bar and hide the fault.
    */
    const filters = filtersFromParams(
      new URLSearchParams("kind=not_a_category"),
    );
    expect(filters.category).toBe("not_a_category");
  });
});

describe("a band in the address", () => {
  it("drops one this app does not offer, rather than guessing its numbers", () => {
    /*
      Unlike `category`, which is the API's closed vocabulary and worth a 400,
      a band is this app's own word. An old or hand-edited address naming one
      that does not exist has nothing to send.
    */
    const filters = filtersFromParams(
      new URLSearchParams("length=forever&price=free&q=dive"),
    );
    expect(filters.duration).toBeUndefined();
    expect(filters.price).toBeUndefined();
    expect(filters.q).toBe("dive");
  });

  it("is not fooled by a name every object has", () => {
    const filters = filtersFromParams(
      new URLSearchParams("length=toString&price=constructor"),
    );
    expect(filters.duration).toBeUndefined();
    expect(filters.price).toBeUndefined();
    expect(reelQuery(filters)).toEqual({});
  });

  it("never writes an unknown band into an address", () => {
    const params = filtersToParams({
      duration: "forever" as DurationBand,
      price: "high",
    });
    expect(params.has("length")).toBe(false);
    expect(params.get("price")).toBe("high");
  });
});

describe("isAsking", () => {
  it("is false for nothing, and true for any one filter", () => {
    expect(isAsking({})).toBe(false);
    expect(isAsking({ q: "" })).toBe(false);
    for (const field of FIELDS) {
      expect(isAsking({ [field]: SAMPLE[field] }), field).toBe(true);
    }
  });
});
