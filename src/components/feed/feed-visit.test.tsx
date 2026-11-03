import { describe, it, expect, vi, afterEach } from "vitest";
import { act, screen, waitFor } from "@testing-library/react";
import { focusManager, onlineManager } from "@tanstack/react-query";
import { renderWithQuery } from "@/test/render";
import { Feed } from "./feed";
import type { ReelsPage } from "@/lib/feed/reels";
import { useFeedStore } from "@/lib/feed/store";
import { setConsent } from "@/lib/analytics/consent";
import { __resetReelViewCollector } from "@/lib/analytics/reel-views";
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
 * The feed is one VISIT of a shuffled order (yuvoy-app#96, yuvoy-api#213).
 *
 * A request without a cursor is a new visit in a new order, so a background
 * refetch would reshuffle the feed under the traveller's thumb, and a cursor
 * minted before the shuffle is refused once with a 400.
 */
describe("the feed as one visit", () => {
  afterEach(() => {
    vi.useRealTimers();
    act(() => {
      onlineManager.setOnline(true);
      focusManager.setFocused(undefined);
    });
  });

  /** The page the server rendered before the deploy, holding an old cursor. */
  const before: ReelsPage = {
    items: [
      {
        media: clip("m1"),
        experience: listing({ id: "e1", title: "Seen one" }),
      },
      {
        media: clip("m2"),
        experience: listing({ id: "e2", title: "Seen two" }),
      },
    ] as unknown as ReelsPage["items"],
    complete: false,
    nextCursor: "pre-shuffle",
  };

  it("starts a new visit when an old cursor is refused, and shows nothing twice", async () => {
    const observers = firingObservers();
    const asked: (string | null)[] = [];
    server.use(
      http.get(`${BASE}/reels`, ({ request }) => {
        const cursor = new URL(request.url).searchParams.get("cursor");
        asked.push(cursor);
        if (cursor === "pre-shuffle") {
          return HttpResponse.json(
            {
              error: {
                code: "invalid_input",
                message:
                  "that cursor can no longer be used, so start again from the first page",
              },
            },
            { status: 400 },
          );
        }
        if (cursor === null) {
          // A new visit: the whole catalogue again, in a new order.
          return HttpResponse.json({
            items: [
              {
                media: clip("m2"),
                experience: listing({ id: "e2", title: "Seen two" }),
              },
              {
                media: clip("m3"),
                experience: listing({ id: "e3", title: "New three" }),
              },
              {
                media: clip("m1"),
                experience: listing({ id: "e1", title: "Seen one" }),
              },
            ],
            complete: false,
            nextCursor: "v2-2",
          });
        }
        return HttpResponse.json({
          items: [
            {
              media: clip("m4"),
              experience: listing({ id: "e4", title: "New four" }),
            },
          ],
          complete: true,
        });
      }),
    );

    renderWithQuery(
      <Feed initialPage={before} initialFetchedAt={Date.now()} />,
    );
    await screen.findByText("Seen one");

    observers.scrollToSentinel();
    await screen.findByText("New three");

    // No error, and the reels already shown are not shown again.
    expect(screen.queryByText(/More reels did not load/)).toBeNull();
    expect(screen.getAllByText("Seen one")).toHaveLength(1);
    expect(screen.getAllByText("Seen two")).toHaveLength(1);
    // Appended after what was on screen, so nothing above the traveller moved.
    const titles = screen
      .getAllByRole("article")
      .map((card) => card.getAttribute("aria-label"));
    expect(titles).toEqual(["Seen one", "Seen two", "New three"]);

    // And it carries on from the NEW visit's cursor.
    observers.scrollToSentinel();
    await screen.findByText("New four");
    expect(asked).toEqual(["pre-shuffle", null, "v2-2"]);
  });

  it("restarts once, and a second refusal is an ordinary failed page", async () => {
    const observers = firingObservers();
    let firstPages = 0;
    server.use(
      http.get(`${BASE}/reels`, ({ request }) => {
        const cursor = new URL(request.url).searchParams.get("cursor");
        if (cursor === null) {
          firstPages += 1;
          return HttpResponse.json({
            items: [
              {
                media: clip("m3"),
                experience: listing({ id: "e3", title: "New three" }),
              },
            ],
            complete: false,
            nextCursor: "v2-2",
          });
        }
        return HttpResponse.json(
          { error: { code: "invalid_input", message: "no" } },
          { status: 400 },
        );
      }),
    );

    renderWithQuery(
      <Feed initialPage={before} initialFetchedAt={Date.now()} />,
    );
    await screen.findByText("Seen one");

    observers.scrollToSentinel();
    await screen.findByText("New three");
    observers.scrollToSentinel();

    await waitFor(() =>
      expect(screen.getByText(/More reels did not load/)).toBeInTheDocument(),
    );
    // One restart, not one per refusal.
    expect(firstPages).toBe(1);
    expect(screen.getByText("Seen one")).toBeInTheDocument();
  });

  it("does not refetch, and so does not reshuffle, when the tab or the signal comes back", async () => {
    /*
      A refetch here is not a refresh, it is a different feed: every page
      re-walked from a new first page in a new order. Date is moved on well
      past what the old one-minute policy would have called stale, and focus
      and connectivity are then both lost and regained.
    */
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-09-21T08:30:00Z"));
    let calls = 0;
    server.use(
      http.get(`${BASE}/reels`, () => {
        calls += 1;
        return HttpResponse.json({
          items: [{ media: clip("m1"), experience: listing({ title: "One" }) }],
          complete: false,
          nextCursor: "c2",
        });
      }),
    );

    renderWithQuery(<Feed />);
    await screen.findByText("One");
    expect(calls).toBe(1);

    vi.setSystemTime(new Date("2026-09-21T09:30:00Z"));
    act(() => {
      focusManager.setFocused(false);
      focusManager.setFocused(true);
      onlineManager.setOnline(false);
      onlineManager.setOnline(true);
    });
    await new Promise((r) => setTimeout(r, 60));

    expect(calls).toBe(1);
  });
});

/**
 * Reel views, from the feed itself (yuvoy-app#96): the strip says which reel
 * is on screen, and a view of it is reported when the feed is left, only with
 * analytics consent.
 */
describe("the feed, reporting views", () => {
  afterEach(() => {
    setConsent("denied");
    __resetReelViewCollector();
    vi.useRealTimers();
  });

  function captureViews() {
    const calls: { auth: string | null; events: { reelId: string }[] }[] = [];
    server.use(
      http.post(`${BASE}/reel-views`, async ({ request }) => {
        const body = (await request.json()) as {
          events: { reelId: string }[];
        };
        calls.push({
          auth: request.headers.get("authorization"),
          events: body.events,
        });
        return HttpResponse.json(
          { accepted: body.events.length, dropped: 0, droppedEvents: [] },
          { status: 202 },
        );
      }),
    );
    return calls;
  }

  it("reports each reel the traveller settled on, with consent", async () => {
    setConsent("granted");
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-09-21T10:00:00Z"));
    const calls = captureViews();
    server.use(
      reels([
        { media: clip("m1"), experience: listing({ id: "e1", title: "One" }) },
        { media: clip("m2"), experience: listing({ id: "e2", title: "Two" }) },
      ]),
    );

    const { unmount } = renderWithQuery(<Feed />);
    await screen.findByText("One");
    act(() => {
      vi.setSystemTime(Date.now() + 2_000);
      useFeedStore.getState().setActiveIndex(1);
    });
    act(() => {
      vi.setSystemTime(Date.now() + 2_000);
    });
    unmount();

    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0].auth).toBeNull();
    expect(calls[0].events.map((e) => e.reelId)).toEqual(["m1", "m2"]);
  });

  it("reports nothing without consent", async () => {
    setConsent("denied");
    const calls = captureViews();
    server.use(
      reels([{ media: clip("m1"), experience: listing({ title: "One" }) }]),
    );

    const { unmount } = renderWithQuery(<Feed />);
    await screen.findByText("One");
    await new Promise((r) => setTimeout(r, 350));
    unmount();
    await new Promise((r) => setTimeout(r, 30));
    expect(calls).toEqual([]);
  });
});
