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

describe("a group's words (yuvoy-app#225)", () => {
  it("says the group's card, its button and the line after the 201", () => {
    expect(W.clubCard("Sample Lagoon Runners")).toBe(
      "Post Sample Lagoon Runners's events",
    );
    expect(W.clubCardButton).toBe("Set up its organiser page");
    expect(W.clubMade("Sample Lagoon Runners")).toBe(
      "Your organiser page is set up and checked. Your events show as posted by Sample Lagoon Runners.",
    );
    expect(W.clubFixed).toBe("These come from the group and stay the group's.");
  });

  it("keeps the API's group sentences as fallbacks", () => {
    expect(W.noClub).toBe("We could not find that group.");
    expect(W.clubLinked).toBe("This group already has an organiser.");
    expect(W.notClubHolder).toBe(
      "Only the person who holds this group on Yuvoy can set up its organiser.",
    );
    expect(W.peoplePaused).toBe("Your use of People is paused for now.");
    expect(W.peopleEnded).toBe("Your use of People has ended.");
  });
});
