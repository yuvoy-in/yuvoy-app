import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { screen, waitFor, cleanup, within } from "@testing-library/react";
import { renderWithQuery } from "@/test/render";
import { SearchReelScreen } from "./search-reel-screen";

const nav = vi.hoisted(() => ({ search: "q=dive" }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/search/r/med_dive",
  useSearchParams: () => new URLSearchParams(nav.search),
}));

beforeEach(() => {
  nav.search = "q=dive";
});
afterEach(cleanup);

/**
 * A search result, playing — yuvoy-app#37.
 *
 * The three asks are one mechanism: the filter set is in the address, so this
 * screen resolves to the same query key the grid used. That is what makes the
 * strip open on the grid's own pages, swipe on through the same filtered
 * order, and hand back a `Back` that returns to the same search.
 */
describe("a search result, playing", () => {
  it("shows only reels matching the same filters", async () => {
    /*
      The property that would break silently if the filters did not travel: the
      strip would fall back to the unfiltered feed and the second swipe would
      leave the search behind.
    */
    renderWithQuery(<SearchReelScreen mediaId="med_dive" />);

    const cards = await screen.findAllByRole("article");
    for (const card of cards) {
      expect(card.getAttribute("aria-label")).toMatch(/dive/i);
    }
  });

  it("opens on the reel that was tapped, at its own place in the order", async () => {
    // The dive business has three reels in the fixture and all three match
    // "dive", so the third is a real index rather than one index zero would
    // satisfy by accident.
    renderWithQuery(<SearchReelScreen mediaId="med_dive-c" />);

    const cards = await screen.findAllByRole("article");
    expect(cards.length).toBeGreaterThan(1);
    const opened = cards.find(
      (c) => c.getAttribute("aria-posinset") === String(cards.length),
    );
    expect(opened).toBeTruthy();
  });

  it("goes back to the same search, filters and all", async () => {
    nav.search = "q=dive&place=andaman%2Fhavelock";
    renderWithQuery(<SearchReelScreen mediaId="med_dive" />);
    await screen.findAllByRole("article");

    const back = screen.getAllByRole("link", { name: /^Back to/ })[0];
    const href = back.getAttribute("href")!;
    expect(href.startsWith("/search?")).toBe(true);
    const params = new URLSearchParams(href.split("?")[1]);
    expect(params.get("q")).toBe("dive");
    expect(params.get("place")).toBe("andaman/havelock");
  });

  it("keeps the arrow to the listing and the reel's own share", async () => {
    renderWithQuery(<SearchReelScreen mediaId="med_dive" />);
    const first = (await screen.findAllByRole("article"))[0];
    expect(
      within(first).getByRole("link", { name: /^(Book|View)$/ }),
    ).toBeTruthy();
    expect(within(first).getByLabelText("Share this reel")).toBeTruthy();
  });

  it("says so when the reel is not in these results", async () => {
    /*
      A stale link, a filter set that has moved on, a clip taken down. Never a
      crash or a blank strip. The route cannot answer this without walking
      every cursor before rendering anything, so the screen does.
    */
    renderWithQuery(<SearchReelScreen mediaId="med_kayak" />);
    await waitFor(() =>
      expect(
        screen.getByText(/This reel is not in these results/),
      ).toBeInTheDocument(),
    );
    expect(screen.getByRole("link", { name: /^Back to/ })).toBeTruthy();
  });
});
