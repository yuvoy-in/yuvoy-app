import { describe, it, expect } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithQuery } from "@/test/render";
import { SearchScreen } from "./search-screen";
import type { components } from "@/lib/api/schema.gen";

type ExperiencePage = components["schemas"]["ExperiencePage"];

/**
 * T4's server prefetch, and the one way it can go wrong.
 *
 * The screen scored 82 with an LCP of 5.0s while it fetched its own first
 * results in the browser. Handing them down from the server fixes that — and
 * introduces exactly one new failure mode, which is seeding a FILTERED query
 * with the UNFILTERED answer. That is worse than the slow version: it is
 * instant and wrong.
 */

const SEEDED: ExperiencePage = {
  items: [
    {
      id: "seed-1",
      slug: "seeded-only",
      title: "Seeded from the server",
      marketKey: "andaman",
      destinationKey: "andaman/havelock",
      category: "adventure",
      bookingMode: "allotment",
      durationMinutes: 120,
      operator: { id: "o1", name: "Sample Operator", verified: true },
    },
  ],
  nextCursor: null,
  complete: true,
};

describe("SearchScreen", () => {
  it("renders the server's results immediately, with no loading state", () => {
    renderWithQuery(
      <SearchScreen initialResults={SEEDED} initialFetchedAt={Date.now()} />,
    );

    // Present on the FIRST paint — that is the whole point of the prefetch.
    expect(screen.getByText("Seeded from the server")).toBeInTheDocument();
    expect(screen.queryByRole("status", { name: "Searching" })).toBeNull();
  });

  it("does not seed a filtered query with the unfiltered results", async () => {
    const user = userEvent.setup();
    renderWithQuery(
      <SearchScreen initialResults={SEEDED} initialFetchedAt={Date.now()} />,
    );

    await user.type(
      screen.getByRole("searchbox", { name: "Search experiences" }),
      "kayak",
    );

    // The seeded item matches nothing about "kayak" and must go.
    await waitFor(() =>
      expect(screen.queryByText("Seeded from the server")).toBeNull(),
    );
    expect(
      await screen.findByText("Mangrove kayak at dawn"),
    ).toBeInTheDocument();
  });

  it("still loads and renders on its own when the server prefetch failed", async () => {
    renderWithQuery(<SearchScreen />);

    expect(
      screen.getByRole("status", { name: "Searching" }),
    ).toBeInTheDocument();
    expect(
      await screen.findByText("Try-dive at Nemo Reef"),
    ).toBeInTheDocument();
  });
});
