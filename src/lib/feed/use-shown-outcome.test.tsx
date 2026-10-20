import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { render, cleanup } from "@testing-library/react";
import { setConsent } from "@/lib/analytics/consent";
import {
  __resetOutcomeCollector,
  outcomeCollector,
  type OutcomeSurface,
} from "@/lib/analytics/outcomes";
import { SHOWN_AFTER_MS, useShownOutcome } from "./use-shown-outcome";

/**
 * `shown` for the card on screen (yuvoy-app#181): after a second in view with
 * the page visible, at its place in the list, once per card and surface.
 */

function Strip({
  card,
  surface = "feed",
}: {
  card: { subjectId?: string; position: number } | null;
  surface?: OutcomeSurface;
}) {
  useShownOutcome(card, surface);
  return null;
}

function setVisibility(state: "visible" | "hidden") {
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    get: () => state,
  });
  act(() => {
    document.dispatchEvent(new Event("visibilitychange"));
  });
}

const waiting = () =>
  outcomeCollector()
    .inspect()
    .waiting.map((e) => `${e.kind} ${e.surface} ${e.subjectId} ${e.position}`);

const wait = (ms: number) => act(() => vi.advanceTimersByTime(ms));

beforeEach(() => {
  vi.useFakeTimers();
  __resetOutcomeCollector();
  setConsent("granted");
});
afterEach(() => {
  cleanup();
  setVisibility("visible");
  setConsent("denied");
  __resetOutcomeCollector();
  vi.useRealTimers();
});

describe("a card shown", () => {
  it("counts once it has been on screen for a second, at its place", () => {
    render(<Strip card={{ subjectId: "exp_a", position: 3 }} />);
    wait(SHOWN_AFTER_MS - 1);
    expect(waiting()).toEqual([]);
    wait(1);
    expect(waiting()).toEqual(["shown feed exp_a 3"]);
  });

  it("does not count a card a thumb flicked straight past", () => {
    const { rerender } = render(
      <Strip card={{ subjectId: "exp_a", position: 0 }} />,
    );
    wait(300);
    rerender(<Strip card={{ subjectId: "exp_b", position: 1 }} />);
    wait(SHOWN_AFTER_MS);
    expect(waiting()).toEqual(["shown feed exp_b 1"]);
  });

  it("counts a card scrolled back to only once", () => {
    const { rerender } = render(
      <Strip card={{ subjectId: "exp_a", position: 0 }} />,
    );
    wait(SHOWN_AFTER_MS);
    rerender(<Strip card={{ subjectId: "exp_b", position: 1 }} />);
    wait(SHOWN_AFTER_MS);
    rerender(<Strip card={{ subjectId: "exp_a", position: 0 }} />);
    wait(SHOWN_AFTER_MS);
    expect(waiting()).toEqual(["shown feed exp_a 0", "shown feed exp_b 1"]);
  });

  it("times nothing while the page is hidden or without consent", () => {
    setVisibility("hidden");
    const { rerender } = render(
      <Strip card={{ subjectId: "exp_a", position: 0 }} />,
    );
    wait(SHOWN_AFTER_MS * 3);
    expect(waiting()).toEqual([]);

    setVisibility("visible");
    act(() => setConsent("denied"));
    rerender(<Strip card={{ subjectId: "exp_a", position: 0 }} />);
    wait(SHOWN_AFTER_MS * 3);
    expect(waiting()).toEqual([]);

    // A yes given while it is on screen counts it from then on.
    act(() => setConsent("granted"));
    wait(SHOWN_AFTER_MS);
    expect(waiting()).toEqual(["shown feed exp_a 0"]);
  });

  it("counts nothing for a reel with no listing", () => {
    render(<Strip card={null} />);
    wait(SHOWN_AFTER_MS * 2);
    expect(waiting()).toEqual([]);
  });
});
