import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act, cleanup, render } from "@testing-library/react";
import { useRef } from "react";
import { useHeightGlide } from "./use-height-glide";
import { DURATION, EASE } from ".";

/**
 * A box glides to the height its new contents need (the reel panel's
 * departures, 10 Oct 2026). jsdom lays nothing out, so each box states its
 * height (`data-h`), a running glide states the height it has reached
 * (`at`), and `animate` records what it was asked to play. The motion
 * itself, in real engines, is `e2e/support/sheet-motion.ts`.
 */

interface Played {
  keyframes: Keyframe[];
  options: KeyframeAnimationOptions;
  animation: { playState: AnimationPlayState; cancel: () => void };
}

let played: Played[] = [];
let reduced = false;
/** The height a running glide has the box at, as an engine would draw it. */
let at: number | null = null;
let resized: (() => void) | null = null;
const saved = {
  animate: Object.getOwnPropertyDescriptor(HTMLElement.prototype, "animate"),
};

beforeEach(() => {
  played = [];
  reduced = false;
  at = null;
  resized = null;
  Object.defineProperty(HTMLElement.prototype, "animate", {
    configurable: true,
    value(keyframes: Keyframe[], options: KeyframeAnimationOptions) {
      const animation = {
        playState: "running" as AnimationPlayState,
        cancel() {
          animation.playState = "idle";
        },
      };
      played.push({ keyframes, options, animation });
      return animation as unknown as Animation;
    },
  });
  Object.defineProperty(HTMLElement.prototype, "getBoundingClientRect", {
    configurable: true,
    value(this: HTMLElement) {
      const running = played.at(-1)?.animation.playState === "running";
      const height =
        running && at !== null ? at : Number(this.getAttribute("data-h") ?? 0);
      return { height, width: 390, top: 0, left: 0 } as DOMRect;
    },
  });
  vi.stubGlobal(
    "ResizeObserver",
    class {
      constructor(callback: () => void) {
        resized = callback;
      }
      observe() {}
      disconnect() {}
    },
  );
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
  vi.unstubAllGlobals();
  if (saved.animate)
    Object.defineProperty(HTMLElement.prototype, "animate", saved.animate);
  else delete (HTMLElement.prototype as { animate?: unknown }).animate;
  delete (HTMLElement.prototype as unknown as Record<string, unknown>)
    .getBoundingClientRect;
});

function Box({
  signature,
  height,
  enabled = true,
}: {
  signature: string;
  height: number;
  enabled?: boolean;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  useHeightGlide(ref, signature, enabled);
  return <div ref={ref} data-h={height} />;
}

describe("useHeightGlide", () => {
  it("draws the first contents where they are", () => {
    render(<Box signature="pending" height={147} />);
    expect(played).toHaveLength(0);
  });

  it("glides from the height it was drawn at to the new one, 200ms on move", () => {
    const { rerender } = render(<Box signature="pending" height={147} />);
    rerender(<Box signature="open:1" height={49} />);
    expect(played).toHaveLength(1);
    expect(played[0].keyframes).toEqual([
      { height: "147px", overflow: "hidden" },
      { height: "49px", overflow: "hidden" },
    ]);
    expect(played[0].options).toEqual({
      duration: DURATION.standard,
      easing: EASE.move,
    });
  });

  it("grows the same way, when a failed read is tried again", () => {
    const { rerender } = render(<Box signature="error" height={92} />);
    rerender(<Box signature="pending" height={147} />);
    expect(played[0].keyframes).toEqual([
      { height: "92px", overflow: "hidden" },
      { height: "147px", overflow: "hidden" },
    ]);
  });

  it("does nothing while the panel is shut", () => {
    const { rerender } = render(
      <Box signature="pending" height={147} enabled={false} />,
    );
    rerender(<Box signature="none" height={36} enabled={false} />);
    expect(played).toHaveLength(0);
  });

  it("does nothing under reduced motion: the new height is simply there", () => {
    reduced = true;
    const { rerender } = render(<Box signature="pending" height={147} />);
    rerender(<Box signature="open:2" height={98} />);
    expect(played).toHaveLength(0);
  });

  it("does nothing when the new contents are the same height", () => {
    const { rerender } = render(<Box signature="pending" height={147} />);
    rerender(<Box signature="open:3" height={147} />);
    expect(played).toHaveLength(0);
  });

  it("continues from where a running glide has the box", () => {
    const { rerender } = render(<Box signature="pending" height={147} />);
    rerender(<Box signature="open:1" height={49} />);
    at = 100;
    rerender(<Box signature="error" height={92} />);
    expect(played[0].animation.playState).toBe("idle");
    expect(played).toHaveLength(2);
    expect(played[1].keyframes).toEqual([
      { height: "100px", overflow: "hidden" },
      { height: "92px", overflow: "hidden" },
    ]);
  });

  it("remembers a size change that is not the contents', and glides from it next time", () => {
    const { rerender } = render(<Box signature="pending" height={147} />);
    // A font arriving: the same contents, drawn taller. Not a glide.
    rerender(<Box signature="pending" height={151} />);
    act(() => resized?.());
    expect(played).toHaveLength(0);
    rerender(<Box signature="open:1" height={50} />);
    expect(played[0].keyframes[0]).toEqual({
      height: "151px",
      overflow: "hidden",
    });
  });
});
