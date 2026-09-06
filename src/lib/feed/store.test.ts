import { afterEach, describe, expect, it, vi } from "vitest";
import { detectAutoplayAllowed } from "./store";

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
