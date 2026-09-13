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
 * The active index, and the retract rule that used to ride on it.
 *
 * `setActiveIndex` also set `chromeRetracted` from the DIRECTION of the move:
 * down went immersive, up brought the app back. The owner ruled against it on
 * 13 September (yuvoy-app#36) — "the tab bar must stay visible on every reel"
 * — and the flag is gone rather than pinned to false.
 *
 * What survives is the part that was never about the chrome: the same index
 * reported twice is not a move, and must not wake a subscriber.
 */
describe("the reel strip's active card", () => {
  const state = () => useFeedStore.getState();

  beforeEach(() => state().resetFeed());

  it("starts on the first reel, where a traveller arrives", () => {
    expect(state().activeIndex).toBe(0);
  });

  it("follows the card the observer reports, up or down", () => {
    for (const i of [1, 2, 3, 7]) state().setActiveIndex(i);
    expect(state().activeIndex).toBe(7);
    state().setActiveIndex(6);
    expect(state().activeIndex).toBe(6);
  });

  it("hands the same object back for a re-report, so nothing re-renders", () => {
    /*
      An IntersectionObserver can report the active card more than once — a
      resize, a re-observe after a page lands, a threshold recrossed by a
      rubber-band. zustand compares by identity, so a fresh object would wake
      every subscriber on a callback that changed nothing.

      This mattered more when the tab bar read this store and would blink; the
      bar no longer does, and the guard stays because a snap scroller re-renders
      on every card either way.
    */
    state().setActiveIndex(2);
    const before = useFeedStore.getState();
    state().setActiveIndex(2);
    expect(useFeedStore.getState()).toBe(before);
  });

  it("goes back to the first card on reset, wherever the strip had got to", () => {
    /*
      A strip that unmounts leaves this behind — the store is a module, not a
      context. A traveller nine reels into the feed who opens a business page
      with four reels would arrive at index 9: out of range, nothing mounted by
      the preload budget, and a black well until they scroll.
    */
    state().setActiveIndex(11);
    state().resetFeed();
    expect(state().activeIndex).toBe(0);
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
