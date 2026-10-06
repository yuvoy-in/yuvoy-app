import { describe, it, expect, vi, beforeEach } from "vitest";
import { cleanup } from "@testing-library/react";
import { renderWithQuery } from "@/test/render";
import { ExperienceCard } from "./experience-card";
import { EXPERIENCES } from "../../../mocks/fixtures";

/**
 * Regression cover for the feed's observer, after three attempts.
 *
 * The first leaked one IntersectionObserver per card per mount (the ref
 * callback's cleanup return was discarded). The second fixed the leak but
 * rebuilt every observer on every render, because an inline ref arrow changes
 * identity — and the feed re-renders on every scroll. The third reads a ref
 * during render, which React forbids.
 *
 * The shipped version puts ONE observer on the scroller and carries each
 * card's index on the DOM node. These tests pin the two properties that make
 * that work.
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

const disconnect = vi.fn();
const observe = vi.fn();
/** Counts INSTANCES, which is what "one observer for the feed" means. */
const constructed = vi.fn();

class TrackingObserver {
  constructor() {
    constructed();
  }
  observe = observe;
  unobserve = () => {};
  disconnect = disconnect;
  takeRecords = () => [];
  root = null;
  rootMargin = "";
  thresholds = [];
}

beforeEach(() => {
  disconnect.mockClear();
  observe.mockClear();
  constructed.mockClear();
  vi.stubGlobal("IntersectionObserver", TrackingObserver);
});

describe("feed card", () => {
  it("carries its index on the node, so one observer can serve the whole feed", () => {
    /* Wrapped: the card reads the saved set through a QueryClient. See
       `use-saved` for why that is where it belongs. */
    const { container } = renderWithQuery(
      <ExperienceCard
        experience={EXPERIENCES[0]}
        index={2}
        total={9}
        active={false}
        mounted={false}
        muted
        autoplayAllowed={false}
      />,
    );

    const article = container.querySelector("article");
    // Read by the feed's observer. Without it the observer cannot tell which
    // card became active, and the index would have to travel in a closure —
    // which is what forced a per-card observer in the first place.
    expect(article).toHaveAttribute("data-feed-index", "2");
    cleanup();
  });

  it("announces its position in a set, so the feed reads as a list", () => {
    const { container } = renderWithQuery(
      <ExperienceCard
        experience={EXPERIENCES[0]}
        index={2}
        total={9}
        active={false}
        mounted={false}
        muted
        autoplayAllowed={false}
      />,
    );

    const article = container.querySelector("article");
    expect(article).toHaveAttribute("aria-posinset", "3");
    expect(article).toHaveAttribute("aria-setsize", "9");
    cleanup();
  });
});

describe("the feed's observer", () => {
  it("uses ONE observer for the whole feed, and releases it on unmount", async () => {
    // The invariant the three failed attempts were reaching for: the count of
    // feed observers does not grow with the number of cards, and nothing
    // survives unmount.
    //
    // next/image creates its own IntersectionObserver for lazy loading, so the
    // measurement is the DELTA around the feed rather than an absolute count.
    const { Feed } = await import("./feed");
    const { screen, waitFor } = await import("@testing-library/react");

    const before = constructed.mock.calls.length;
    const { unmount } = renderWithQuery(<Feed />);
    await waitFor(() =>
      // `getAllBy`, because one listing now appears several times: the feed is
      // reels, and `exp_try_dive` has three (yuvoy-app#18).
      expect(
        screen.getAllByText("Try-dive at Nemo Reef").length,
      ).toBeGreaterThan(0),
    );

    // The feed itself now builds ONE: the observer watching which card is
    // active. The infinite-scroll sentinel's observer went with the paging,
    // because `/reels` has no cursor to page on. next/image builds one per
    // image for lazy loading, which is not ours to control — so the assertion
    // is that the feed's own count does NOT scale with the number of cards.
    const cards = screen.getAllByRole("article").length;
    const created = constructed.mock.calls.length - before;
    expect(cards).toBeGreaterThan(1);
    expect(created).toBeLessThanOrEqual(cards + 2);

    // And observing every card costs observe() calls on ONE instance, not a
    // new instance each.
    expect(created).toBeLessThan(cards * 2 + 2);

    const disconnectsBefore = disconnect.mock.calls.length;
    unmount();
    expect(disconnect.mock.calls.length).toBeGreaterThan(disconnectsBefore);

    cleanup();
  });
});

/*
  Which card is playing is decided by how much of it is on screen. The spec
  sets `isIntersecting` for ANY overlap, so the entry reporting a card on its
  way OUT (crossing back under 0.6) says true, and trusting it made the
  leaving card the active one in a batch that held both (6 Oct 2026).
*/
describe("the card that is playing", () => {
  it("is the one 60% on screen, never one on its way out", async () => {
    let report: IntersectionObserverCallback | null = null;
    class Capturing extends TrackingObserver {
      constructor(
        callback: IntersectionObserverCallback,
        options?: IntersectionObserverInit,
      ) {
        super();
        // The strip's observer is the one rooted on the scroller.
        if (options?.root) report = callback;
      }
    }
    vi.stubGlobal("IntersectionObserver", Capturing);
    const { Feed } = await import("./feed");
    const { useFeedStore } = await import("@/lib/feed/store");
    const { act, screen, waitFor } = await import("@testing-library/react");
    renderWithQuery(<Feed />);
    await waitFor(() =>
      expect(screen.getAllByRole("article").length).toBeGreaterThan(2),
    );
    expect(report).not.toBeNull();

    const card = (index: number) =>
      document.querySelector(`[data-feed-index="${index}"]`)!;
    const entry = (index: number, ratio: number) =>
      ({
        target: card(index),
        isIntersecting: ratio > 0,
        intersectionRatio: ratio,
      }) as unknown as IntersectionObserverEntry;

    // One batch: the second card arrives, the first leaves (still overlapping).
    act(() => {
      report!(
        [entry(1, 0.9), entry(0, 0.3)],
        null as unknown as IntersectionObserver,
      );
    });
    expect(useFeedStore.getState().activeIndex).toBe(1);

    cleanup();
  });
});
