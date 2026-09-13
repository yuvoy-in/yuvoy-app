import { describe, it, expect } from "vitest";
import {
  filtersFromParams,
  filtersToParams,
  isAsking,
  reelFilterKey,
  reelQuery,
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
];

const SAMPLE: Required<ReelFilters> = {
  q: "kayak",
  bookableOn: "2026-09-20",
  destinationKey: "andaman/havelock",
  category: "adventure",
  activityType: "kayaking",
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
    });
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
    expect(params.has("destinationKey")).toBe(false);
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

describe("isAsking", () => {
  it("is false for nothing, and true for any one filter", () => {
    expect(isAsking({})).toBe(false);
    expect(isAsking({ q: "" })).toBe(false);
    for (const field of FIELDS) {
      expect(isAsking({ [field]: SAMPLE[field] }), field).toBe(true);
    }
  });
});
