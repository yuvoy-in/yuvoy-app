import { describe, it, expect } from "vitest";
import {
  comingUpCards,
  foundSearch,
  foundSearchText,
  foundToday,
  thinWeekend,
  understoodRow,
  withAsText,
} from "./found-filters";
import { foundWords, type UnderstoodChip } from "./found-words";

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
