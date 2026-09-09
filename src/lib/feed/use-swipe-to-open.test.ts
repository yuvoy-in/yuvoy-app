import { describe, expect, it } from "vitest";
import { swipeTravel, swipeOpens } from "./use-swipe-to-open";

/**
 * The gesture's arithmetic, on its own.
 *
 * The wiring — which pointers are ours, which axis wins, what gets suppressed
 * — is exercised through real pointer events in `feed-swipe.test.tsx`. These
 * two functions are where the FEEL lives, and a curve is far easier to prove
 * from its numbers than from a synthesised stream of moves.
 */

describe("how far the card follows the finger", () => {
  it("is exactly attached for the whole of the deciding part", () => {
    // Below the commit point the card IS the finger. Damping here is what
    // makes a drag feel like it is being resisted by the app rather than by
    // physics, and the deciding travel is the worst place to spend that.
    for (const d of [0, 1, 12, 40, 71, 72]) {
      expect(swipeTravel(d)).toBeCloseTo(d, 5);
    }
  });

  it("never moves the card the wrong way", () => {
    // A finger that has crossed back past where it started is on its way to a
    // spring-back, not asking for a rightward card.
    expect(swipeTravel(-1)).toBe(0);
    expect(swipeTravel(-500)).toBe(0);
  });

  it("damps past the commit point without a step at the join", () => {
    /*
      The two halves meet with the same slope by construction. A rubber band
      that changes gradient at the moment it starts resisting reads as a
      dropped frame, which is the opposite of the point.
    */
    const at = swipeTravel(72);
    const just = swipeTravel(72.5);
    expect(just - at).toBeGreaterThan(0.45);
    expect(just - at).toBeLessThanOrEqual(0.5);
  });

  it("has a ceiling, so a long drag cannot tear the card off the feed", () => {
    expect(swipeTravel(200)).toBeLessThan(96);
    // The curve approaches 96 and, far enough out, floating point lands ON it.
    // The property is a ceiling, not an open bound.
    expect(swipeTravel(2000)).toBeLessThanOrEqual(96);
    // …and it gets close enough that the resistance is felt, not infinite.
    expect(swipeTravel(300)).toBeGreaterThan(90);
  });

  it("only ever moves further out for a finger that moved further out", () => {
    let last = -1;
    for (let d = 0; d <= 400; d += 7) {
      const t = swipeTravel(d);
      expect(t).toBeGreaterThanOrEqual(last);
      last = t;
    }
  });
});

describe("what opens the experience", () => {
  it("opens on a deliberate drag past the commit point", () => {
    expect(swipeOpens(72, 0)).toBe(true);
    expect(swipeOpens(140, 0)).toBe(true);
  });

  it("refuses a drag that stopped short, however long it was held", () => {
    expect(swipeOpens(71, 0)).toBe(false);
    expect(swipeOpens(20, 0)).toBe(false);
  });

  it("opens on a flick that never travelled far", () => {
    // How a feed is actually used: a short, fast throw of the thumb. Requiring
    // 72px of it would make the gesture feel like it needs to be earned.
    expect(swipeOpens(45, -0.9)).toBe(true);
  });

  it("refuses a flick that is only a twitch", () => {
    // Fast but barely moved is a tap with a shaky hand, not a swipe.
    expect(swipeOpens(20, -3)).toBe(false);
  });

  it("refuses a fast move in the wrong direction", () => {
    // Velocity is signed. A positive one is a finger heading right, and a
    // rightward flick must never open anything.
    expect(swipeOpens(45, 2)).toBe(false);
  });

  it("refuses a slow crawl short of the commit point", () => {
    expect(swipeOpens(50, -0.1)).toBe(false);
  });
});
