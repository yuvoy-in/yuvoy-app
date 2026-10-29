import { describe, it, expect } from "vitest";
import {
  NO_FOUND_FILTERS,
  clearRows,
  comingUpCards,
  foundEmpty,
  foundFilterKey,
  foundListQuery,
  foundRowsOn,
  foundSearch,
  foundSearchText,
  foundStateFrom,
  foundToday,
  keptAsText,
  paramsOf,
  thinWeekend,
  toggleDay,
  toggleFree,
  understoodRow,
  withAsText,
  withFoundState,
  type FoundFilters,
} from "./found-filters";
import { foundWords, type UnderstoodChip } from "./found-words";

/**
 * R3's chips, Filters and search as an address, a request and a key
 * (yuvoy-app#180): the phone's rules, so a place narrows the same on both.
 */

const f = (over: Partial<FoundFilters> = {}): FoundFilters => ({
  ...NO_FOUND_FILTERS,
  ...over,
});

describe("the address", () => {
  it("reads the day, Free, the sheet's rows and the search", () => {
    const state = foundStateFrom(
      new URLSearchParams(
        "place=karnataka/bengaluru&when=weekend&free=1&timeOfDay=evening&q=dive%20saturday&asText=saturday",
      ),
    );
    expect(state.filters).toEqual({
      when: "weekend",
      budget: "free",
      timeOfDay: "evening",
    });
    expect(state.search).toEqual({ q: "dive saturday", asText: ["saturday"] });
  });

  it("drops every value this app does not send, so a hand-edited address is never a 400", () => {
    const state = foundStateFrom(
      new URLSearchParams(
        "when=someday&free=yes&budget=cheap&timeOfDay=night&q=a&asText=x",
      ),
    );
    expect(state.filters).toEqual(NO_FOUND_FILTERS);
    // One character is not searched, and its words go with it.
    expect(state.search).toBeNull();
  });

  it("reads Free over an under-price budget, never both", () => {
    const { filters } = foundStateFrom(
      new URLSearchParams("free=1&budget=under_500"),
    );
    expect(filters.budget).toBe("free");
    expect(foundListQuery(filters, null)).toEqual({ free: true });
    expect(
      foundStateFrom(new URLSearchParams("budget=under_1500")).filters.budget,
    ).toBe("under_1500");
  });

  it("keeps only plain-text words still in q, each once, at most eight", () => {
    const { search } = foundStateFrom(
      new URLSearchParams(
        "q=dive saturday free&asText=Saturday&asText=saturday&asText=goa",
      ),
    );
    expect(search?.asText).toEqual(["saturday"]);
    const many = "a1 b2 c3 d4 e5 f6 g7 h8 i9";
    expect(keptAsText(many.split(" "), many)).toHaveLength(8);
  });

  it("reads a Server Component's searchParams the way the browser reads its own", () => {
    const params = paramsOf({
      when: "today",
      asText: ["saturday", "free"],
      place: undefined,
    });
    expect(params.getAll("asText")).toEqual(["saturday", "free"]);
    expect(params.has("place")).toBe(false);
    expect(foundStateFrom(params).filters.when).toBe("today");
  });

  it("writes only what is chosen, and leaves the place, department and scenario be", () => {
    const base = new URLSearchParams(
      "place=karnataka/bengaluru&category=adventure&__scenario=x&when=today&q=old",
    );
    const next = withFoundState(
      base,
      f({ when: "weekend", budget: "free", timeOfDay: "morning" }),
      { q: "dive saturday", asText: ["saturday"] },
    );
    expect(next.get("place")).toBe("karnataka/bengaluru");
    expect(next.get("category")).toBe("adventure");
    expect(next.get("__scenario")).toBe("x");
    expect(next.get("when")).toBe("weekend");
    expect(next.get("free")).toBe("1");
    expect(next.has("budget")).toBe(false);
    expect(next.get("timeOfDay")).toBe("morning");
    expect(next.get("q")).toBe("dive saturday");
    expect(next.getAll("asText")).toEqual(["saturday"]);

    const cleared = withFoundState(next, NO_FOUND_FILTERS, null);
    expect(cleared.toString()).toBe(
      "place=karnataka%2Fbengaluru&category=adventure&__scenario=x",
    );
    // Read back, it is what was written.
    expect(
      foundStateFrom(
        withFoundState(new URLSearchParams(), f({ budget: "any" }), null),
      ).filters.budget,
    ).toBe("any");
  });
});

describe("the request and the key", () => {
  it("sends Free as free=true and an under-price budget as budget, and never any", () => {
    expect(foundListQuery(f({ budget: "free" }), null)).toEqual({ free: true });
    expect(foundListQuery(f({ budget: "under_500" }), null)).toEqual({
      budget: "under_500",
    });
    expect(foundListQuery(f({ budget: "any" }), null)).toEqual({});
  });

  it("carries the search's words and the ones kept as text", () => {
    expect(
      foundListQuery(f({ when: "today" }), {
        q: "dive saturday",
        asText: ["saturday"],
      }),
    ).toEqual({ when: "today", q: "dive saturday", asText: ["saturday"] });
    expect(foundListQuery(NO_FOUND_FILTERS, { q: "dive", asText: [] })).toEqual(
      { q: "dive" },
    );
  });

  it("is R2's key with nothing chosen, and a different key for every filter set", () => {
    expect(foundFilterKey(NO_FOUND_FILTERS, null)).toBe("");
    expect(foundFilterKey(f({ budget: "any" }), null)).toBe("");
    const keys = [
      foundFilterKey(f({ when: "today" }), null),
      foundFilterKey(f({ when: "weekend" }), null),
      foundFilterKey(f({ when: "weekend", budget: "free" }), null),
      foundFilterKey(f({ budget: "under_500" }), null),
      foundFilterKey(f({ timeOfDay: "evening" }), null),
      foundFilterKey(NO_FOUND_FILTERS, { q: "dive saturday", asText: [] }),
      foundFilterKey(NO_FOUND_FILTERS, {
        q: "dive saturday",
        asText: ["saturday"],
      }),
    ];
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe("choosing", () => {
  it("is one day at a time, and a second tap clears it", () => {
    const today = toggleDay(NO_FOUND_FILTERS, "today");
    expect(today.when).toBe("today");
    expect(toggleDay(today, "weekend").when).toBe("weekend");
    expect(toggleDay(today, "today").when).toBeNull();
  });

  it("combines Free with a day, and Free replaces an under-price budget", () => {
    const both = toggleFree(f({ when: "tomorrow", budget: "under_500" }));
    expect(both).toEqual(f({ when: "tomorrow", budget: "free" }));
    expect(toggleFree(both).budget).toBeNull();
  });

  it("counts only the sheet's rows that narrow", () => {
    expect(foundRowsOn(f({ budget: "free" }))).toBe(0);
    expect(foundRowsOn(f({ budget: "any" }))).toBe(0);
    expect(foundRowsOn(f({ budget: "under_1500", timeOfDay: "evening" }))).toBe(
      2,
    );
  });

  it("clears the sheet's rows, Free with them, and keeps the day", () => {
    expect(
      clearRows(f({ when: "today", budget: "free", timeOfDay: "morning" })),
    ).toEqual(f({ when: "today" }));
  });
});

describe("the search", () => {
  it("trims, cuts at 120 characters, and searches nothing under two", () => {
    expect(foundSearchText("  dive  ")).toBe("dive");
    expect(foundSearchText("a")).toBeNull();
    expect(foundSearchText("   ")).toBeNull();
    expect([...(foundSearchText("x".repeat(200)) ?? "")]).toHaveLength(120);
  });

  it("starts a new search with nothing kept as text", () => {
    expect(foundSearch("comedy saturday")).toEqual({
      q: "comedy saturday",
      asText: [],
    });
  });

  it("removing a chip adds its word to asText for the same q", () => {
    const search = { q: "dive saturday free", asText: ["free"] };
    expect(withAsText(search, "Saturday")).toEqual({
      q: "dive saturday free",
      asText: ["free", "saturday"],
    });
  });
});

describe("the understood row", () => {
  const chip = (over: Partial<UnderstoodChip>): UnderstoodChip => ({
    kind: "department",
    value: "adventure",
    label: "Adventure",
    from: "dive",
    ...over,
  });

  it("is the API's chips in its order, each once, with its labels", () => {
    const row = understoodRow(
      [
        chip({}),
        chip({
          kind: "when",
          value: "saturday",
          label: "Saturday",
          from: "saturday",
        }),
        chip({}),
      ],
      () => true,
    );
    expect(row.map((c) => c.label)).toEqual(["Adventure", "Saturday"]);
  });

  it("draws a place chip only for a place that can be opened, and drops a kind it does not know", () => {
    const goa = chip({
      kind: "place",
      value: "goa/panaji",
      label: "Panaji",
      from: "panaji",
    });
    expect(understoodRow([goa], () => false)).toEqual([]);
    expect(understoodRow([goa], (key) => key === "goa/panaji")).toEqual([goa]);
    expect(
      understoodRow(
        [
          chip({ kind: "mood" as UnderstoodChip["kind"] }),
          chip({ label: " " }),
        ],
        () => true,
      ),
    ).toEqual([]);
  });
});

describe("the empty lines", () => {
  it("say the narrowest thing first, each with its way out", () => {
    const search = { q: "dive", asText: [] };
    expect(
      foundEmpty(f({ when: "today", budget: "free" }), search, "Bengaluru"),
    ).toEqual({
      line: "Nothing in Bengaluru matches “dive”.",
      action: "clear-search",
    });
    expect(
      foundEmpty(f({ when: "today", timeOfDay: "morning" }), null, "Bengaluru"),
    ).toEqual({
      line: "Nothing matches those filters in Bengaluru.",
      action: "clear-filters",
    });
    expect(
      foundEmpty(f({ when: "weekend", budget: "free" }), null, "Bengaluru"),
    ).toEqual({
      line: "Nothing checked for this weekend in Bengaluru yet.",
      action: "show-everything",
    });
    expect(foundEmpty(f({ budget: "free" }), null, "Bengaluru")).toEqual({
      line: "Nothing free in Bengaluru right now.",
      action: "show-everything",
    });
    expect(foundEmpty(f({ budget: "any" }), null, "Bengaluru")).toBeNull();
    expect(foundEmpty(NO_FOUND_FILTERS, null, "Bengaluru")).toBeNull();
  });

  it("name each day as the copy table does", () => {
    expect(foundWords.emptyDay("today", "Coorg")).toBe(
      "Nothing checked for today in Coorg yet.",
    );
    expect(foundWords.emptyDay("tomorrow", "Coorg")).toBe(
      "Nothing checked for tomorrow in Coorg yet.",
    );
  });
});

describe("the heading from the answer's window", () => {
  it("reads the server's dates, and works out none of its own", () => {
    expect(
      foundWords.windowHeading("weekend", {
        from: "2026-11-20",
        to: "2026-11-22",
      }),
    ).toBe("This weekend · Fri, 20 Nov to Sun, 22 Nov");
    expect(
      foundWords.windowHeading("today", {
        from: "2026-11-20",
        to: "2026-11-20",
      }),
    ).toBe("Today · Fri, 20 Nov");
    expect(
      foundWords.windowHeading("tomorrow", {
        from: "2026-11-21",
        to: "2026-11-21",
      }),
    ).toBe("Tomorrow · Sat, 21 Nov");
  });

  it("says nothing without a window, without a day, or with dates it cannot read", () => {
    expect(foundWords.windowHeading("weekend", undefined)).toBeNull();
    expect(
      foundWords.windowHeading(null, { from: "2026-11-20", to: "2026-11-22" }),
    ).toBeNull();
    expect(
      foundWords.windowHeading("weekend", { from: "soon", to: "2026-11-22" }),
    ).toBeNull();
  });
});

describe("coming up on a thin weekend", () => {
  const item = (id: string, startsOn: string | null) => ({
    id,
    when: { startsOn, startTime: null, endsOn: null, repeats: null },
  });

  it("is a weekend the server says is complete with fewer than three cards", () => {
    expect(thinWeekend("weekend", "end", 2)).toBe(true);
    expect(thinWeekend("weekend", "end", 0)).toBe(true);
    expect(thinWeekend("weekend", "end", 3)).toBe(false);
    expect(thinWeekend("weekend", "more", 1)).toBe(false);
    expect(thinWeekend("weekend", "stopped", 1)).toBe(false);
    expect(thinWeekend("today", "end", 1)).toBe(false);
  });

  it("shows what starts in the next two weeks and is not on screen, in the server's order", () => {
    const page = [
      item("a", "2026-11-19"),
      item("b", "2026-11-20"),
      item("c", "2026-12-03"),
      item("d", "2026-12-04"),
      item("e", null),
      item("F", "2026-11-25"),
    ];
    expect(
      comingUpCards(page, [{ id: "f" }], "2026-11-20").map((c) => c.id),
    ).toEqual(["b", "c"]);
  });

  it("reads today in the place's zone", () => {
    // 19:00 UTC on the 20th is half past midnight on the 21st in India.
    const at = Date.UTC(2026, 10, 20, 19, 0);
    expect(foundToday(at, "Asia/Kolkata")).toBe("2026-11-21");
    expect(foundToday(at, "UTC")).toBe("2026-11-20");
  });
});
