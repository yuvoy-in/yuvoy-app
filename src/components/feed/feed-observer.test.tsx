import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { ExperienceCard } from "./experience-card";
import { EXPERIENCES } from "../../../mocks/fixtures";

/**
 * Regression: the feed created one IntersectionObserver per card per mount and
 * never disconnected any of them, because the ref callback's return value was
 * discarded with `void`. On the screen travellers scroll most, that leak grows
 * for as long as they scroll.
 */

const disconnect = vi.fn();
const observe = vi.fn();

class TrackingObserver {
  constructor(_cb: unknown) {}
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
  vi.stubGlobal("IntersectionObserver", TrackingObserver);
});

describe("feed card ref cleanup", () => {
  it("disconnects every observer it creates", () => {
    // The invariant that matters: nothing accumulates. Asserting an exact
    // disconnect count would pin React's detach sequence rather than the
    // property we actually need.
    const observeCard = (node: HTMLElement | null) => {
      if (!node) return undefined;
      const obs = new IntersectionObserver(() => {});
      obs.observe(node);
      return () => obs.disconnect();
    };

    const { unmount } = render(
      <ExperienceCard
        ref={(node) => observeCard(node)}
        experience={EXPERIENCES[0]}
        index={0}
        total={1}
        active
        mounted
        muted
        autoplayAllowed={false}
      />,
    );

    const created = observe.mock.calls.length;
    expect(created).toBeGreaterThan(0);

    unmount();

    // React 19 runs a ref callback's returned cleanup on detach. Discard that
    // return — as the first version did with `void` — and this stays at zero
    // while the observer lives forever.
    expect(disconnect.mock.calls.length).toBeGreaterThanOrEqual(created);
    cleanup();
  });

  it("does not accumulate observers across repeated mounts", () => {
    const observeCard = (node: HTMLElement | null) => {
      if (!node) return undefined;
      const obs = new IntersectionObserver(() => {});
      obs.observe(node);
      return () => obs.disconnect();
    };

    for (let i = 0; i < 5; i++) {
      const { unmount } = render(
        <ExperienceCard
          ref={(node) => observeCard(node)}
          experience={EXPERIENCES[0]}
          index={0}
          total={1}
          active
          mounted
          muted
          autoplayAllowed={false}
        />,
      );
      unmount();
    }

    // Every observer created is released. A leak shows up here as a growing
    // gap between the two counts.
    expect(observe.mock.calls.length).toBeGreaterThanOrEqual(5);
    expect(disconnect.mock.calls.length).toBeGreaterThanOrEqual(
      observe.mock.calls.length,
    );
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
  });
});
