import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithQuery } from "@/test/render";
import { OperatorScreen } from "./operator-screen";
import { server } from "../../../mocks/server";
import { http, HttpResponse } from "msw";
import { operatorProfileFor } from "../../../mocks/fixtures";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8099/v1";
const SLUG = "sample-boat-operator";

/**
 * yuvoy-app#30 — a business, and everything it sells.
 *
 * The claims worth defending are the ones about what is NOT on the page: no
 * rating, no follower count, and nothing hidden because it cannot be booked.
 */
describe("OperatorScreen", () => {
  it("names the business, where it runs, and two real counts", async () => {
    renderWithQuery(<OperatorScreen slug={SLUG} />);

    expect(
      await screen.findByRole("heading", { name: /Sample Boat Operator/ }),
    ).toBeInTheDocument();
    // Joined with a separator, so this asserts both are shown rather than
    // matching one exactly.
    expect(
      screen.getByText(/Havelock \(Swaraj Dweep\).*Neil \(Shaheed Dweep\)/),
    ).toBeInTheDocument();
    expect(screen.getByText("activities")).toBeInTheDocument();
    expect(screen.getByText("reels")).toBeInTheDocument();
  });

  it("invents no rating and no follower count", async () => {
    /*
      "Reviews do not exist until real completed bookings produce them, and a
      number nobody earned is a fabricated claim. Please do not add a
      placeholder '4.8 ★' or '1.2k followers' to make the header feel full."
    */
    renderWithQuery(<OperatorScreen slug={SLUG} />);
    await screen.findByRole("heading", { name: /Sample Boat Operator/ });

    expect(screen.queryByText(/★|stars?\b|rating/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/followers?/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/reviews?/i)).not.toBeInTheDocument();
  });

  it("shows verification as a tick that says what it means, not as a score", async () => {
    renderWithQuery(<OperatorScreen slug={SLUG} />);
    expect(
      await screen.findByLabelText(/Credentials verified by Yuvoy/i),
    ).toBeInTheDocument();
  });

  /*
    The two truthfulness rules the feed card used to carry.

    They were asserted on `Feed` because the reel card printed a price and a
    next date. yuvoy-app#36 took both off the reel, and a listing card here is
    now the only place in the app that renders either — so the tests moved
    with the behaviour rather than being deleted with the component. Deleting
    them would have left `ListingCard` free to print ₹0 with nothing failing.
  */
  it("never renders a placeholder price when none is contracted", async () => {
    /*
      `fromPrice` is absent until a real contracted price exists. ₹0 would be a
      fabricated claim — the exact class of thing this project removed an
      entire site for publishing (rulebook §10).
    */
    const profile = operatorProfileFor(SLUG);
    server.use(
      http.get(`${BASE}/operators/${SLUG}`, () =>
        HttpResponse.json({
          ...profile,
          listings: profile.listings.map((l) => ({
            ...l,
            experience: { ...l.experience, fromPrice: undefined },
          })),
        }),
      ),
    );

    renderWithQuery(<OperatorScreen slug={SLUG} />);
    expect(
      (await screen.findAllByText("Price on request")).length,
    ).toBeGreaterThan(0);
    expect(screen.queryByText("₹0")).not.toBeInTheDocument();
  });

  it("says so when nothing is bookable in 90 days, rather than staying silent", async () => {
    /*
      `nextAvailable` absent means "we checked and there is nothing", not "we
      did not check". Saying so is what stops the tap that ends in an empty
      date picker, which is the tap that loses the traveller.
    */
    const profile = operatorProfileFor(SLUG);
    server.use(
      http.get(`${BASE}/operators/${SLUG}`, () =>
        HttpResponse.json({
          ...profile,
          listings: profile.listings.map((l) => ({
            ...l,
            bookable: true,
            experience: { ...l.experience, nextAvailable: undefined },
          })),
        }),
      ),
    );

    renderWithQuery(<OperatorScreen slug={SLUG} />);
    expect(
      (await screen.findAllByText("No dates in the next 90 days")).length,
    ).toBeGreaterThan(0);
  });

  it("shows a listing that cannot be booked, and says so", async () => {
    /*
      "`bookable: false` on a listing card means show it and say it cannot be
      booked, not hide it. Somebody followed a link looking for a specific
      thing they saw; an emptier page with no explanation is worse than a card
      marked 'Not available right now'."
    */
    renderWithQuery(<OperatorScreen slug={SLUG} />);

    const cards = await screen.findAllByRole("link", { name: /./ });
    expect(cards.length).toBeGreaterThan(0);
    expect(screen.getByText("Not available right now")).toBeInTheDocument();

    // Every listing is on the page, including the one that is off.
    const profile = operatorProfileFor(SLUG);
    for (const { experience } of profile.listings) {
      expect(screen.getByText(experience.title)).toBeInTheDocument();
    }
  });

  it("renders a paused business rather than an error", async () => {
    // Somebody was sent this link. One honest line beats a page that looks
    // broken.
    server.use(
      http.get(`${BASE}/operators/${SLUG}`, () =>
        HttpResponse.json({ ...operatorProfileFor(SLUG), bookable: false }),
      ),
    );

    renderWithQuery(<OperatorScreen slug={SLUG} />);
    expect(
      await screen.findByText(/is not taking bookings right now/),
    ).toBeInTheDocument();
    // And still shows what they run.
    expect(screen.getByText("What they run")).toBeInTheDocument();
  });

  it("skips the grid entirely when there are no reels, rather than drawing an empty one", async () => {
    server.use(
      http.get(`${BASE}/operators/${SLUG}`, () =>
        HttpResponse.json({
          ...operatorProfileFor(SLUG),
          reelCount: 0,
          reels: { items: [], complete: true },
        }),
      ),
    );

    renderWithQuery(<OperatorScreen slug={SLUG} />);
    await screen.findByText("What they run");
    expect(screen.queryByText("Their reels")).not.toBeInTheDocument();
  });

  it("is still a page for a business with one activity", async () => {
    // "One activity: still a page. Do not collapse it into the listing."
    const profile = operatorProfileFor(SLUG);
    server.use(
      http.get(`${BASE}/operators/${SLUG}`, () =>
        HttpResponse.json({
          ...profile,
          listingCount: 1,
          listings: profile.listings.slice(0, 1),
        }),
      ),
    );

    renderWithQuery(<OperatorScreen slug={SLUG} />);
    expect(await screen.findByText("What they run")).toBeInTheDocument();
    expect(screen.getByText("activity")).toBeInTheDocument();
  });

  it("keeps paging while the server says the grid is not complete", async () => {
    /*
      "`complete` is told, not inferred. Do not stop the grid because a page
      came back short; stop when `complete: true` or `nextCursor` is absent."
      This page is deliberately SHORT and not complete.
    */
    const profile = operatorProfileFor(SLUG);
    const first = profile.reels.items.slice(0, 1);
    server.use(
      http.get(`${BASE}/operators/${SLUG}`, () =>
        HttpResponse.json({
          ...profile,
          reels: { items: first, complete: false, nextCursor: "1" },
        }),
      ),
      http.get(`${BASE}/operators/${SLUG}/reels`, () =>
        HttpResponse.json({
          items: profile.reels.items.slice(1),
          complete: true,
        }),
      ),
    );

    const user = userEvent.setup();
    renderWithQuery(<OperatorScreen slug={SLUG} />);

    const more = await screen.findByRole("button", { name: "Show more" });
    await user.click(more);

    // The button goes once the server says there is no more, not before.
    expect(
      await screen.findByRole("heading", { name: "Their reels" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Show more" }),
    ).not.toBeInTheDocument();
  });

  it("keeps the loaded grid when one extra page fails", async () => {
    /*
      The `useInfiniteQuery` trap: `isError` is true whenever the LAST fetch
      failed, so rendering the error state off it would replace a grid full of
      loaded clips the moment one extra page failed. `isFetchNextPageError` is
      the one that means what this screen needs.
    */
    const profile = operatorProfileFor(SLUG);
    server.use(
      http.get(`${BASE}/operators/${SLUG}`, () =>
        HttpResponse.json({
          ...profile,
          reels: {
            items: profile.reels.items.slice(0, 1),
            complete: false,
            nextCursor: "1",
          },
        }),
      ),
      http.get(`${BASE}/operators/${SLUG}/reels`, () =>
        HttpResponse.json(
          { error: { code: "internal_error", message: "no" } },
          { status: 500 },
        ),
      ),
    );

    const user = userEvent.setup();
    renderWithQuery(<OperatorScreen slug={SLUG} />);
    await user.click(await screen.findByRole("button", { name: "Show more" }));

    expect(await screen.findByRole("alert")).toBeInTheDocument();
    // The clips that DID load are still there.
    expect(
      screen.getByRole("heading", { name: "Their reels" }),
    ).toBeInTheDocument();
  });

  /*
    yuvoy-operator#41 — what the business says about itself, on the page a
    traveller reads before getting on a stranger's boat. "Every one of those
    fields is absent when empty, never "". Render nothing rather than a
    heading over a blank."
  */
  describe("what the business says about itself", () => {
    it("shows their words as the paragraphs they typed", async () => {
      renderWithQuery(<OperatorScreen slug={SLUG} />);
      expect(
        await screen.findByRole("heading", { name: "About" }),
      ).toBeInTheDocument();
      expect(
        screen.getByText(/^Two boats and a crew of five/),
      ).toBeInTheDocument();
      expect(
        screen.getByText(/^We keep the groups small on purpose/),
      ).toBeInTheDocument();
    });

    it("states the reviewed year, where to find them, and what they speak", async () => {
      renderWithQuery(<OperatorScreen slug={SLUG} />);
      expect(await screen.findByText("Running since 2014")).toBeInTheDocument();
      expect(
        screen.getByText("Beach No. 3, Havelock (Swaraj Dweep)"),
      ).toBeInTheDocument();
      expect(screen.getByText("English · Hindi · Bengali")).toBeInTheDocument();
    });

    it("shows the photographs, each saying whose it is", async () => {
      renderWithQuery(<OperatorScreen slug={SLUG} />);
      await screen.findByRole("heading", { name: "Photos" });
      expect(
        screen.getAllByRole("img", {
          name: /^Sample Boat Operator, photo \d of 3$/,
        }),
      ).toHaveLength(3);
    });

    it("draws nothing at all for a business that has written nothing", async () => {
      renderWithQuery(<OperatorScreen slug="sample-new-operator" />);
      await screen.findByRole("heading", { name: /Sample New Operator/ });
      expectNoStory();
    });

    it("shows the two reviewed facts on their own, as the live operator has them", async () => {
      // `hc-diving-skl` on 11 Sep 2026: a year and a place, and no words yet.
      renderWithQuery(<OperatorScreen slug="sample-dive-operator" />);
      expect(await screen.findByText("Running since 2019")).toBeInTheDocument();
      expect(screen.getByText(/beside the jetty/)).toBeInTheDocument();
      expect(screen.queryByRole("heading", { name: "About" })).toBeNull();
      expect(screen.queryByText("Languages")).toBeNull();
    });

    it("reads blank, null and empty as not written", async () => {
      server.use(
        http.get(`${BASE}/operators/${SLUG}`, () =>
          HttpResponse.json({
            ...operatorProfileFor(SLUG),
            about: "  \n \n",
            operatingSince: null,
            languages: ["", "   "],
            findThemAt: null,
            photos: [],
          }),
        ),
      );

      renderWithQuery(<OperatorScreen slug={SLUG} />);
      await screen.findByText("What they run");
      expectNoStory();
    });
  });
});

/** None of the five story fields, and none of their labels. */
function expectNoStory() {
  expect(screen.queryByRole("heading", { name: "About" })).toBeNull();
  expect(screen.queryByRole("heading", { name: "Photos" })).toBeNull();
  expect(screen.queryByText(/Running since/)).toBeNull();
  expect(screen.queryByText("Find them at")).toBeNull();
  expect(screen.queryByText("Languages")).toBeNull();
}
