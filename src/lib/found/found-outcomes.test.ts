import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { setConsent } from "@/lib/analytics/consent";
import {
  __resetOutcomeCollector,
  outcomeCollector,
} from "@/lib/analytics/outcomes";
import { SHOWN_AFTER_MS } from "@/lib/feed/use-shown-outcome";
import { createShownTracker, recordFound } from "./found-outcomes";

/**
 * Found cards counted (yuvoy-app#179): every outcome names an `event`, and a
 * card is `shown` once it has been half on screen for a second, once per card
 * per view of the feed.
 */

const waiting = () => outcomeCollector().inspect().waiting;

beforeEach(() => {
  __resetOutcomeCollector();
  setConsent("granted");
});
afterEach(() => {
  setConsent("denied");
  __resetOutcomeCollector();
  vi.useRealTimers();
});

describe("recordFound", () => {
  it("names the subject an event, on the surface it was given", () => {
    recordFound("opened", "item-1", "found_detail");
    recordFound("link_out", "item-2", "found_feed", 4);
    expect(
      waiting().map(({ kind, subjectType, subjectId, surface, position }) => ({
        kind,
        subjectType,
        subjectId,
        surface,
        position,
      })),
    ).toEqual([
      {
        kind: "opened",
        subjectType: "event",
        subjectId: "item-1",
        surface: "found_detail",
        position: undefined,
      },
      {
        kind: "link_out",
        subjectType: "event",
        subjectId: "item-2",
        surface: "found_feed",
        position: 4,
      },
    ]);
  });

  it("counts every R2 kind, problem_reported included", () => {
    for (const kind of [
      "shown",
      "opened",
      "link_out",
      "shared",
      "problem_reported",
    ] as const) {
      recordFound(kind, `id-${kind}`, "found_feed");
    }
    expect(waiting().map((e) => e.kind)).toEqual([
      "shown",
      "opened",
      "link_out",
      "shared",
      "problem_reported",
    ]);
  });

  it("records nothing without consent", () => {
    setConsent("denied");
    recordFound("opened", "item-1", "found_detail");
    expect(waiting()).toEqual([]);
  });
});

describe("a found card shown", () => {
  function tracker(counting = () => true) {
    vi.useFakeTimers();
    const record = vi.fn();
    const t = createShownTracker({
      record,
      counting,
      setTimer: (run, ms) => setTimeout(run, ms),
      clearTimer: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
    });
    return { t, record };
  }

  it("counts once half of it has been on screen for a second, at its place", () => {
    const { t, record } = tracker();
    t.enter("a", 2);
    vi.advanceTimersByTime(SHOWN_AFTER_MS - 1);
    expect(record).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(record).toHaveBeenCalledWith("a", 2);
  });

  it("does not count a card scrolled past in under a second", () => {
    const { t, record } = tracker();
    t.enter("a", 0);
    vi.advanceTimersByTime(600);
    t.leave("a");
    vi.advanceTimersByTime(SHOWN_AFTER_MS);
    expect(record).not.toHaveBeenCalled();
  });

  it("counts a card once per view, however often it comes back", () => {
    const { t, record } = tracker();
    t.enter("a", 0);
    vi.advanceTimersByTime(SHOWN_AFTER_MS);
    t.leave("a");
    t.enter("a", 0);
    vi.advanceTimersByTime(SHOWN_AFTER_MS * 3);
    expect(record).toHaveBeenCalledTimes(1);
  });

  it("counts it again in a new view", () => {
    const first = tracker();
    first.t.enter("a", 0);
    vi.advanceTimersByTime(SHOWN_AFTER_MS);
    first.t.dispose();
    const second = tracker();
    second.t.enter("a", 0);
    vi.advanceTimersByTime(SHOWN_AFTER_MS);
    expect(first.record).toHaveBeenCalledTimes(1);
    expect(second.record).toHaveBeenCalledTimes(1);
  });

  it("stops the clock while the page is hidden, and starts it afresh after", () => {
    let visible = true;
    const { t, record } = tracker(() => visible);
    t.enter("a", 0);
    vi.advanceTimersByTime(700);
    visible = false;
    t.pause();
    vi.advanceTimersByTime(SHOWN_AFTER_MS);
    expect(record).not.toHaveBeenCalled();
    visible = true;
    t.resume();
    vi.advanceTimersByTime(SHOWN_AFTER_MS - 1);
    expect(record).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(record).toHaveBeenCalledTimes(1);
  });

  it("times nothing without consent", () => {
    const { t, record } = tracker(() => false);
    t.enter("a", 0);
    vi.advanceTimersByTime(SHOWN_AFTER_MS * 2);
    expect(record).not.toHaveBeenCalled();
  });

  it("reaches the collector as an event on the found feed", () => {
    vi.useFakeTimers();
    const t = createShownTracker({
      record: (id, position) => recordFound("shown", id, "found_feed", position),
      counting: () => true,
      setTimer: (run, ms) => setTimeout(run, ms),
      clearTimer: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
    });
    t.enter("item-9", 1);
    vi.advanceTimersByTime(SHOWN_AFTER_MS);
    expect(waiting()).toEqual([
      expect.objectContaining({
        kind: "shown",
        subjectType: "event",
        subjectId: "item-9",
        surface: "found_feed",
        position: 1,
      }),
    ]);
  });
});
