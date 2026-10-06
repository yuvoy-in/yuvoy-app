import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { FadeText } from "./fade-text";
import { DURATION, EASE } from "@/lib/motion";

/**
 * Words that change in place fade through (T09 A): the old out, then the
 * new in. jsdom has no Web Animations, so `animate` records what it was
 * asked to play.
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
});

describe("FadeText", () => {
  it("is simply there the first time", () => {
    const { container } = render(
      <FadeText>When would you like to go?</FadeText>,
    );
    expect(container.textContent).toBe("When would you like to go?");
    expect(played).toHaveLength(0);
  });

  it("draws a change nobody saw happen as simply as the first", () => {
    // Words that resolve as a screen opens (checkout's heading, once the
    // departure a link names lands with the dates) were not seen changing.
    const { container, rerender } = render(
      <FadeText block fade={false}>
        When would you like to go?
      </FadeText>,
    );
    rerender(
      <FadeText block fade={false}>
        Thu 15 Oct · 07:00
      </FadeText>,
    );
    expect(container.textContent).toBe("Thu 15 Oct · 07:00");
    expect(container.querySelector('[aria-hidden="true"]')).toBeNull();
    expect(played).toHaveLength(0);
    // A change seen happening after it still fades through.
    rerender(<FadeText block>Thu 15 Oct · 11:30</FadeText>);
    expect(played).toHaveLength(2);
  });

  it("fades the old words out, then the new ones in", () => {
    const { container, rerender } = render(
      <FadeText block>Thu 15 Oct · 07:00</FadeText>,
    );
    rerender(<FadeText block>Thu 15 Oct · 11:30</FadeText>);
    const copy = container.querySelector<HTMLElement>('[aria-hidden="true"]')!;
    expect(copy.textContent).toBe("Thu 15 Oct · 07:00");
    expect(copy.style.position).toBe("absolute");
    const out = played.find((p) => p.el === copy)!;
    expect(out.keyframes).toEqual([{ opacity: 1 }, { opacity: 0 }]);
    expect(out.options).toMatchObject({ duration: 100, easing: EASE.exit });
    const inn = played.find((p) => p.el !== copy)!;
    expect(inn.el.textContent).toBe("Thu 15 Oct · 11:30");
    // From nothing, at the start: a lone keyframe without its offset is where
    // the fade ENDS, which drew the new words, faded them out and drew them
    // again (`arriveFrom`).
    expect(inn.keyframes).toEqual([{ opacity: 0, offset: 0 }]);
    expect(inn.options).toMatchObject({
      duration: DURATION.quick,
      delay: 100,
      fill: "backwards",
    });
  });

  it("lets words changed part way through a fade leave from where they were", () => {
    // A day tapped, then the next: the heading's words used to leave whole.
    const { container, rerender } = render(<FadeText block>One</FadeText>);
    rerender(<FadeText block>Two</FadeText>);
    const words = () =>
      Array.from(container.querySelectorAll<HTMLElement>("span")).find(
        (s) => !s.closest('[aria-hidden="true"]') && s !== container.firstChild,
      )!;
    // Part of the way in, as an engine draws it.
    words().style.opacity = "0.4";
    played = [];
    rerender(<FadeText block>Three</FadeText>);
    const copy = Array.from(
      container.querySelectorAll<HTMLElement>('[aria-hidden="true"]'),
    ).find((c) => c.textContent === "Two")!;
    const out = played.find((p) => p.el === copy)!;
    expect(out.keyframes).toEqual([{ opacity: 0.4 }, { opacity: 0 }]);
  });

  it("carries a fade on from where it was under reduced motion", () => {
    reduced = true;
    const { container, rerender } = render(<FadeText>One</FadeText>);
    rerender(<FadeText>Two</FadeText>);
    expect(played[0].keyframes).toEqual([{ opacity: 0, offset: 0 }]);
    container.querySelector<HTMLElement>("span > span")!.style.opacity = "0.5";
    played = [];
    rerender(<FadeText>Three</FadeText>);
    // Not back to nothing: from where the last change's fade had got to.
    expect(played[0].keyframes).toEqual([{ opacity: 0.5, offset: 0 }]);
  });

  it("keeps the leaving words in the face they were drawn in", () => {
    // A heading that is a question in the display cut until a day is chosen,
    // then the day on the board: the question must not flash in the board.
    const { container, rerender } = render(
      <FadeText block wordsClassName="font-display">
        When would you like to go?
      </FadeText>,
    );
    rerender(
      <FadeText block wordsClassName="font-board tabular-nums">
        Thu 15 Oct · 07:00
      </FadeText>,
    );
    const copy = container.querySelector<HTMLElement>('[aria-hidden="true"]')!;
    expect(copy.textContent).toBe("When would you like to go?");
    expect(copy.className).toBe("font-display");
    const now = Array.from(container.querySelectorAll("span")).find(
      (s) => s.textContent === "Thu 15 Oct · 07:00" && s !== copy,
    )!;
    expect(now.className).toBe("block font-board tabular-nums");
  });

  it("leaves a screen reader only the current words", () => {
    const { container, rerender } = render(<FadeText>₹4,500</FadeText>);
    rerender(<FadeText>₹9,000</FadeText>);
    const visible = Array.from(container.querySelectorAll("span"))
      .filter((s) => !s.closest('[aria-hidden="true"]'))
      .map((s) =>
        s.childNodes[0]?.nodeType === Node.TEXT_NODE ? s.textContent : "",
      )
      .join("");
    expect(visible).toBe("₹9,000");
  });

  it("only fades the new words in under reduced motion (S01 A)", () => {
    reduced = true;
    const { container, rerender } = render(<FadeText>One</FadeText>);
    rerender(<FadeText>Two</FadeText>);
    expect(container.querySelector('[aria-hidden="true"]')).toBeNull();
    expect(played).toHaveLength(1);
    expect(played[0].keyframes).toEqual([{ opacity: 0, offset: 0 }]);
    expect(played[0].options).toMatchObject({
      duration: DURATION.reducedFade,
      easing: "linear",
    });
  });
});
