import { describe, it, expect, afterEach } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { ReelGrid } from "./reel-grid";
import { REELS } from "../../../mocks/fixtures";
import type { Reel } from "@/lib/feed/reels";

/**
 * The reel grid: bare posters on a business's page, and tiles that say what
 * they are in search (the approved redesign, 3 Oct 2026).
 */

const items = REELS.slice(0, 2) as unknown as Reel[];
const common = {
  items,
  hrefFor: (reel: Reel) => `/search/r/${reel.media?.id}`,
  hasNextPage: false,
  isFetchingNextPage: false,
  isFetchNextPageError: false,
  fetchNextPage: () => {},
  label: "Search results",
};

afterEach(cleanup);

describe("ReelGrid with words", () => {
  it("says the title, the price with its unit, and the next open day", () => {
    render(<ReelGrid {...common} words />);
    const [first] = within(
      screen.getByRole("list", { name: "Search results" }),
    ).getAllByRole("link");
    const experience = items[0].experience!;
    expect(first).toHaveTextContent(experience.title);
    if (experience.pricingUnitLabel) {
      expect(first).toHaveTextContent(experience.pricingUnitLabel);
    }
    expect(first).toHaveTextContent(
      experience.nextAvailable ? /Next open: / : /No dates in the next 90 days/,
    );
  });

  it("is named for what a tap does, then what it says, with breaks between", () => {
    render(<ReelGrid {...common} words />);
    const experience = items[0].experience!;
    expect(screen.getAllByRole("link")[0]).toHaveAccessibleName(
      new RegExp(`^Play ${experience.title}, ₹`),
    );
    expect(screen.getAllByRole("link", { name: /^Play / }).length).toBe(
      items.length,
    );
  });
});

describe("ReelGrid without words", () => {
  it("stays a grid of posters, named by what they play", () => {
    render(<ReelGrid {...common} label="Reels by them" />);
    const [first] = screen.getAllByRole("link");
    expect(first).toHaveAccessibleName(`Play ${items[0].experience!.title}`);
    expect(first).not.toHaveTextContent(/Next open/);
  });
});
