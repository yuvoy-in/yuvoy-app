import { describe, it, expect, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import { renderWithQuery } from "@/test/render";
import { Feed } from "./feed";
import { server } from "../../../mocks/server";
import { http, HttpResponse, delay } from "msw";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8099/v1";

/*
  A card carries the swipe-to-open gesture, which needs a router. There is no
  app router mounted under `render`, so the hook is given one — the same shape
  the checkout tests use.
*/
vi.mock("next/navigation", () => ({
  /*
    `LoginButton` sits in every logo header and in the feed masthead
    (yuvoy-app#56), and it reads both of these. A mock missing either
    fails the whole file with "No export is defined", which reads as a
    broken screen rather than an incomplete mock.
  */
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/",
}));

/** One reel's worth of listing, with only what a card actually reads. */
const listing = (over: Record<string, unknown> = {}) => ({
  id: "e1",
  slug: "no-price",
  title: "Mangrove kayak at dawn",
  marketKey: "andaman",
  destinationKey: "andaman/neil-island",
  category: "nature_wildlife",
  bookingMode: "allotment",
  durationMinutes: 150,
  operator: { id: "o1", name: "Sample Operator", verified: false },
  nextAvailable: "2026-08-23",
  ...over,
});

const clip = (id: string) => ({
  id,
  kind: "video",
  posterUrl: "data:image/svg+xml;utf8,%3Csvg%2F%3E",
  aspectRatio: "9:16",
  durationSeconds: 20,
});

/**
 * One page of reels, complete unless told otherwise.
 *
 * `complete` is not optional in the contract, so a handler that omitted it
 * would be describing a response the API cannot send — and the feed reads it
 * as the server having stopped, which is a real state with its own copy.
 */
const reels = (items: unknown[], over: Record<string, unknown> = {}) =>
  http.get(`${BASE}/reels`, () =>
    HttpResponse.json({ items, complete: true, ...over }),
  );

/**
 * T2's states and its truthfulness rules. The feed is the one screen every
 * traveller sees, so a wrong claim here is the most expensive wrong claim in
 * the product.
 *
 * Built on `GET /reels` since yuvoy-app#18 — every published reel, not one per
 * listing.
 */
describe("Feed", () => {
  it("shows a skeleton, not a spinner, while loading", async () => {
    renderWithQuery(<Feed />);
    expect(
      screen.getByRole("status", { name: "Loading experiences" }),
    ).toBeInTheDocument();
  });

  it("wears its masthead while it loads, outside the busy region", () => {
    /*
      The wait, the failure and the empty feed drew the well alone, so the
      mark and Login arrived with the first clip (stability audit,
      6 Oct 2026). The masthead is the strip's own, and sits beside the
      status rather than inside it.
    */
    server.use(
      http.get(`${BASE}/reels`, async () => {
        await delay("infinite");
      }),
    );
    renderWithQuery(<Feed />);
    const status = screen.getByRole("status", { name: "Loading experiences" });
    expect(screen.getByRole("img", { name: "Yuvoy" })).toBeInTheDocument();
    expect(within(status).queryByRole("img", { name: "Yuvoy" })).toBeNull();
  });

  it("wears its masthead when the feed fails, and when it is empty", async () => {
    server.use(
      http.get(`${BASE}/reels`, () =>
        HttpResponse.json(
          { error: { code: "not_found", message: "Not found." } },
          { status: 404 },
        ),
      ),
    );
    const failed = renderWithQuery(<Feed />);
    await screen.findByRole("alert");
    expect(screen.getByRole("img", { name: "Yuvoy" })).toBeInTheDocument();
    failed.unmount();

    server.use(reels([]));
    renderWithQuery(<Feed />);
    await screen.findByText("Nothing bookable here yet");
    expect(screen.getByRole("img", { name: "Yuvoy" })).toBeInTheDocument();
  });

  it("renders the feed", async () => {
    renderWithQuery(<Feed />);
    expect(
      (await screen.findAllByText("Try-dive at Nemo Reef")).length,
    ).toBeGreaterThan(0);
  });

  it("shows every reel, including several from one listing", async () => {
    /*
      The defect this endpoint exists to fix. `/experiences` returns one
      `heroMedia` per row, so the number of reels a traveller could see was
      capped at the number of listings whatever operators had filmed — two
      visible against three published on 6 September, with the third invisible
      since the day it went up.

      The fixture gives `exp_try_dive` three clips. `findAllByText` on its
      title therefore counts CARDS, and a feed that collapsed back to one row
      per listing would return one.
    */
    renderWithQuery(<Feed />);
    /*
      By ROLE and accessible name, not by text.

      The card's name is its title, and counting the text instead counted the
      details panel's own title too: the panel covers the caption when it opens,
      so it names what it describes, and that name is a second copy of the same
      string. The article's accessible name is unambiguous and is what a screen
      reader counts as well.
    */
    const cards = await screen.findAllByRole("article", {
      name: "Try-dive at Nemo Reef",
    });
    expect(cards).toHaveLength(3);

    // And the whole feed is longer than the catalogue it is drawn from.
    await waitFor(() => expect(screen.getAllByRole("article")).toHaveLength(6));
  });

  it("renders the server's order, and never re-sorts it", async () => {
    /*
      Reels are numbered within each business and ordered by that number, so
      everyone's first reel precedes anybody's second. That ordering is built
      so it CANNOT express a preference for any operator — it rotates them, it
      never ranks them — and our anchor operator is a co-founder's business.

      Sorting client-side by recency, or by anything at all, hands the feed to
      whoever uploaded most recently. So this pins the exact sequence the
      server sent, grouping-by-listing very much included: a feed that grouped
      the three dive clips together would read as ranked.
    */
    server.use(
      reels([
        { media: clip("m1"), experience: listing({ id: "a", title: "Zulu" }) },
        { media: clip("m2"), experience: listing({ id: "b", title: "Alpha" }) },
        { media: clip("m3"), experience: listing({ id: "a", title: "Zulu" }) },
      ]),
    );

    renderWithQuery(<Feed />);
    await waitFor(() => expect(screen.getAllByRole("article")).toHaveLength(3));

    expect(
      screen.getAllByRole("article").map((el) => el.getAttribute("aria-label")),
    ).toEqual(["Zulu", "Alpha", "Zulu"]);
  });

  it("keys cards by the clip, so one listing twice is not one React key twice", async () => {
    /*
      The bug this prevents is not cosmetic. With a key per LISTING, the three
      dive reels share one key: React warns, then on the next refetch reuses
      the wrong DOM node — and a `<video>` element's internal state (which
      source is loaded, where playback is) goes with the node. One clip's
      player would end up showing another's.

      Asserted through React's own warning because a duplicate key has no
      other observable signature from outside: the render still succeeds, which
      is exactly why keying by listing passed every other test in this file.
    */
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      server.use(
        reels([
          {
            media: clip("m1"),
            experience: listing({ id: "same", title: "Twice" }),
          },
          {
            media: clip("m2"),
            experience: listing({ id: "same", title: "Twice" }),
          },
        ]),
      );

      renderWithQuery(<Feed />);
      await waitFor(() =>
        expect(screen.getAllByRole("article")).toHaveLength(2),
      );

      const keyWarnings = spy.mock.calls
        .map((args) => String(args[0] ?? ""))
        .filter((m) =>
          /same key|unique "key"|Encountered two children/i.test(m),
        );
      expect(keyWarnings).toEqual([]);
    } finally {
      spy.mockRestore();
    }
  });

  it("drops a reel with no clip rather than drawing a black card", async () => {
    // Both halves are optional in the contract. This is the reels feed: a row
    // with nothing to play is a black rectangle somebody scrolls past.
    server.use(
      reels([
        { media: clip("m1"), experience: listing({ title: "Has a clip" }) },
        { experience: listing({ id: "z", title: "No clip at all" }) },
        { media: clip("m3") },
      ]),
    );

    renderWithQuery(<Feed />);
    expect(await screen.findByText("Has a clip")).toBeInTheDocument();
    expect(screen.queryByText("No clip at all")).not.toBeInTheDocument();
    expect(screen.getAllByRole("article")).toHaveLength(1);
  });

  it("says nothing about availability when the server sends no sentence", async () => {
    // Absent means say nothing — not "derive one from `seatsOnNext`". Both
    // live listings are request mode today and correctly carry no sentence.
    server.use(
      reels([
        {
          media: clip("m1"),
          experience: listing({
            title: "Silent",
            bookingMode: "request",
            nextAvailable: "2026-08-23",
            seatsOnNext: 3,
          }),
        },
      ]),
    );

    renderWithQuery(<Feed />);
    await screen.findByText("Silent");
    expect(screen.queryByText(/seats? left/)).not.toBeInTheDocument();
  });

  it("does not claim an operator is verified when they are not", async () => {
    server.use(
      reels([
        {
          media: clip("m1"),
          experience: listing({
            title: "Unverified",
            operator: { id: "o1", name: "New Operator", verified: false },
          }),
        },
      ]),
    );

    renderWithQuery(<Feed />);
    await screen.findByText("Unverified");
    expect(screen.queryByText("Verified")).not.toBeInTheDocument();
  });

  it("shows an honest empty state rather than a blank feed", async () => {
    server.use(reels([]));

    renderWithQuery(<Feed />);

    expect(
      await screen.findByText("Nothing bookable here yet"),
    ).toBeInTheDocument();
  });

  it("renders a paused kill switch calmly and offers no retry", async () => {
    server.use(
      http.get(`${BASE}/reels`, () =>
        HttpResponse.json(
          {
            error: {
              code: "booking_disabled",
              message: "raw server copy",
              requestId: "01JKILL",
            },
          },
          { status: 503 },
        ),
      ),
    );

    renderWithQuery(<Feed />);

    expect(await screen.findByText("Booking is paused")).toBeInTheDocument();
    expect(screen.getByText("01JKILL")).toBeInTheDocument();
    expect(screen.queryByText("raw server copy")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Try again" }),
    ).not.toBeInTheDocument();
  });

  it("claims the feed is complete only when the server said so", async () => {
    server.use(
      reels(
        [{ media: clip("m1"), experience: listing({ title: "Only one" }) }],
        { complete: true },
      ),
    );

    renderWithQuery(<Feed />);

    await waitFor(() =>
      expect(
        screen.getByText("That is everything on sale right now."),
      ).toBeInTheDocument(),
    );
  });

  it("withholds that claim on a full page that is not the end", async () => {
    /*
      The claim that can be false with nobody noticing. A page that comes back
      exactly full is not evidence of anything — before yuvoy-api#114 this
      screen said "That is the first 60 reels" because it genuinely could not
      tell. It is told now, and being told a full page is not the end has to
      beat the temptation to infer it from the count.
    */
    server.use(
      reels(
        Array.from({ length: 12 }, (_, i) => ({
          media: clip(`m${i}`),
          experience: listing({ id: `e${i}`, title: `Reel ${i}` }),
        })),
        { complete: false, nextCursor: "more" },
      ),
    );

    renderWithQuery(<Feed />);

    await waitFor(() =>
      expect(screen.getByText("Loading more reels…")).toBeInTheDocument(),
    );
    expect(
      screen.queryByText("That is everything on sale right now."),
    ).not.toBeInTheDocument();
  });

  it("tells the server stopping apart from the feed ending", async () => {
    /*
      `complete: false` with no cursor. The contract calls this out as "a
      different thing from the feed having ended", and there is nothing to page
      to — so the only honest offer is to reload the feed, and the screen must
      not say a traveller has seen everything on sale.
    */
    server.use(
      reels([{ media: clip("m1"), experience: listing() }], {
        complete: false,
      }),
    );

    renderWithQuery(<Feed />);

    await waitFor(() =>
      expect(
        screen.getByText(/That is as far as we can load right now/),
      ).toBeInTheDocument(),
    );
    expect(
      screen.queryByText("That is everything on sale right now."),
    ).not.toBeInTheDocument();
    // No control, and that is deliberate: `role="feed"` may not contain a
    // button. The copy carries the action instead.
    expect(screen.getByText(/Reload to try again/)).toBeInTheDocument();
  });
});

/**
 * What the card says about a price and about what the thing IS.
 *
 * Both from yuvoy-app#20, and the first is a consumer pricing misstatement
 * rather than a nicety: the card hard-coded "per person" beside the figure
 * while the platform has always supported group pricing.
 */
describe("Feed card claims", () => {
  it("says nothing about the basis rather than guessing one", async () => {
    // Unreachable while both fields ship with `fromPrice`. The branch exists so
    // a contract that ever loosened cannot silently reintroduce "per person".
    server.use(
      reels([
        {
          media: clip("m1"),
          experience: listing({
            title: "No basis",
            pricingUnitLabel: undefined,
          }),
        },
      ]),
    );

    renderWithQuery(<Feed />);
    await screen.findByText("No basis");
    expect(screen.queryByText("per person")).not.toBeInTheDocument();
    expect(screen.queryByText("for the group")).not.toBeInTheDocument();
  });

  it("renders nothing for a listing nobody has classified", async () => {
    // Optional by contract. No placeholder, and never a prettified key.
    server.use(
      reels([
        { media: clip("m1"), experience: listing({ title: "Unclassified" }) },
      ]),
    );

    renderWithQuery(<Feed />);
    await screen.findByText("Unclassified");
    expect(screen.queryByText(/scuba/i)).not.toBeInTheDocument();
  });
});
