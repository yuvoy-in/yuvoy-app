import { describe, it, expect, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { renderWithQuery } from "@/test/render";
import { Feed } from "./feed";
import { server } from "../../../mocks/server";
import { http, HttpResponse } from "msw";

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
 * A `/reels` handler that pages for real, keyed on the cursor it issued.
 *
 * Deliberately NOT a counter of calls. A handler that answered "page two" to
 * the second request regardless of what was asked would pass a client that
 * ignored the cursor entirely and re-fetched page one forever — which is the
 * single most likely way to get infinite scroll wrong.
 */
const pagedReels = (pages: { items: unknown[]; cursor?: string }[]) =>
  http.get(`${BASE}/reels`, ({ request }) => {
    const cursor = new URL(request.url).searchParams.get("cursor");
    const index = cursor ? pages.findIndex((p) => p.cursor === cursor) : 0;
    if (index < 0) return HttpResponse.json({ items: [], complete: true });

    const page = pages[index];
    const next = pages[index + 1];
    return HttpResponse.json({
      items: page.items,
      complete: !next,
      // Absent, never null — the real API omits the key on the last page.
      ...(next ? { nextCursor: next.cursor } : {}),
    });
  });

/**
 * An IntersectionObserver that reports whatever it is told to, on demand.
 *
 * The global stub in `vitest.setup.ts` does nothing at all, which is right for
 * every other test and useless for this one: with an inert observer the
 * sentinel never fires and infinite scroll cannot be exercised at all. This
 * one hands back a trigger, so a test drives the scroll instead of simulating
 * layout jsdom does not have.
 */
function firingObservers() {
  interface Live {
    cb: IntersectionObserverCallback;
    /** Whether this observer has already reported its target on screen. */
    reported: boolean;
    live: boolean;
  }
  const sentinels: Live[] = [];

  class Firing {
    private entry: Live;
    constructor(
      cb: IntersectionObserverCallback,
      options?: IntersectionObserverInit,
    ) {
      /*
        The feed builds TWO kinds of observer and only one of them is the
        scroll. Firing both would hand the active-card observer an entry with
        no `data-feed-index` on it and move the player as a side effect of a
        paging test.

        They are told apart by `rootMargin`: the sentinel is the only observer
        that asks for one, because it deliberately fires two screens early.
      */
      this.entry = { cb, reported: false, live: Boolean(options?.rootMargin) };
      if (this.entry.live) sentinels.push(this.entry);
    }
    observe() {}
    unobserve() {}
    disconnect() {
      // Honoured, not a no-op. A stub that kept firing disconnected observers
      // would make every "is the observer rebuilt" question unanswerable.
      this.entry.live = false;
    }
    takeRecords() {
      return [];
    }
    root = null;
    rootMargin = "";
    thresholds = [];
  }
  vi.stubGlobal("IntersectionObserver", Firing);

  const fire = (target: Live) => {
    target.reported = true;
    target.cb(
      [
        {
          isIntersecting: true,
          target: document.createElement("div"),
        } as unknown as IntersectionObserverEntry,
      ],
      null as unknown as IntersectionObserver,
    );
  };

  return {
    /**
     * The sentinel comes into view.
     *
     * Fires only observers that have not reported yet, because that is what a
     * real IntersectionObserver does: it reports CHANGES in intersection. A
     * sentinel that is already on screen and stays there produces no further
     * entry — which is exactly why the feed rebuilds its observer when a page
     * lands, and why a stub that re-fired on demand would let that bug through.
     */
    scrollToSentinel() {
      for (const s of [...sentinels]) if (s.live && !s.reported) fire(s);
    },
    /** Scrolled away and back: a genuine new intersection on a live observer. */
    jiggle() {
      for (const s of [...sentinels]) if (s.live) fire(s);
    },
    liveCount: () => sentinels.filter((s) => s.live).length,
  };
}

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
 * Infinite scroll, over a cursor the client is not allowed to construct.
 *
 * The rotation is computed across every eligible reel at query time, so a
 * client cannot resume this ordering from what it holds — page two has to be
 * asked for with the server's own opaque string, or one business's second reel
 * arrives before another's first.
 */
describe("Feed paging", () => {
  it("asks for the next page with the server's cursor, and appends it", async () => {
    const observers = firingObservers();
    server.use(
      pagedReels([
        {
          items: [{ media: clip("m1"), experience: listing({ title: "One" }) }],
        },
        {
          cursor: "opaque-2",
          items: [{ media: clip("m2"), experience: listing({ title: "Two" }) }],
        },
      ]),
    );

    renderWithQuery(<Feed />);
    await screen.findByText("One");

    observers.scrollToSentinel();

    await screen.findByText("Two");
    // Appended, not replaced — the first page is still on screen.
    expect(screen.getByText("One")).toBeInTheDocument();
    await waitFor(() =>
      expect(
        screen.getByText("That is everything on sale right now."),
      ).toBeInTheDocument(),
    );
  });

  it("keeps walking while the server keeps handing back cursors", async () => {
    const observers = firingObservers();
    server.use(
      pagedReels([
        {
          items: [{ media: clip("m1"), experience: listing({ title: "P1" }) }],
        },
        {
          cursor: "c2",
          items: [{ media: clip("m2"), experience: listing({ title: "P2" }) }],
        },
        {
          cursor: "c3",
          items: [{ media: clip("m3"), experience: listing({ title: "P3" }) }],
        },
      ]),
    );

    renderWithQuery(<Feed />);
    await screen.findByText("P1");

    observers.scrollToSentinel();
    await screen.findByText("P2");

    /*
      The second boundary is the one that matters. One can be crossed by an
      observer that happened to fire; two means the observer was rebuilt when
      the page landed. Without that rebuild the sentinel stays intersecting,
      IntersectionObserver reports only CHANGES, no further entry ever fires,
      and the feed stalls one page in with the sentinel sitting in view.
    */
    observers.scrollToSentinel();
    await screen.findByText("P3");
  });

  it("does not throw the feed away when a later page fails", async () => {
    /*
      The trap in `useInfiniteQuery`: `isError` is true whenever the LAST fetch
      failed, including a `fetchNextPage` with a screen full of good cards
      behind it. Branching the full-screen error state on `isError` would
      delete a working feed because page two did not arrive on island signal.
      `isLoadingError` is the narrow one, and this test is why it is used.
    */
    const observers = firingObservers();
    /** Counts attempts at the NEXT page, which is the loop under test. */
    let attempts = 0;
    server.use(
      http.get(`${BASE}/reels`, ({ request }) => {
        const cursor = new URL(request.url).searchParams.get("cursor");
        if (!cursor) {
          return HttpResponse.json({
            items: [
              { media: clip("m1"), experience: listing({ title: "Held" }) },
            ],
            complete: false,
            nextCursor: "c2",
          });
        }
        attempts += 1;
        return HttpResponse.json(
          { error: { code: "internal_error", message: "boom" } },
          { status: 500 },
        );
      }),
    );

    renderWithQuery(<Feed />);
    await screen.findByText("Held");

    observers.scrollToSentinel();

    await waitFor(() =>
      expect(screen.getByText(/More reels did not load/)).toBeInTheDocument(),
    );
    // The cards that DID arrive are still there.
    expect(screen.getByText("Held")).toBeInTheDocument();
    // And the failure is never dressed up as an ending.
    expect(
      screen.queryByText("That is everything on sale right now."),
    ).not.toBeInTheDocument();

    /*
      And scrolling away and back tries again — which is the whole recovery
      path, because `role="feed"` may not contain a button and there is
      therefore no Try again to tap.

      This is safe from becoming a retry loop by IntersectionObserver's own
      semantics rather than by a guard: it reports CHANGES in intersection, so
      a sentinel that is already on screen and stays there cannot fire twice.
      Only a deliberate scroll produces another. `jiggle()` is that scroll.
    */
    expect(screen.getByText(/Scroll up and back down/)).toBeInTheDocument();

    const before = attempts;
    observers.jiggle();
    await waitFor(() => expect(attempts).toBeGreaterThan(before));
  });

  it("does not ask again while a page fetch is still in flight", async () => {
    /*
      The one guard that is real. Two intersections in the same tick — a
      resize, a re-render — must not put two requests for the same cursor on a
      0.5 Mbps link.
    */
    const observers = firingObservers();
    let attempts = 0;
    server.use(
      http.get(`${BASE}/reels`, async ({ request }) => {
        const cursor = new URL(request.url).searchParams.get("cursor");
        if (!cursor) {
          return HttpResponse.json({
            items: [
              { media: clip("m1"), experience: listing({ title: "One" }) },
            ],
            complete: false,
            nextCursor: "c2",
          });
        }
        attempts += 1;
        await new Promise((resolve) => setTimeout(resolve, 60));
        return HttpResponse.json({
          items: [
            {
              media: clip("m2"),
              experience: listing({ id: "e2", title: "Two" }),
            },
          ],
          complete: true,
        });
      }),
    );

    renderWithQuery(<Feed />);
    await screen.findByText("One");

    observers.scrollToSentinel();
    observers.jiggle();
    observers.jiggle();

    await screen.findByText("Two");
    expect(attempts).toBe(1);
  });

  it("does not claim a total it has not been given", async () => {
    /*
      `aria-setsize` is a claim. Before paging, `items.length` WAS the whole
      feed and saying so was correct; a first page of twelve now tells a screen
      reader user "1 of 12" about a feed with more in it, and renumbers
      everything when the next page lands. `-1` is ARIA's own word for a total
      nobody knows yet.
    */
    server.use(
      reels(
        [
          { media: clip("m1"), experience: listing({ title: "First" }) },
          {
            media: clip("m2"),
            experience: listing({ id: "e2", title: "Second" }),
          },
        ],
        { complete: false, nextCursor: "more" },
      ),
    );

    renderWithQuery(<Feed />);
    await screen.findByText("First");

    for (const card of screen.getAllByRole("article")) {
      expect(card).toHaveAttribute("aria-setsize", "-1");
    }
  });

  it("states the total once the server says the feed is complete", async () => {
    server.use(
      reels(
        [
          { media: clip("m1"), experience: listing({ title: "First" }) },
          {
            media: clip("m2"),
            experience: listing({ id: "e2", title: "Second" }),
          },
        ],
        { complete: true },
      ),
    );

    renderWithQuery(<Feed />);
    await screen.findByText("First");

    for (const card of screen.getAllByRole("article")) {
      expect(card).toHaveAttribute("aria-setsize", "2");
    }
  });

  it("never sends a cursor on the first request", async () => {
    /*
      An empty `cursor=` is a different request from no cursor at all, and only
      the second is described by the contract.
    */
    const seen: (string | null)[] = [];
    server.use(
      http.get(`${BASE}/reels`, ({ request }) => {
        const u = new URL(request.url);
        seen.push(u.searchParams.get("cursor"));
        return HttpResponse.json({
          items: [{ media: clip("m1"), experience: listing() }],
          complete: true,
        });
      }),
    );

    renderWithQuery(<Feed />);
    await waitFor(() => expect(seen.length).toBeGreaterThan(0));
    expect(seen[0]).toBeNull();
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
