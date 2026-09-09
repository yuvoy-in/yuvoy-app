import { describe, it, expect } from "vitest";
import { categoryFacets, destinationFacets } from "./facets";
import type { components } from "@/lib/api/schema.gen";

type ExperienceSummary = components["schemas"]["ExperienceSummary"];

function summary(over: Partial<ExperienceSummary>): ExperienceSummary {
  return {
    id: "e1",
    slug: "e1",
    title: "A thing",
    marketKey: "andaman",
    destinationKey: "andaman/havelock",
    category: "adventure",
    bookingMode: "allotment",
    durationMinutes: 120,
    operator: { id: "op1", name: "An operator", verified: true },
    ...over,
  } as ExperienceSummary;
}

/**
 * yuvoy-app#24. The chips are derived from the catalogue because
 * `DestinationKey` is a pattern string rather than an enum, and because the
 * display name is not derivable from the key.
 */
describe("destinationFacets", () => {
  it("pairs each key with the server's own display name", () => {
    // The case that proves a client cannot build this label itself.
    const facets = destinationFacets([
      summary({
        destinationKey: "andaman/havelock",
        location: "Havelock (Swaraj Dweep)",
      }),
    ]);
    expect(facets).toEqual([
      { key: "andaman/havelock", label: "Havelock (Swaraj Dweep)" },
    ]);
  });

  it("lists each place once, however many listings it has", () => {
    const facets = destinationFacets([
      summary({ destinationKey: "andaman/neil", location: "Neil" }),
      summary({ destinationKey: "andaman/neil", location: "Neil" }),
      summary({ destinationKey: "andaman/havelock", location: "Havelock" }),
    ]);
    expect(facets.map((f) => f.key)).toEqual([
      "andaman/havelock",
      "andaman/neil",
    ]);
  });

  it("orders by label, not by how often a place appears", () => {
    // A rail that reorders itself as the catalogue changes is one somebody
    // has to re-read every visit.
    const facets = destinationFacets([
      summary({ destinationKey: "andaman/neil", location: "Neil" }),
      summary({ destinationKey: "andaman/neil", location: "Neil" }),
      summary({ destinationKey: "andaman/havelock", location: "Havelock" }),
    ]);
    expect(facets.map((f) => f.label)).toEqual(["Havelock", "Neil"]);
  });

  it("skips a place it cannot name rather than printing its key", () => {
    /*
      `location` is optional on the summary while `destinationKey` is
      required, so a listing can name a place this cannot label.
      `andaman/port_blair` is not a word, and showing it is exactly what the
      issue warned against.
    */
    const facets = destinationFacets([
      summary({ destinationKey: "andaman/port_blair", location: undefined }),
      summary({ destinationKey: "andaman/havelock", location: "Havelock" }),
    ]);
    expect(facets).toEqual([{ key: "andaman/havelock", label: "Havelock" }]);
  });

  it("ignores whitespace-only keys and labels", () => {
    const facets = destinationFacets([
      summary({ destinationKey: "  ", location: "Nowhere" }),
      summary({ destinationKey: "andaman/neil", location: "   " }),
    ]);
    expect(facets).toEqual([]);
  });

  it("returns nothing for an empty catalogue", () => {
    expect(destinationFacets([])).toEqual([]);
  });
});

describe("categoryFacets", () => {
  it("shows only categories a published listing carries", () => {
    /*
      `Category` IS a closed enum of twelve, so a fixed list would compile.
      It is still derived: twelve chips where ten answer "Nothing matches" is
      a worse screen than two that work, and it is the same rule the marketing
      site keeps — "no filter that filters nothing".
    */
    const facets = categoryFacets([
      summary({ category: "adventure" }),
      summary({ category: "nature_wildlife" }),
    ]);
    expect(facets.map((f) => f.key)).toEqual(["adventure", "nature_wildlife"]);
  });

  it("labels them as words, never as keys", () => {
    const facets = categoryFacets([summary({ category: "nature_wildlife" })]);
    expect(facets[0].label).toBe("Nature & wildlife");
  });

  it("keeps the contract's order, not the catalogue's", () => {
    // `adventure` leads the browse vocabulary. Keeping that order means the
    // chips read the same way on every screen that renders them.
    const facets = categoryFacets([
      summary({ category: "local_life" }),
      summary({ category: "adventure" }),
      summary({ category: "food_drink" }),
    ]);
    expect(facets.map((f) => f.key)).toEqual([
      "adventure",
      "food_drink",
      "local_life",
    ]);
  });

  it("skips a category it cannot name rather than titling the key", () => {
    // Means the server's enum has grown past this build. A chip nobody can
    // read is one nobody can act on; the Record type makes this a build
    // failure first.
    const facets = categoryFacets([
      summary({ category: "teleportation" as never }),
      summary({ category: "adventure" }),
    ]);
    expect(facets.map((f) => f.key)).toEqual(["adventure"]);
  });
});
