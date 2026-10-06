import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { RollingNumber } from "./rolling-number";
import { DURATION, EASE } from "@/lib/motion";

/**
 * A count rolls to its new figure (the motion system §7). jsdom has no Web
 * Animations, so `animate` records what it was asked to play.
 */

interface Played {
  el: Element;
  keyframes: Keyframe[];
  options: KeyframeAnimationOptions;
}

let played: Played[] = [];
let reduced = false;
const saved = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "animate");

beforeEach(() => {
  played = [];
  reduced = false;
  Object.defineProperty(HTMLElement.prototype, "animate", {
    configurable: true,
    value(
      this: Element,
      keyframes: Keyframe[],
      options: KeyframeAnimationOptions,
    ) {
      played.push({ el: this, keyframes, options });
      return {
        finished: new Promise(() => {}),
        cancel: () => {},
        playState: "running",
      } as unknown as Animation;
    },
  });
  Object.defineProperty(HTMLElement.prototype, "offsetHeight", {
    configurable: true,
    get: () => 20,
  });
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: (query: string) => ({
      matches: query === "(prefers-reduced-motion: reduce)" && reduced,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    }),
  });
});

afterEach(() => {
  cleanup();
  if (saved) Object.defineProperty(HTMLElement.prototype, "animate", saved);
  else delete (HTMLElement.prototype as { animate?: unknown }).animate;
  delete (HTMLElement.prototype as { offsetHeight?: unknown }).offsetHeight;
});

function badge(value: number) {
  return (
    <span data-testid="badge">
      <RollingNumber value={value} />
    </span>
  );
}

describe("RollingNumber", () => {
  it("is simply there the first time", () => {
    const { getByTestId } = render(badge(2));
    expect(getByTestId("badge").textContent).toBe("2");
    expect(played).toHaveLength(0);
  });

  it("rolls up when the number rises: the old figure leaves above as the new arrives from below", () => {
    const { getByTestId, rerender } = render(badge(2));
    rerender(badge(3));
    const spans = getByTestId("badge").querySelectorAll("span");
    const copy = spans[1];
    expect(copy.textContent).toBe("2");
    expect(copy).toHaveAttribute("aria-hidden", "true");
    const leaving = played.find((p) => p.el === copy)!;
    const arriving = played.find((p) => p.el === spans[0])!;
    expect(leaving.keyframes.at(-1)).toMatchObject({
      transform: "translateY(-12px)",
      opacity: 0,
    });
    expect(leaving.options).toMatchObject({ duration: 140, easing: EASE.exit });
    expect(arriving.keyframes[0]).toMatchObject({
      transform: "translateY(12px)",
      opacity: 0,
    });
    expect(arriving.options).toMatchObject({
      duration: DURATION.standard,
      easing: EASE.interaction,
    });
    // A screen reader reads the number it is now, once.
    expect(spans[0].textContent).toBe("3");
  });

  it("leaves from where the figure was drawn when it changes mid-roll", () => {
    // A party of three, then four, inside 200ms: the three used to jump back
    // to its place, whole, and leave from there.
    const { getByTestId, rerender } = render(badge(2));
    rerender(badge(3));
    const figure = getByTestId("badge").querySelector("span")!;
    figure.style.transform = "translateY(5px)";
    figure.style.opacity = "0.4";
    played = [];
    rerender(badge(4));
    const copy = Array.from(getByTestId("badge").querySelectorAll("span")).find(
      (s) => s.textContent === "3" && s.getAttribute("aria-hidden") === "true",
    )!;
    const leaving = played.find((p) => p.el === copy)!;
    expect(leaving.keyframes[0]).toEqual({
      transform: "translateY(5px)",
      opacity: 0.4,
    });
  });

  it("rolls down when it falls", () => {
    const { getByTestId, rerender } = render(badge(3));
    rerender(badge(1));
    const arriving = played.find(
      (p) => p.el === getByTestId("badge").querySelector("span"),
    )!;
    expect(arriving.keyframes[0]).toMatchObject({
      transform: "translateY(-12px)",
    });
  });

  it("only fades the new figure in under reduced motion (S01 A)", () => {
    reduced = true;
    const { getByTestId, rerender } = render(badge(1));
    rerender(badge(2));
    expect(getByTestId("badge").querySelectorAll("span")).toHaveLength(1);
    expect(played).toHaveLength(1);
    expect(played[0].keyframes).toEqual([{ opacity: 0 }, { opacity: 1 }]);
    expect(played[0].options).toMatchObject({
      duration: DURATION.reducedFade,
      easing: "linear",
    });
  });
});
