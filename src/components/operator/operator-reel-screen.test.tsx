import { describe, it, expect, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { renderWithQuery } from "@/test/render";
import { OperatorReelScreen } from "./operator-reel-screen";
import { server } from "../../../mocks/server";
import { operatorProfileFor, REELS } from "../../../mocks/fixtures";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8099/v1";
const SLUG = "sample-dive-operator";

vi.mock("next/navigation", () => ({
  /*
    `LoginButton` sits in every logo header and in the feed masthead
    (yuvoy-app#56), and it reads both of these. A mock missing either
    fails the whole file with "No export is defined", which reads as a
    broken screen rather than an incomplete mock.
  */
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => `/o/${SLUG}/r/med_dive`,
}));

/** The dive business has three reels in the fixture; this is the second. */
const profile = operatorProfileFor(SLUG);
const theirs = REELS.filter((r) => r.experience.operator.slug === SLUG);

describe("a business's reel, playing in place", () => {
  it("opens on the reel that was tapped, not the first one", async () => {
    /*
      The whole point of yuvoy-app#33's second half. Pinning the tapped reel in
      front of the list — the way a SHARED reel does — would put reel one after
      reel two for somebody who tapped the second tile, and the sequence is
      what "like Instagram" means here.
    */
    const second = theirs[1];
    renderWithQuery(
      <OperatorReelScreen
        slug={SLUG}
        mediaId={second.media.id}
        initial={profile}
      />,
    );

    const cards = await screen.findAllByRole("article");
    // The strip renders the whole list; the OPENED one is at its real index.
    const opened = cards.find((c) => c.getAttribute("aria-posinset") === "2");
    expect(opened).toHaveAttribute("aria-label", second.experience.title);
  });

  it("swipes through this business's reels only", async () => {
    renderWithQuery(
      <OperatorReelScreen
        slug={SLUG}
        mediaId={theirs[0].media.id}
        initial={profile}
      />,
    );

    const cards = await screen.findAllByRole("article");
    expect(cards).toHaveLength(theirs.length);
    // Nothing from another business has crept in from the general feed.
    const titles = cards.map((c) => c.getAttribute("aria-label"));
    for (const title of titles) {
      expect(theirs.map((r) => r.experience.title)).toContain(title);
    }
  });

  it("carries a way back to the grid it came from", async () => {
    renderWithQuery(
      <OperatorReelScreen
        slug={SLUG}
        mediaId={theirs[0].media.id}
        initial={profile}
      />,
    );
    await screen.findAllByRole("article");
    expect(
      screen.getAllByRole("link", { name: /^Back to/ })[0],
    ).toHaveAttribute("href", `/o/${SLUG}`);
  });

  it("still shares the reel, and still points at the listing", async () => {
    renderWithQuery(
      <OperatorReelScreen
        slug={SLUG}
        mediaId={theirs[0].media.id}
        initial={profile}
      />,
    );
    const cards = await screen.findAllByRole("article");
    const first = cards[0];
    expect(within(first).getByLabelText("Share this reel")).toBeTruthy();
    expect(
      within(first).getByRole("link", { name: /^(Book|View)$/ }),
    ).toHaveAttribute("href", `/e/${theirs[0].experience.slug}`);
  });

  it("says so when the reel is not this business's, and offers the way back", async () => {
    /*
      A tile drawn before the clip was taken down, an id from another business,
      a link that was cut short. All the same answer, and never a crash or a
      blank strip. The route cannot answer this — the id is checked against a
      list that pages — so the screen does.
    */
    renderWithQuery(
      <OperatorReelScreen
        slug={SLUG}
        mediaId="med_not_theirs"
        initial={profile}
      />,
    );

    await waitFor(() =>
      expect(
        screen.getByText(/This reel is not here any more/),
      ).toBeInTheDocument(),
    );
    expect(screen.getByRole("link", { name: /^Back to/ })).toHaveAttribute(
      "href",
      `/o/${SLUG}`,
    );
  });

  it("pages forward to find a reel that is not on the first page", async () => {
    /*
      Deep-linked, or opened after the cache was collected. The id may be in a
      page nobody has fetched, and the search is bounded by the list itself
      rather than by a counter.
    */
    const [first, ...rest] = theirs;
    server.use(
      http.get(`${BASE}/operators/${SLUG}`, () =>
        HttpResponse.json({
          ...profile,
          reels: { items: [first], complete: false, nextCursor: "1" },
        }),
      ),
      http.get(`${BASE}/operators/${SLUG}/reels`, () =>
        HttpResponse.json({ items: rest, complete: true }),
      ),
    );

    const last = theirs[theirs.length - 1];
    renderWithQuery(
      <OperatorReelScreen
        slug={SLUG}
        mediaId={last.media.id}
        initial={undefined}
      />,
    );

    await waitFor(() =>
      expect(screen.getAllByRole("article").length).toBe(theirs.length),
    );
    expect(screen.queryByText(/not here any more/)).toBeNull();
  });
});
