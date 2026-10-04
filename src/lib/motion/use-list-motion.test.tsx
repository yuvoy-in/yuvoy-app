import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { act, cleanup, render } from "@testing-library/react";
import { useRef } from "react";
import { useListMotion } from "./use-list-motion";
import { DURATION, EASE } from ".";

/**
 * A list that changes in place, seen changing (T14 A, T11 A). jsdom lays
 * nothing out, so each item states its own box (`data-box="x y w h"`) and the
 * list's frame is a phone-sized viewport; `animate` records what it was asked
 * to play. What this proves is which journey each item is given: the motion
 * itself, in real engines, is `e2e/support/search-motion.ts`.
 */

interface Played {
  el: Element;
  keyframes: Keyframe[];
  options: KeyframeAnimationOptions;
  finish: () => Promise<void>;
}

let played: Played[] = [];
let reduced = false;
const saved = {
  animate: Object.getOwnPropertyDescriptor(HTMLElement.prototype, "animate"),
};

function box(el: HTMLElement, i: number): number {
  const v = el.getAttribute("data-box")?.split(" ").map(Number);
  return v ? v[i] : 0;
}

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
      let resolve!: () => void;
      const finished = new Promise<void>((r) => (resolve = r));
      played.push({
        el: this,
        keyframes,
        options,
        finish: async () => {
          resolve();
          await act(async () => {
            await finished;
          });
        },
      });
      return { finished, cancel: () => {} } as unknown as Animation;
    },
  });
  for (const [name, i] of [
    ["offsetLeft", 0],
    ["offsetTop", 1],
    ["offsetWidth", 2],
    ["offsetHeight", 3],
  ] as const) {
    Object.defineProperty(HTMLElement.prototype, name, {
      configurable: true,
      get(this: HTMLElement) {
        return box(this, i);
      },
    });
  }
  Object.defineProperty(HTMLElement.prototype, "getBoundingClientRect", {
    configurable: true,
    value(this: HTMLElement) {
      const frame = this.hasAttribute("data-frame");
      return {
        top: 0,
        left: 0,
        width: frame ? 390 : 0,
        height: frame ? 2000 : 0,
        right: frame ? 390 : 0,
        bottom: frame ? 2000 : 0,
        x: 0,
        y: 0,
        toJSON() {},
      } as DOMRect;
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
  if (saved.animate)
    Object.defineProperty(HTMLElement.prototype, "animate", saved.animate);
  else delete (HTMLElement.prototype as { animate?: unknown }).animate;
  for (const name of [
    "offsetLeft",
    "offsetTop",
    "offsetWidth",
    "offsetHeight",
    "getBoundingClientRect",
  ])
    delete (HTMLElement.prototype as unknown as Record<string, unknown>)[name];
});

interface Item {
  key: string;
  /** Its box once laid out: x, y, width, height. */
  at: [number, number, number, number];
}

function List({
  items,
  arrive = "rise",
  stagger = false,
  arriveOnMount = false,
}: {
  items: Item[];
  arrive?: "grow" | "rise" | "fade";
  stagger?: boolean;
  arriveOnMount?: boolean;
}) {
  const ref = useRef<HTMLUListElement | null>(null);
  useListMotion(ref, items.map((i) => i.key).join("|"), {
    arrive,
    stagger,
    arriveOnMount,
  });
  return (
    <ul ref={ref} data-frame="" data-testid="list">
      {items.map((item) => (
        <li
          key={item.key}
          data-motion-key={item.key}
          data-box={item.at.join(" ")}
          id={`item-${item.key}`}
        >
          {item.key}
        </li>
      ))}
    </ul>
  );
}

const row = (key: string, y: number): Item => ({ key, at: [0, y, 390, 100] });
const on = (key: string) =>
  played.filter((p) => (p.el as HTMLElement).dataset.motionKey === key);

describe("useListMotion", () => {
  it("draws the first list where it is, moving nothing", () => {
    render(<List items={[row("a", 0), row("b", 100)]} />);
    expect(played).toHaveLength(0);
  });

  it("brings a list arriving as a list in 40ms apart, at most four steps", () => {
    const keys = ["a", "b", "c", "d", "e", "f"];
    render(
      <List
        items={keys.map((k, i) => row(k, i * 100))}
        stagger
        arriveOnMount
      />,
    );
    expect(played.map((p) => p.options.delay)).toEqual([
      0, 40, 80, 120, 160, 160,
    ]);
    expect(played[0].keyframes[0]).toEqual({
      opacity: 0,
      transform: "translateY(8px)",
    });
    expect(played[0].options).toMatchObject({
      duration: DURATION.quick,
      easing: EASE.interaction,
    });
  });

  it("fades what left where it was, as a hidden, inert copy, then removes it", async () => {
    const { rerender, getByTestId } = render(
      <List items={[row("a", 0), row("b", 100)]} />,
    );
    rerender(<List items={[row("b", 100)]} />);
    const copy = getByTestId("list").querySelector<HTMLElement>(
      "li:not([data-motion-key])",
    )!;
    expect(copy).not.toBeNull();
    expect(copy).toHaveAttribute("aria-hidden", "true");
    expect(copy).toHaveAttribute("inert");
    expect(copy.id).toBe("");
    expect(copy.style.position).toBe("absolute");
    expect(copy.style.top).toBe("0px");
    const fade = played.find((p) => p.el === copy)!;
    expect(fade.keyframes).toEqual([{ opacity: 1 }, { opacity: 0 }]);
    expect(fade.options.duration).toBe(100);
    await fade.finish();
    expect(copy.isConnected).toBe(false);
  });

  it("slides what stayed from where it was, one step after what left", () => {
    const { rerender } = render(
      <List items={[row("a", 0), row("b", 100), row("c", 200)]} />,
    );
    rerender(<List items={[row("b", 0), row("c", 100)]} />);
    const [b] = on("b");
    expect(b.keyframes).toEqual([
      { transform: "translate(0px, 100px)" },
      { transform: "none" },
    ]);
    expect(b.options).toMatchObject({
      duration: DURATION.standard,
      delay: 40,
      easing: EASE.move,
    });
    expect(on("c")).toHaveLength(1);
  });

  it("lands what arrived once the room is made, growing in for `grow`", () => {
    const { rerender } = render(<List items={[row("b", 0)]} arrive="grow" />);
    rerender(<List items={[row("a", 0), row("b", 100)]} arrive="grow" />);
    const [a] = on("a");
    expect(a.keyframes[0]).toEqual({ opacity: 0, transform: "scale(0.96)" });
    // b slid to make the room, so a waits one step for it.
    expect(a.options.delay).toBe(40);
    expect(on("b")[0].options.delay).toBe(0);
  });

  it("moves nothing that is off screen", () => {
    const { rerender } = render(
      <List items={[row("a", 0), row("far", 5000)]} />,
    );
    rerender(<List items={[row("far", 4900)]} />);
    expect(on("far")).toHaveLength(0);
  });

  it("only fades, under reduced motion (S01 A)", () => {
    reduced = true;
    const { rerender } = render(<List items={[row("a", 0), row("b", 100)]} />);
    rerender(<List items={[row("b", 0), row("c", 100)]} />);
    expect(on("b")).toHaveLength(0);
    const [c] = on("c");
    // One keyframe: it fades up to whatever the item rests at.
    expect(c.keyframes).toEqual([{ opacity: 0 }]);
    expect(c.options).toMatchObject({
      duration: DURATION.reducedFade,
      easing: "linear",
    });
  });

  it("leaves an item that arrives by itself to arrive by itself", () => {
    function Selfish({ show }: { show: boolean }) {
      const ref = useRef<HTMLDivElement | null>(null);
      useListMotion(ref, String(show), { arrive: "fade" });
      return (
        <div ref={ref} data-frame="">
          {show ? (
            <div
              data-motion-key="x"
              data-motion-arrive="self"
              data-box="0 0 10 10"
            />
          ) : null}
        </div>
      );
    }
    const { rerender } = render(<Selfish show={false} />);
    rerender(<Selfish show />);
    expect(played).toHaveLength(0);
  });

  it("still sees changes to a list its screen draws a render late", () => {
    /*
      Trips draws its list only once the sign-in has been read: the list's
      element appears on a later render with the same signature, and the
      first change after that must still be seen (it used to be missed).
    */
    function Late({ ready, items }: { ready: boolean; items: Item[] }) {
      const ref = useRef<HTMLUListElement | null>(null);
      useListMotion(ref, items.map((i) => i.key).join("|"), {
        arrive: "fade",
      });
      if (!ready) return <p>Loading</p>;
      return (
        <ul ref={ref} data-frame="">
          {items.map((item) => (
            <li
              key={item.key}
              data-motion-key={item.key}
              data-box={item.at.join(" ")}
            >
              {item.key}
            </li>
          ))}
        </ul>
      );
    }
    const first = [row("a", 0), row("b", 100)];
    const { rerender } = render(<Late ready={false} items={first} />);
    rerender(<Late ready items={first} />);
    expect(played).toHaveLength(0);
    rerender(<Late ready items={[row("b", 0)]} />);
    expect(on("b")).toHaveLength(1);
  });
});
