import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { detectAutoplayAllowed, useFeedStore } from "./store";

/**
 * The heuristic that decided nobody could watch anything — yuvoy-app#17.
 *
 * It refused whenever `navigator.connection` was absent, which is Safari,
 * Firefox and all of iOS. Because the player gated the `<video>` element on
 * the same flag, that was not a conservative default: it was every reel
 * showing a still poster forever, with no control to press. Reported by the
 * owner as "videos are not getting played correctly", with correct media
 * behind it the whole time.
 *
 * So the case that matters most below is the plainest one: no API, allow.
 */

/** The API is Chromium-only, so its absence is the majority case, not an edge. */
function withConnection(conn: unknown) {
  Object.defineProperty(navigator, "connection", {
    configurable: true,
    get: () => conn,
  });
}

function withReducedMotion(reduce: boolean) {
  vi.spyOn(window, "matchMedia").mockImplementation(
    (query: string) =>
      ({
        matches: reduce && query.includes("prefers-reduced-motion"),
        media: query,
        addEventListener: () => {},
        removeEventListener: () => {},
      }) as unknown as MediaQueryList,
  );
}

afterEach(() => {
  vi.restoreAllMocks();
  withConnection(undefined);
});

describe("detectAutoplayAllowed", () => {
  it("allows when the browser has no Network Information API", () => {
    /*
      The regression. Safari, Firefox and every iOS browser land here, and
      `feed-player.tsx` calls them "most of our traffic" in its own header.
      Silence from the browser is not evidence of a bad connection.
    */
    withReducedMotion(false);
    withConnection(undefined);
    expect(detectAutoplayAllowed()).toBe(true);
  });

  it("allows on a connection that reports nothing useful", () => {
    // `effectiveType` is optional even where the API exists. Absent is
    // silence, and silence is not a slow link — the same mistake one field in.
    withReducedMotion(false);
    withConnection({});
    expect(detectAutoplayAllowed()).toBe(true);
  });

  it("allows 4g, and the faster things that do not say 4g", () => {
    withReducedMotion(false);
    for (const effectiveType of ["4g", "5g", "wifi", "ethernet"]) {
      withConnection({ effectiveType });
      expect(detectAutoplayAllowed(), effectiveType).toBe(true);
    }
  });

  it("refuses on positive evidence of a slow link", () => {
    withReducedMotion(false);
    for (const effectiveType of ["slow-2g", "2g", "3g"]) {
      withConnection({ effectiveType });
      expect(detectAutoplayAllowed(), effectiveType).toBe(false);
    }
  });

  it("refuses on Data Saver, whatever the speed says", () => {
    // The one signal here that is a stated preference rather than a guess.
    withReducedMotion(false);
    withConnection({ effectiveType: "4g", saveData: true });
    expect(detectAutoplayAllowed()).toBe(false);
  });

  it("refuses when the traveller prefers reduced motion", () => {
    // And only AUTOplay. `feed-player.tsx` still draws a play control, because
    // asking for a video is not the same as being shown one unbidden.
    withReducedMotion(true);
    withConnection({ effectiveType: "4g" });
    expect(detectAutoplayAllowed()).toBe(false);
  });
});

/**
 * The chrome's retract rule, which is one line of `setActiveIndex` and the
 * whole of the feed's new behaviour.
 *
 * It is tested here rather than through the DOM because it is arithmetic on a
 * direction, and the alternative — synthesising an IntersectionObserver and
 * reading a `data-` attribute — proves the wiring rather than the rule. The
 * wiring has its own test in `feed-chrome.test.tsx`.
 */
describe("the feed's chrome", () => {
  const state = () => useFeedStore.getState();

  beforeEach(() => state().resetFeed());

  it("is out on the first reel, where a traveller arrives", () => {
    expect(state().activeIndex).toBe(0);
    expect(state().chromeRetracted).toBe(false);
  });

  it("retracts as soon as the traveller moves down a reel", () => {
    state().setActiveIndex(1);
    expect(state().chromeRetracted).toBe(true);
  });

  it("stays retracted for as long as they keep going down", () => {
    for (const i of [1, 2, 3, 7]) state().setActiveIndex(i);
    expect(state().activeIndex).toBe(7);
    expect(state().chromeRetracted).toBe(true);
  });

  it("comes back the moment they move UP one, not only at the top", () => {
    /*
      The rule that keeps navigation one swipe away from anywhere. "Visible on
      the first reel only" was the other candidate and would leave a traveller
      seven reels down with seven swipes between them and Search.
    */
    for (const i of [1, 2, 3, 7]) state().setActiveIndex(i);
    state().setActiveIndex(6);
    expect(state().chromeRetracted).toBe(false);
    expect(state().activeIndex).toBe(6);
  });

  it("is out again on the way back down from there", () => {
    state().setActiveIndex(4);
    state().setActiveIndex(3);
    state().setActiveIndex(4);
    expect(state().chromeRetracted).toBe(true);
  });

  it("is always out on the first reel, however it was reached", () => {
    // A jump to the top is still an upward move, so the general rule already
    // covers it — asserted anyway, because "the bar is there on reel one" is
    // the promise a traveller actually experiences.
    state().setActiveIndex(9);
    state().setActiveIndex(0);
    expect(state().chromeRetracted).toBe(false);
  });

  it("does not flicker when the observer re-reports the same card", () => {
    /*
      An IntersectionObserver can report the active card more than once — a
      resize, a re-observe after a page lands, a threshold recrossed by a
      rubber-band. A re-report is not a move, so it must not be read as a
      direction; treating it as one would make the bar blink mid-reel.
    */
    state().setActiveIndex(3);
    expect(state().chromeRetracted).toBe(true);
    state().setActiveIndex(3);
    expect(state().chromeRetracted).toBe(true);

    state().setActiveIndex(2);
    expect(state().chromeRetracted).toBe(false);
    state().setActiveIndex(2);
    expect(state().chromeRetracted).toBe(false);
  });

  it("hands the same object back for a re-report, so nothing re-renders", () => {
    // The guard above is also a performance property: zustand compares by
    // identity, and a fresh object would wake every subscriber — including the
    // shell's tab bar — on an observer callback that changed nothing.
    state().setActiveIndex(2);
    const before = useFeedStore.getState();
    state().setActiveIndex(2);
    expect(useFeedStore.getState()).toBe(before);
  });

  it("gives the chrome back on reset, wherever the feed had got to", () => {
    state().setActiveIndex(11);
    state().resetFeed();
    expect(state().activeIndex).toBe(0);
    expect(state().chromeRetracted).toBe(false);
  });

  it("leaves mute alone when it resets", () => {
    // A reset is about POSITION. Unmuting is a session-long decision a
    // traveller made once, and losing it on every route change would be a
    // feed that stops listening.
    state().toggleMuted();
    const muted = state().muted;
    state().resetFeed();
    expect(state().muted).toBe(muted);
  });
});
