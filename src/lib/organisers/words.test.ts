import { describe, it, expect } from "vitest";
import { ORGANISER_DEPARTMENTS, ORGANISER_WORDS as W } from "./words";

describe("organiser departments", () => {
  it("names every Category in the enum's order, as the API labels them", () => {
    expect(Object.keys(ORGANISER_DEPARTMENTS)).toEqual([
      "adventure",
      "nature_wildlife",
      "food_drink",
      "arts_creativity",
      "learning",
      "culture_heritage",
      "wellness",
      "entertainment",
      "community",
      "sports",
      "local_life",
      "events",
    ]);
    expect(ORGANISER_DEPARTMENTS.nature_wildlife).toBe("Nature and wildlife");
    expect(ORGANISER_DEPARTMENTS.local_life).toBe("Local life");
  });

  it("says a department by its key, and an unknown key as it is", () => {
    expect(W.departmentLabel("food_drink")).toBe("Food and drink");
    expect(W.departmentLabel("stargazing")).toBe("stargazing");
  });
});
