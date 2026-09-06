import { describe, it, expect, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { renderWithQuery } from "@/test/render";
import { Feed } from "./feed";
import { server } from "../../../mocks/server";
import { http, HttpResponse } from "msw";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8099/v1";

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

const reels = (items: unknown[]) =>
  http.get(`${BASE}/reels`, () => HttpResponse.json({ items }));

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
    const cards = await screen.findAllByText("Try-dive at Nemo Reef");
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

  it("never renders a placeholder price when none is contracted", async () => {
    server.use(
      reels([
        { media: clip("m1"), experience: listing({ fromPrice: undefined }) },
      ]),
    );

    renderWithQuery(<Feed />);

    expect(await screen.findByText("Price on request")).toBeInTheDocument();
    // ₹0 would be a fabricated claim.
    expect(screen.queryByText("₹0")).not.toBeInTheDocument();
  });

  it("renders the server's seat sentence verbatim, and derives none of its own", async () => {
    /*
      yuvoy-api#92. The card used to print "N seats left" below a threshold of
      five that IT kept — a second copy of a rule the server owns, which
      disagrees with the slot row the moment the threshold moves or counts start
      being suppressed.

      `seatsOnNext: 40` with a sentence saying "2 seats left" is deliberately
      contradictory: only a card that renders the string wins, and one that
      re-derives from the integer would print nothing (40 is over the old
      threshold) or "40 seats left".
    */
    server.use(
      reels([
        {
          media: clip("m1"),
          experience: listing({
            title: "Verbatim",
            nextAvailable: "2026-08-23",
            seatsOnNext: 40,
            seatsOnNextDisplay: "2 seats left",
          }),
        },
      ]),
    );

    renderWithQuery(<Feed />);
    expect(await screen.findByText(/2 seats left/)).toBeInTheDocument();
    expect(screen.queryByText(/40 seats/)).not.toBeInTheDocument();
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

  it("says so when nothing is bookable in 90 days, rather than staying silent", async () => {
    server.use(
      reels([
        {
          media: clip("m1"),
          experience: listing({
            title: "Night fishing with a local crew",
            nextAvailable: undefined,
          }),
        },
      ]),
    );

    renderWithQuery(<Feed />);

    // The tap that ends in "no dates" is the tap that loses the traveller.
    expect(
      await screen.findByText("No dates in the next 90 days"),
    ).toBeInTheDocument();
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

  it("claims the feed is complete only when it can know that", async () => {
    // Short answer: the server had nothing more to give.
    server.use(
      reels([
        { media: clip("m1"), experience: listing({ title: "Only one" }) },
      ]),
    );

    renderWithQuery(<Feed />);

    await waitFor(() =>
      expect(
        screen.getByText("That is everything on sale right now."),
      ).toBeInTheDocument(),
    );
  });

  it("withholds that claim when the answer is exactly the cap", async () => {
    /*
      `/reels` has no cursor and no `complete` flag, so a full answer and a
      coincidentally-full one are identical on the wire. "That is everything on
      sale right now" is the one claim on this screen that can be false with
      nobody noticing, so at the cap the feed says what it actually knows.
    */
    server.use(
      reels(
        Array.from({ length: 60 }, (_, i) => ({
          media: clip(`m${i}`),
          experience: listing({ id: `e${i}`, title: `Reel ${i}` }),
        })),
      ),
    );

    renderWithQuery(<Feed />);

    await waitFor(() =>
      expect(
        screen.getByText("That is the first 60 reels."),
      ).toBeInTheDocument(),
    );
    expect(
      screen.queryByText("That is everything on sale right now."),
    ).not.toBeInTheDocument();
  });
});
