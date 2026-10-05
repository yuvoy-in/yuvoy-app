import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  abandonLanding,
  armPeek,
  beginPeek,
  disarmPeek,
  finishLanding,
  getPeek,
  registerPeek,
  setPeekContentReady,
} from "./listing-peek";

/**
 * The listing that comes in under the thumb (T02 C, approved 4 Oct 2026):
 * past a quarter of the width, or a flick, completes and THEN navigates;
 * anything less springs back and nothing happened. The geometry is proved
 * here; the real gesture, in both engines, in `e2e/motion.spec.ts`.
 */

const WIDTH = 400;
let phone = true;
let reduced = false;
let release: () => void = () => {};

/** Web Animations, which jsdom lacks: each one finishes on the next tick. */
function stubAnimate() {
  Object.defineProperty(Element.prototype, "animate", {
    configurable: true,
    value: () => ({ finished: Promise.resolve(), cancel() {} }),
  });
}

function setUp() {
  document.body.innerHTML = `
    <div data-reel-screen=""><article id="card"></article></div>
    <nav data-tabbar=""></nav>
    <div id="dim"></div>
    <div id="sheet"></div>`;
  const sheet = document.getElementById("sheet")!;
  const dim = document.getElementById("dim")!;
  release = registerPeek({ sheet, dim });
  setPeekContentReady(true);
  return {
    sheet,
    dim,
    card: document.getElementById("card")!,
    feed: document.querySelector<HTMLElement>("[data-reel-screen]")!,
    bar: document.querySelector<HTMLElement>("nav[data-tabbar]")!,
  };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

beforeEach(() => {
  phone = true;
  reduced = false;
  Object.defineProperty(window, "innerWidth", {
    configurable: true,
    value: WIDTH,
  });
  vi.spyOn(window, "matchMedia").mockImplementation(
    (query: string) =>
      ({
        matches: query.includes("reduce") ? reduced : phone,
        media: query,
        addEventListener: () => {},
        removeEventListener: () => {},
      }) as unknown as MediaQueryList,
  );
  stubAnimate();
});

afterEach(() => {
  abandonLanding();
  disarmPeek();
  release();
  setPeekContentReady(false);
  vi.restoreAllMocks();
});

describe("arming", () => {
  it("builds the preview for a watched reel on a phone", () => {
    armPeek("try-dive", "/e/try-dive");
    expect(getPeek()).toMatchObject({ slug: "try-dive", phase: "armed" });
  });

  it("builds nothing under reduced motion, or from lg up", () => {
    reduced = true;
    armPeek("try-dive", "/e/try-dive");
    expect(getPeek().phase).toBe("idle");
    reduced = false;
    phone = false;
    armPeek("try-dive", "/e/try-dive");
    expect(getPeek().phase).toBe("idle");
  });
});

describe("the gesture", () => {
  it("is refused for a listing the preview was not built for, or not ready", () => {
    const { card } = setUp();
    armPeek("try-dive", "/e/try-dive");
    expect(beginPeek("snorkel", card)).toBeNull();
    setPeekContentReady(false);
    expect(beginPeek("try-dive", card)).toBeNull();
  });

  it("follows the finger one to one, the reel a third as far, under a dim", () => {
    const { card, sheet, feed, bar, dim } = setUp();
    armPeek("try-dive", "/e/try-dive");
    const session = beginPeek("try-dive", card)!;
    expect(getPeek()).toMatchObject({ phase: "dragging", shown: true });

    session.drag(100);
    expect(sheet.style.transform).toBe("translate3d(300.00px, 0, 0)");
    expect(feed.style.transform).toBe("translate3d(-30.00px, 0, 0)");
    expect(bar.style.transform).toBe("translate3d(-30.00px, 0, 0)");
    expect(Number(dim.style.opacity)).toBeCloseTo(0.0625);

    // Never past the edge it came from, never beyond the screen.
    session.drag(-50);
    expect(sheet.style.transform).toBe("translate3d(400.00px, 0, 0)");
    session.drag(900);
    expect(sheet.style.transform).toBe("translate3d(0.00px, 0, 0)");
  });

  it("springs back below a quarter of the width, and goes nowhere", async () => {
    const { card, sheet, feed } = setUp();
    armPeek("try-dive", "/e/try-dive");
    const session = beginPeek("try-dive", card)!;
    session.drag(90);
    const navigate = vi.fn();
    session.release(90, -0.1, navigate);
    await settle();
    expect(navigate).not.toHaveBeenCalled();
    expect(getPeek().phase).toBe("armed");
    expect(sheet.style.visibility).toBe("hidden");
    expect(feed.style.transform).toBe("");
  });

  it("completes past a quarter, then navigates, holding taps meanwhile", async () => {
    const { card, sheet, dim } = setUp();
    armPeek("try-dive", "/e/try-dive");
    const session = beginPeek("try-dive", card)!;
    session.drag(120);
    const navigate = vi.fn();
    session.release(120, -0.1, navigate);
    expect(getPeek().phase).toBe("opening");
    expect(dim.style.pointerEvents).toBe("auto");
    expect(navigate).not.toHaveBeenCalled();
    await settle();
    expect(sheet.style.transform).toBe("translate3d(0px, 0, 0)");
    expect(navigate).toHaveBeenCalledTimes(1);
    expect(getPeek().phase).toBe("landing");
  });

  it("completes on a flick that has barely travelled", async () => {
    const { card } = setUp();
    armPeek("try-dive", "/e/try-dive");
    const session = beginPeek("try-dive", card)!;
    session.drag(50);
    const navigate = vi.fn();
    session.release(50, -0.8, navigate);
    await settle();
    expect(navigate).toHaveBeenCalledTimes(1);
  });

  it("springs back when the browser takes the gesture away", async () => {
    const { card } = setUp();
    armPeek("try-dive", "/e/try-dive");
    const session = beginPeek("try-dive", card)!;
    session.drag(200);
    session.cancel();
    await settle();
    expect(getPeek().phase).toBe("armed");
  });
});

describe("the landing", () => {
  async function landed() {
    const parts = setUp();
    armPeek("try-dive", "/e/try-dive");
    const session = beginPeek("try-dive", parts.card)!;
    session.drag(300);
    session.release(300, 0, () => {});
    await settle();
    return parts;
  }

  it("goes once the page is under it, and lifts the dim first", async () => {
    const { sheet, dim } = await landed();
    const done = finishLanding();
    expect(dim.style.opacity).toBe("0");
    expect(dim.style.pointerEvents).toBe("");
    await done;
    expect(getPeek().phase).toBe("idle");
    expect(sheet.style.visibility).toBe("hidden");
  });

  it("gives the reel back if the route never comes", async () => {
    const { feed } = await landed();
    abandonLanding();
    expect(getPeek().phase).toBe("idle");
    expect(feed.style.transform).toBe("");
  });
});
