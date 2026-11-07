import { describe, it, expect } from "vitest";
import { render, screen, within } from "@testing-library/react";
import type { StatedCard, StatedFacts } from "@/lib/found/stated";
import { AsListed } from "./as-listed";

/**
 * What a card's own page states, drawn (yuvoy-app#195): the As listed panel
 * with its line and rows, then What's included and Good to know as sections
 * of their own, and nothing at all for a fact that is not stated.
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
  label: "Checked by Yuvoy · 16 Oct",
  checkedAt: "2026-10-16T09:00:00Z",
  lapsed: false,
  sourceName: "walks.example.in",
  sourceUrl: "https://walks.example.in/coffee",
};

const ALL: Partial<StatedFacts> = {
  endTime: "10:30",
  setting: "outdoor",
  suits: ["families", "kids"],
  difficulty: "moderate",
  venueType: "heritage walk",
  included: "Filter coffee at two stops.",
  goodToKnow: "Wear shoes you can walk in.",
};

const card = (
  stated: Partial<StatedFacts>,
  over: Partial<StatedCard> = {},
): StatedCard => ({
  when: {
    startsOn: "2026-11-07",
    startTime: "07:30",
    endsOn: null,
    repeats: null,
  },
  check: CHECK,
  sources: [
    { name: "walks.example.in", url: "https://walks.example.in/coffee" },
  ],
  stated: { ...NONE, ...stated },
  ...over,
});

const rows = () =>
  within(screen.getByTestId("found-as-listed"))
    .getAllByRole("listitem")
    .map((row) => row.textContent);

describe("AsListed", () => {
  it("draws every row, both sections and the checked line on a checked card stating all seven", () => {
    render(<AsListed item={card(ALL)} />);
    expect(
      screen.getByRole("region", { name: "As listed" }),
    ).toBeInTheDocument();
    expect(screen.getByTestId("found-as-listed-line")).toHaveTextContent(
      "From walks.example.in. A person at Yuvoy checked the date, time, place and price, not these.",
    );
    expect(rows()).toEqual([
      "Ends 10:30",
      "Venue: heritage walk",
      "Suits: Families, Kids",
      "Outdoors",
      "Difficulty: Moderate",
    ]);
    const included = screen.getByTestId("found-included");
    expect(
      within(included).getByRole("heading", {
        level: 2,
        name: "What's included",
      }),
    ).toBeInTheDocument();
    expect(included).toHaveTextContent("Filter coffee at two stops.");
    expect(included).toHaveTextContent("From walks.example.in.");
    const note = screen.getByTestId("found-goodToKnow");
    expect(
      within(note).getByRole("heading", { level: 2, name: "Good to know" }),
    ).toBeInTheDocument();
    expect(note).toHaveTextContent("Wear shoes you can walk in.");
  });

  it("difficulty and good to know are absent on an unchecked card, as the API sends it", () => {
    render(
      <AsListed
        item={card(
          { ...ALL, difficulty: null, goodToKnow: null },
          { check: { ...CHECK, tier: "found", checkedAt: null } },
        )}
      />,
    );
    expect(rows()).not.toContain("Difficulty: Moderate");
    expect(screen.queryByRole("heading", { name: "Good to know" })).toBeNull();
    expect(screen.getByTestId("found-as-listed-line")).toHaveTextContent(
      "From walks.example.in. Nobody at Yuvoy has checked it yet.",
    );
  });

  it("says only where the facts are from on a card whose check lapsed", () => {
    render(
      <AsListed item={card(ALL, { check: { ...CHECK, lapsed: true } })} />,
    );
    expect(screen.getByTestId("found-as-listed-line").textContent).toBe(
      "From walks.example.in.",
    );
  });

  it("no block when nothing is stated: no heading, no line, no space", () => {
    const { container } = render(<AsListed item={card({})} />);
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByRole("heading")).toBeNull();
  });

  it("venue type shows only when stated", () => {
    const { unmount } = render(
      <AsListed item={card({ venueType: "rooftop cafe" })} />,
    );
    expect(rows()).toEqual(["Venue: rooftop cafe"]);
    unmount();
    render(<AsListed item={card({ setting: "indoor" })} />);
    expect(rows()).toEqual(["Indoors"]);
  });

  it("shows What's included alone, with no As listed and no empty heading, when it is all that is stated", () => {
    render(<AsListed item={card({ included: "Tea and snacks." })} />);
    expect(screen.queryByTestId("found-as-listed")).toBeNull();
    expect(screen.queryByRole("heading", { name: "As listed" })).toBeNull();
    expect(
      screen.getAllByRole("heading").map((heading) => heading.textContent),
    ).toEqual(["What's included"]);
  });

  it("keeps who it suits in the order sent, and never says when a multi-day item ends", () => {
    render(
      <AsListed
        item={card(
          { endTime: "18:00", suits: ["kids", "couples"] },
          {
            when: {
              startsOn: "2026-11-07",
              startTime: null,
              endsOn: "2026-11-08",
              repeats: null,
            },
          },
        )}
      />,
    );
    expect(rows()).toEqual(["Suits: Kids, Couples"]);
  });
});
