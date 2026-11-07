import { describe, it, expect } from "vitest";
import {
  STATED_WORDS,
  asListedLine,
  asListedRows,
  statedSections,
  statedSource,
  type StatedCard,
  type StatedFacts,
} from "./stated";

/**
 * What a card's own page states (yuvoy-app#195): As listed's rows and line,
 * and What's included and Good to know, each only when stated. The phone's
 * rules (yuvoy-mobile `packages/core/src/explore/stated.test.ts`), so a
 * card's page reads the same on both.
 */

const NONE: StatedFacts = {
  endTime: null,
  setting: null,
  suits: [],
  difficulty: null,
  venueType: null,
  included: null,
  goodToKnow: null,
};

const CHECK: StatedCard["check"] = {
  tier: "staff_checked",
  label: "Checked by Yuvoy · Wed, 14 Oct · organiser's page",
  checkedAt: "2026-10-14T05:30:00Z",
  lapsed: false,
  sourceName: "deccanwalks.example",
  sourceUrl: "https://deccanwalks.example/old-city",
};

const card = (
  stated: Partial<StatedFacts> | null,
  over: Partial<StatedCard> = {},
): StatedCard => ({
  when: {
    startsOn: "2026-10-17",
    startTime: "10:00",
    endsOn: null,
    repeats: null,
  },
  check: CHECK,
  sources: [
    {
      name: "deccanwalks.example",
      url: "https://deccanwalks.example/old-city",
    },
  ],
  stated: stated === null ? null : { ...NONE, ...stated },
  ...over,
});

const ALL: Partial<StatedFacts> = {
  endTime: "18:30",
  setting: "both",
  suits: ["families", "kids"],
  difficulty: "easy",
  venueType: "rooftop cafe",
  included: "Tea and snacks.",
  goodToKnow: "Bring a hat.",
};

/*
  The same page on a card nobody has checked, as the API sends it: how hard
  and the note are null there even though the page states them.
*/
const UNCHECKED = card(
  { ...ALL, difficulty: null, goodToKnow: null },
  {
    check: {
      ...CHECK,
      tier: "found",
      label: "Found by Trigo · not checked yet",
      checkedAt: null,
    },
  },
);

describe("As listed's rows", () => {
  it("lists every stated fact in the issue's order and words", () => {
    expect(asListedRows(card(ALL))).toEqual([
      "Ends 18:30",
      "Venue: rooftop cafe",
      "Suits: Families, Kids",
      "Indoors and outdoors",
      "Difficulty: Easy",
    ]);
    expect(asListedRows(card({ setting: "indoor" }))).toEqual(["Indoors"]);
    expect(asListedRows(card({ setting: "outdoor" }))).toEqual(["Outdoors"]);
  });

  it("venue type shows only when stated", () => {
    expect(asListedRows(card({ venueType: "rooftop cafe" }))).toEqual([
      "Venue: rooftop cafe",
    ]);
    expect(asListedRows(card({ venueType: null }))).toEqual([]);
    expect(asListedRows(card({ venueType: "   " }))).toEqual([]);
  });

  it("lists who it suits in the order sent, capitalised, each once", () => {
    expect(
      asListedRows(
        card({
          suits: ["kids", "solo", "kids", "pets"] as never,
        }),
      ),
    ).toEqual(["Suits: Kids, Solo"]);
  });

  it("has no rows for a card that states nothing, or one read before stated was sent", () => {
    expect(asListedRows(card({}))).toEqual([]);
    expect(asListedRows(card(null))).toEqual([]);
    expect(asListedRows(card({ setting: "garden" as never }))).toEqual([]);
  });

  it("never says when an item over more than one day ends, nor a time it cannot read", () => {
    const multi = card(
      { endTime: "18:00" },
      {
        when: {
          startsOn: "2026-10-24",
          startTime: null,
          endsOn: "2026-10-25",
          repeats: null,
        },
      },
    );
    expect(asListedRows(multi)).toEqual([]);
    expect(asListedRows(card({ endTime: "6pm" }))).toEqual([]);
    expect(asListedRows(card({ endTime: "18:30:00" }))).toEqual(["Ends 18:30"]);
  });

  it("difficulty and good to know are absent on an unchecked card, as sent", () => {
    expect(asListedRows(UNCHECKED)).toEqual([
      "Ends 18:30",
      "Venue: rooftop cafe",
      "Suits: Families, Kids",
      "Indoors and outdoors",
    ]);
    expect(statedSections(UNCHECKED).map((s) => s.key)).toEqual(["included"]);
  });

  it("shows what is sent and never works it out from the tier", () => {
    // A difficulty sent on a found card is shown as sent.
    const found = card(
      { difficulty: "hard" },
      { check: { ...CHECK, tier: "found" } },
    );
    expect(asListedRows(found)).toEqual(["Difficulty: Hard"]);
  });
});

describe("the line under As listed", () => {
  it("on a checked card says a person checked the date, time, place and price, not these", () => {
    expect(asListedLine(card(ALL))).toBe(
      "From deccanwalks.example. A person at Yuvoy checked the date, time, place and price, not these.",
    );
    // Being re-checked keeps its check: the line is a checked card's.
    expect(
      asListedLine(card(ALL, { check: { ...CHECK, rechecking: true } })),
    ).toBe(asListedLine(card(ALL)));
    expect(
      asListedLine(
        card(ALL, { check: { ...CHECK, tier: "organiser_confirmed" } }),
      ),
    ).toBe(asListedLine(card(ALL)));
  });

  it("on a found card says nobody at Yuvoy has checked it yet", () => {
    expect(asListedLine(UNCHECKED)).toBe(
      "From deccanwalks.example. Nobody at Yuvoy has checked it yet.",
    );
  });

  it("on a lapsed card names only the source, whatever its tier", () => {
    for (const tier of ["found", "staff_checked"] as const) {
      const ran = card(ALL, { check: { ...CHECK, tier, lapsed: true } });
      expect(asListedLine(ran)).toBe("From deccanwalks.example.");
      expect(asListedLine({ ...ran, sources: [] })).toBe(
        "As the page states it.",
      );
    }
  });

  it("takes the first source with a name, and goes without one", () => {
    expect(
      statedSource({
        sources: [
          { name: " ", url: "https://a.example/" },
          { name: "tickets.example", url: "https://tickets.example/e/1" },
        ],
      }),
    ).toBe("tickets.example");
    expect(statedSource({ sources: [] })).toBeNull();
    expect(asListedLine(card(ALL, { sources: [] }))).toBe(STATED_WORDS.checked);
  });
});

describe("What's included and Good to know", () => {
  it("are their own sections, each only when stated, each saying where it is from", () => {
    expect(statedSections(card(ALL))).toEqual([
      {
        key: "included",
        title: "What's included",
        body: "Tea and snacks.",
        from: "From deccanwalks.example.",
      },
      {
        key: "goodToKnow",
        title: "Good to know",
        body: "Bring a hat.",
        from: "From deccanwalks.example.",
      },
    ]);
    expect(
      statedSections(card({ included: "Pens, ink and paper." })).map(
        (s) => s.key,
      ),
    ).toEqual(["included"]);
    expect(statedSections(card({}))).toEqual([]);
    expect(statedSections(card(null))).toEqual([]);
    expect(
      statedSections(card({ goodToKnow: "Carry water." }, { sources: [] }))[0]
        ?.from,
    ).toBeNull();
  });
});
