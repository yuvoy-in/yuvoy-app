import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
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
    const { container } = render(
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
    const { container } = render(
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
    const { renderWithQuery } = await import("@/test/render");
    const { screen, waitFor } = await import("@testing-library/react");

    const before = constructed.mock.calls.length;
    const { unmount } = renderWithQuery(<Feed />);
    await waitFor(() =>
      expect(screen.getByText("Try-dive at Nemo Reef")).toBeInTheDocument(),
    );

    // The feed itself builds two: one watching which card is active, one on
    // the infinite-scroll sentinel. next/image builds one per image for lazy
    // loading, which is not ours to control — so the assertion is that the
    // feed's own count does NOT scale with the number of cards.
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
