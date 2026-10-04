import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { useState } from "react";
import { Sheet, SheetPresence } from "./sheet";
import { DURATION, EASE } from "@/lib/motion";

/**
 * The sheet leaves the way it came (T06 A, approved 4 Oct 2026), and the
 * dialog closes only once it has: its owner stays mounted through the exit.
 *
 * jsdom has no Web Animations, so `animate` is a stand-in that records what
 * it was asked to play and finishes when the test says. What it proves is
 * the wiring: which journey each way out asks for, that nothing unmounts or
 * closes before the exit has run, and that every way back is honoured. The
 * motion itself, in real engines, is `e2e/support/sheet-motion.ts`.
 */

interface Played {
  keyframes: Keyframe[];
  options: KeyframeAnimationOptions;
  finish: () => Promise<void>;
  cancelled: boolean;
}

let played: Played[] = [];
const original = Object.getOwnPropertyDescriptor(
  HTMLElement.prototype,
  "animate",
);

function media(matches: (query: string) => boolean) {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: (query: string) => ({
      matches: matches(query),
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  });
}

beforeEach(() => {
  played = [];
  Object.defineProperty(HTMLElement.prototype, "animate", {
    configurable: true,
    value(keyframes: Keyframe[], options: KeyframeAnimationOptions) {
      let resolve!: () => void;
      let reject!: (e: unknown) => void;
      const finished = new Promise<void>((res, rej) => {
        resolve = res;
        reject = rej;
      });
      const entry: Played = {
        keyframes,
        options,
        cancelled: false,
        finish: async () => {
          resolve();
          await act(async () => {
            await finished;
          });
        },
      };
      played.push(entry);
      return {
        finished,
        cancel: () => {
          entry.cancelled = true;
          reject(new DOMException("cancelled", "AbortError"));
        },
      } as unknown as Animation;
    },
  });
  // A phone, no preference: the edge sheet.
  media(() => false);
  // jsdom has no layout; the sheet is 400px tall.
  Object.defineProperty(HTMLElement.prototype, "offsetHeight", {
    configurable: true,
    get: () => 400,
  });
});

afterEach(() => {
  cleanup();
  if (original)
    Object.defineProperty(HTMLElement.prototype, "animate", original);
  else delete (HTMLElement.prototype as { animate?: unknown }).animate;
  delete (HTMLElement.prototype as { offsetHeight?: unknown }).offsetHeight;
  media(() => false);
});

/** The owner as every caller writes it: mounted only while open. */
function Owner({
  initiallyOpen = true,
  onClose,
}: {
  initiallyOpen?: boolean;
  onClose?: () => void;
}) {
  const [open, setOpen] = useState(initiallyOpen);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Open
      </button>
      <SheetPresence open={open}>
        <Body
          onClose={() => {
            onClose?.();
            setOpen(false);
          }}
        />
      </SheetPresence>
    </>
  );
}

function Body({ onClose }: { onClose: () => void }) {
  // State that must survive the exit, and be fresh on the next opening.
  const [draft] = useState(() => Math.random().toString(36).slice(2));
  return (
    <Sheet open onClose={onClose} title="Filters">
      <p data-testid="draft">{draft}</p>
    </Sheet>
  );
}

const dialog = () => document.querySelector("dialog")!;
const head = () => dialog().querySelector<HTMLElement>(".sheet-head")!;

let clock = 1000;
function pointer(
  el: Element,
  type: string,
  clientY: number,
  { at = (clock += 16), id = 1 } = {},
) {
  const event = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    clientY,
    button: 0,
  });
  Object.defineProperties(event, {
    pointerId: { value: id },
    isPrimary: { value: true },
    pointerType: { value: "touch" },
    timeStamp: { value: at },
  });
  act(() => {
    el.dispatchEvent(event);
  });
}

/** A drag on the head, `steps` moves `msPerStep` apart. */
function pull(dy: number, { steps = 10, msPerStep = 40 } = {}) {
  const el = head();
  let at = (clock += 100);
  pointer(el, "pointerdown", 100, { at });
  for (let i = 1; i <= steps; i++) {
    pointer(el, "pointermove", 100 + (dy * i) / steps, {
      at: (at += msPerStep),
    });
  }
  pointer(el, "pointerup", 100 + dy, { at: (at += msPerStep) });
}

describe("the sheet leaves the way it came (T06 A)", () => {
  it("stays mounted, and open, until its exit has run", async () => {
    render(<Owner />);
    expect(dialog()).toHaveAttribute("open");

    act(() => screen.getByRole("button", { name: "Close" }).click());

    // Still there: the presence holds it while it goes down.
    expect(dialog()).toHaveAttribute("open");
    expect(dialog()).toHaveAttribute("data-sheet", "leaving");
    const exit = played.at(-1)!;
    expect(exit.keyframes).toEqual([
      { transform: "translateY(0px)" },
      { transform: "translateY(400px)" },
    ]);
    expect(exit.options).toMatchObject({
      duration: DURATION.sheetExit,
      easing: EASE.exit,
    });

    await exit.finish();
    expect(document.querySelector("dialog")).toBeNull();
  });

  it("is opened afresh after it has gone", async () => {
    render(<Owner />);
    const first = screen.getByTestId("draft").textContent;
    act(() => screen.getByRole("button", { name: "Close" }).click());
    await played.at(-1)!.finish();

    act(() => screen.getByRole("button", { name: "Open" }).click());
    expect(dialog()).toHaveAttribute("open");
    expect(dialog()).not.toHaveAttribute("data-sheet");
    expect(screen.getByTestId("draft").textContent).not.toBe(first);
  });

  it("turns round when it is asked back while leaving, state and all", async () => {
    render(<Owner />);
    const draft = screen.getByTestId("draft").textContent;
    act(() => screen.getByRole("button", { name: "Close" }).click());
    const exit = played.at(-1)!;

    act(() =>
      screen.getByRole("button", { name: "Open", hidden: true }).click(),
    );
    expect(exit.cancelled).toBe(true);
    expect(dialog()).toHaveAttribute("open");
    expect(dialog()).toHaveAttribute("data-sheet", "settling");
    expect(played.at(-1)!.options).toMatchObject({
      duration: DURATION.sheet,
      easing: EASE.interaction,
    });
    expect(screen.getByTestId("draft").textContent).toBe(draft);

    // The exit it abandoned can no longer close it.
    await exit.finish().catch(() => {});
    expect(dialog()).toHaveAttribute("open");
  });

  it("holds Escape and hands it to the caller like the X", async () => {
    const onClose = vi.fn();
    render(<Owner onClose={onClose} />);
    const cancel = new Event("cancel", { cancelable: true });
    act(() => {
      dialog().dispatchEvent(cancel);
    });
    expect(cancel.defaultPrevented).toBe(true);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(dialog()).toHaveAttribute("data-sheet", "leaving");
    await played.at(-1)!.finish();
    expect(document.querySelector("dialog")).toBeNull();
  });

  it("lets go when the browser closes it on its own", () => {
    const onClose = vi.fn();
    render(<Owner onClose={onClose} />);
    // A second Escape the browser would not let anybody hold.
    act(() => {
      dialog().removeAttribute("open");
      dialog().dispatchEvent(new Event("close"));
    });
    expect(onClose).toHaveBeenCalledTimes(1);
    // Nothing left to animate: it is gone at once.
    expect(document.querySelector("dialog")).toBeNull();
    expect(played).toHaveLength(0);
  });

  it("closes on a tap on the backdrop, and not on one inside it", () => {
    const onClose = vi.fn();
    render(<Owner onClose={onClose} />);
    act(() => screen.getByTestId("draft").click());
    expect(onClose).not.toHaveBeenCalled();
    act(() => dialog().click());
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe("the head can be pulled down (T06 A)", () => {
  it("follows the finger, and past a quarter of its height it goes on the finger's curve", async () => {
    const onClose = vi.fn();
    render(<Owner onClose={onClose} />);
    pull(150);
    expect(onClose).toHaveBeenCalledTimes(1);
    const exit = played.at(-1)!;
    // Taken where it was once the press became a drag: 150px less the slop.
    expect(exit.keyframes[0]).toEqual({ transform: "translateY(135px)" });
    expect(exit.options.easing).toBe(EASE.move);
    // 265 of 400px left: that share of 200ms.
    expect(exit.options.duration).toBe(133);
    await exit.finish();
    expect(document.querySelector("dialog")).toBeNull();
  });

  it("settles back from a short, slow pull, and stays open", () => {
    const onClose = vi.fn();
    render(<Owner onClose={onClose} />);
    pull(60, { steps: 6, msPerStep: 200 });
    expect(onClose).not.toHaveBeenCalled();
    expect(dialog()).toHaveAttribute("data-sheet", "settling");
    const back = played.at(-1)!;
    expect(back.keyframes).toEqual([
      { transform: "translateY(50px)" },
      { transform: "translateY(0)" },
    ]);
    expect(back.options).toMatchObject({
      duration: DURATION.standard,
      easing: EASE.move,
    });
    expect(dialog().style.transform).toBe("");
  });

  it("goes on a flick, however short", () => {
    const onClose = vi.fn();
    render(<Owner onClose={onClose} />);
    pull(40, { steps: 4, msPerStep: 10 });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("does not take the tap a drag ends in", () => {
    const onClose = vi.fn();
    render(<Owner onClose={onClose} />);
    const close = screen.getByRole("button", { name: "Close" });
    let at = (clock += 100);
    pointer(close, "pointerdown", 100, { at });
    pointer(close, "pointermove", 130, { at: (at += 200) });
    pointer(close, "pointerup", 130, { at: (at += 200) });
    act(() => close.click());
    expect(onClose).not.toHaveBeenCalled();
    // The next press is a press again.
    pointer(close, "pointerdown", 100);
    pointer(close, "pointerup", 100);
    act(() => close.click());
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe("where it is not an edge sheet", () => {
  it("fades as it drops 12px, as a panel from sm up, and cannot be pulled", async () => {
    media((q) => q === "(min-width: 40rem)");
    const onClose = vi.fn();
    render(<Owner onClose={onClose} />);
    pull(200);
    expect(onClose).not.toHaveBeenCalled();
    expect(played).toHaveLength(0);

    act(() => screen.getByRole("button", { name: "Close" }).click());
    const exit = played.at(-1)!;
    expect(exit.keyframes).toEqual([
      { opacity: 1, transform: "translateY(0px)" },
      { opacity: 0, transform: "translateY(12px)" },
    ]);
    expect(exit.options).toMatchObject({
      duration: DURATION.sheetExit,
      easing: EASE.exit,
    });
    await exit.finish();
    expect(document.querySelector("dialog")).toBeNull();
  });

  it("only fades under reduced motion (S01 A)", async () => {
    media((q) => q === "(prefers-reduced-motion: reduce)");
    render(<Owner />);
    act(() => screen.getByRole("button", { name: "Close" }).click());
    const exit = played.at(-1)!;
    expect(exit.keyframes).toEqual([{ opacity: 1 }, { opacity: 0 }]);
    expect(exit.options).toMatchObject({
      duration: DURATION.reducedFade,
      easing: "linear",
    });
    await exit.finish();
    expect(document.querySelector("dialog")).toBeNull();
  });

  it("closes at once where there is nothing to animate with", () => {
    delete (HTMLElement.prototype as { animate?: unknown }).animate;
    render(<Owner />);
    act(() => screen.getByRole("button", { name: "Close" }).click());
    expect(document.querySelector("dialog")).toBeNull();
  });
});
