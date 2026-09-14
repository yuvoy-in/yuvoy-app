import { describe, it, expect } from "vitest";
import {
  dayLabel,
  filterPills,
  withoutFilter,
  withoutFilters,
  activeFilterCount,
  type VocabularyLike,
} from "./labels";

const TODAY = "2026-09-14";

const vocabulary: VocabularyLike = {
  destinations: [
    { key: "andaman/havelock", label: "Havelock (Swaraj Dweep)" },
    { key: "andaman/neil", label: "Neil (Shaheed Dweep)" },
  ],
  categories: [
    { key: "adventure", label: "Adventure" },
    { key: "water", label: "On the water" },
  ],
  activityTypes: [
    { key: "scuba-diving", label: "Scuba diving", category: "adventure" },
    { key: "snorkelling", label: "Snorkelling", category: "adventure" },
  ],
};

/**
 * The words on the pills under the search bar (yuvoy-app#37 item 1).
 *
 * The owner's verdict on the shipped sheet was "very bad filters", and the
 * complaint underneath it was that nothing on screen showed what was applied.
 * These pills are the answer, so what they SAY is the feature.
 */
describe("naming a day", () => {
  it("says Today and Tomorrow rather than a date", () => {
    expect(dayLabel("2026-09-14", TODAY)).toBe("Today");
    expect(dayLabel("2026-09-15", TODAY)).toBe("Tomorrow");
  });

  it("names any other day with its weekday and month", () => {
    expect(dayLabel("2026-09-20", TODAY)).toBe("Sun 20 Sep");
    expect(dayLabel("2026-09-19", TODAY)).toBe("Sat 19 Sep");
  });

  it("reads a date in the MARKET's day, not the reader's", () => {
    /*
      Parsed at noon in Asia/Kolkata rather than at UTC midnight. Midnight UTC
      is the previous evening in the market, so every date in the calendar
      would be named one weekday early for a traveller in London.
    */
    expect(dayLabel("2026-09-20", TODAY)).toBe("Sun 20 Sep");
    expect(dayLabel("2026-01-01", "2025-12-01")).toBe("Thu 1 Jan");
  });

  it("crosses a month and a year without renaming the day", () => {
    expect(dayLabel("2026-10-01", "2026-09-30")).toBe("Tomorrow");
    expect(dayLabel("2027-01-01", "2026-12-31")).toBe("Tomorrow");
  });
});

describe("the pills for an applied filter set", () => {
  it("shows them in the order the issue names: Where, When, What, Activity", () => {
    const pills = filterPills(
      {
        activityType: "scuba-diving",
        category: "adventure",
        bookableOn: "2026-09-20",
        destinationKey: "andaman/havelock",
      },
      vocabulary,
      TODAY,
    );
    expect(pills.map((p) => p.field)).toEqual([
      "destinationKey",
      "bookableOn",
      "category",
      "activityType",
    ]);
    expect(pills.map((p) => p.label)).toEqual([
      "Havelock (Swaraj Dweep)",
      "Sun 20 Sep",
      "Adventure",
      "Scuba diving",
    ]);
  });

  it("uses the server's own words, which no title-casing produces", () => {
    const [pill] = filterPills(
      { destinationKey: "andaman/havelock" },
      vocabulary,
      TODAY,
    );
    expect(pill.label).toBe("Havelock (Swaraj Dweep)");
    expect(pill.label).not.toContain("andaman");
  });

  it("answers null rather than the raw key while the vocabulary is loading", () => {
    /*
      The pill renders a skeleton on null. Showing `andaman/havelock` to a
      traveller is worse, and dropping the pill would leave a filter applied
      with nothing on screen to take it off.
    */
    const [pill] = filterPills(
      { destinationKey: "andaman/havelock" },
      undefined,
      TODAY,
    );
    expect(pill.label).toBeNull();
    expect(pill.field).toBe("destinationKey");
  });

  it("still shows a pill for a key this vocabulary has dropped", () => {
    // The address outliving a vocabulary change. Same reasoning as above.
    const [pill] = filterPills(
      { destinationKey: "andaman/gone" },
      vocabulary,
      TODAY,
    );
    expect(pill.label).toBeNull();
  });

  it("shows nothing when nothing is applied, and ignores the typed word", () => {
    expect(filterPills({}, vocabulary, TODAY)).toEqual([]);
    // `q` is in the search box, which is already on screen. Not a pill.
    expect(filterPills({ q: "diving" }, vocabulary, TODAY)).toEqual([]);
    expect(activeFilterCount({ q: "diving" })).toBe(0);
    expect(activeFilterCount({ q: "diving", category: "adventure" })).toBe(1);
  });
});

describe("taking a filter off", () => {
  const applied = {
    q: "diving",
    destinationKey: "andaman/havelock",
    category: "adventure",
    activityType: "scuba-diving",
  } as const;

  it("removes only the one named", () => {
    expect(withoutFilter(applied, "destinationKey")).toMatchObject({
      q: "diving",
      destinationKey: undefined,
      category: "adventure",
      activityType: "scuba-diving",
    });
  });

  it("takes the activity type with the category that framed it", () => {
    /*
      The type chips are narrowed BY the category, so a type left behind is a
      filter with no chip to un-tap and no pill explaining where it came from.
    */
    const next = withoutFilter(applied, "category");
    expect(next.category).toBeUndefined();
    expect(next.activityType).toBeUndefined();
  });

  it("does NOT take the category when only the activity is removed", () => {
    const next = withoutFilter(applied, "activityType");
    expect(next.category).toBe("adventure");
    expect(next.activityType).toBeUndefined();
  });

  it("keeps the typed word when everything is cleared", () => {
    // "It removes every filter and keeps the typed word." The issue's words.
    expect(withoutFilters(applied)).toEqual({ q: "diving" });
  });
});
