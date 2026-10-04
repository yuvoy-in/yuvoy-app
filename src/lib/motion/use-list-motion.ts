import { useEffect, useLayoutEffect, useRef, type RefObject } from "react";
import { DURATION, EASE, prefersReducedMotion } from ".";

/**
 * A list that changes in place, seen changing (T14 A and T11 A, approved
 * 4 Oct 2026; the motion system §7).
 *
 * The list is the direct children of `ref` that carry `data-motion-key`, and
 * one render to the next it does three things, each where the eye already is:
 *
 * - **What stays slides** from where it was drawn to its new place (FLIP:
 *   the difference is measured once and played as a transform, 200ms on
 *   `move`), one 40ms step after anything that left, so the room it moves
 *   into has been made.
 * - **What arrives** fades in where it lands (150ms), growing from 0.96
 *   (`grow`), rising 8px (`rise`) or only fading (`fade`); a list arriving as
 *   a list (`stagger`) does so 40ms apart, at most four steps.
 * - **What leaves** fades where it was (100ms) and is gone. React has already
 *   removed it, so what fades is a copy of its last drawing, out of the
 *   flow, hidden from assistive technology and inert.
 *
 * Only what is on screen moves: an item sliding between two places nobody
 * can see costs a layer and says nothing. Under reduced motion nothing
 * slides, grows or rises; arrivals and departures are a 120ms fade (S01 A).
 *
 * `signature` changes whenever the list does (its keys, in order, and any
 * label that changes an item's size); the hook runs on each change only. An
 * item that animates its own arrival marks itself `data-motion-arrive="self"`
 * and is only moved here, never faded in twice.
 *
 * Positions are read as offsets inside `ref`, which is made the containing
 * block, so a list that scrolls, or a page that scrolled between two
 * changes, reads the same.
 */
export function useListMotion(
  ref: RefObject<HTMLElement | null>,
  signature: string,
  {
    arrive,
    stagger = false,
    arriveOnMount = false,
  }: {
    arrive: Arrival;
    stagger?: boolean;
    /** Animate the first items in, rather than drawing them in place. */
    arriveOnMount?: boolean;
  },
): void {
  const memory = useRef<Memory | null>(null);
  // Read once: whether the very first drawing arrives or is simply there.
  const onMount = useRef(arriveOnMount);

  useLayoutEffect(() => {
    const root = ref.current;
    if (!root) return;
    containBlock(root);
    const items = keyedChildren(root);
    const now = measure(items);
    const before = memory.current;
    memory.current = now;
    const reduced = prefersReducedMotion();
    if (!before) {
      if (!onMount.current) return;
      let i = 0;
      for (const el of items) {
        if (
          el.getAttribute(ARRIVE) === "self" ||
          !onScreen(root, now.boxes.get(keyOf(el))!)
        )
          continue;
        enter(el, arrive, stagger ? Math.min(i++, STEPS) * STEP : 0, reduced);
      }
      return;
    }
    play(root, before, now, items, { arrive, stagger, reduced });
  }, [ref, signature, arrive, stagger]);

  /*
    A list re-laid out without changing (a rotation, a wider window) would
    leave the remembered places stale, and the next change would slide items
    from where they used to be.
  */
  useEffect(() => {
    const root = ref.current;
    if (!root || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      if (memory.current) memory.current = measure(keyedChildren(root));
    });
    observer.observe(root);
    return () => observer.disconnect();
  }, [ref]);
}

/* ---------------------------------------------------------------- inside */

type Arrival = "grow" | "rise" | "fade";

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface Memory {
  boxes: Map<string, Box>;
  /** Each item's element as last drawn, so a departure can be copied. */
  nodes: Map<string, HTMLElement>;
}

const KEY = "data-motion-key";
const ARRIVE = "data-motion-arrive";
/** The system's stagger step, and its cap. */
const STEP = 40;
const STEPS = 4;
/** What leaves goes quickly. */
const LEAVE_MS = 100;

/** The slides each element is running, so a new change continues from them. */
const slides = new WeakMap<HTMLElement, Animation>();

function keyOf(el: Element): string {
  return el.getAttribute(KEY) ?? "";
}

function keyedChildren(root: HTMLElement): HTMLElement[] {
  return Array.from(root.children).filter(
    (el): el is HTMLElement =>
      el instanceof HTMLElement && el.hasAttribute(KEY),
  );
}

/** Offsets are read against `root`, which needs to be their containing block. */
function containBlock(root: HTMLElement) {
  if (
    typeof getComputedStyle === "function" &&
    getComputedStyle(root).position === "static"
  )
    root.style.position = "relative";
}

function measure(items: HTMLElement[]): Memory {
  const boxes = new Map<string, Box>();
  const nodes = new Map<string, HTMLElement>();
  for (const el of items) {
    boxes.set(keyOf(el), {
      x: el.offsetLeft,
      y: el.offsetTop,
      w: el.offsetWidth,
      h: el.offsetHeight,
    });
    nodes.set(keyOf(el), el);
  }
  return { boxes, nodes };
}

/** Whether a box inside `root` is anywhere in the viewport. */
function onScreen(root: HTMLElement, box: Box): boolean {
  if (typeof window === "undefined") return false;
  const r = root.getBoundingClientRect();
  // jsdom: no layout at all; nothing is on a screen that is not there.
  if (r.width === 0 && r.height === 0) return false;
  const top = r.top + box.y - root.scrollTop;
  const left = r.left + box.x - root.scrollLeft;
  return (
    top < window.innerHeight &&
    top + box.h > 0 &&
    left < window.innerWidth &&
    left + box.w > 0
  );
}

/** How far a running slide currently has the element from its place. */
function slidOffset(el: HTMLElement): { x: number; y: number } {
  const t = getComputedStyle(el).transform;
  const m = t && t !== "none" ? /^matrix\(([^)]+)\)$/.exec(t) : null;
  if (!m) return { x: 0, y: 0 };
  const v = m[1].split(",").map(Number);
  return { x: v[4] || 0, y: v[5] || 0 };
}

function play(
  root: HTMLElement,
  before: Memory,
  now: Memory,
  items: HTMLElement[],
  {
    arrive,
    stagger,
    reduced,
  }: { arrive: Arrival; stagger: boolean; reduced: boolean },
) {
  const animates = typeof root.animate === "function";

  // What left: a copy fades where it was drawn.
  let left = 0;
  for (const [key, box] of before.boxes) {
    if (now.boxes.has(key)) continue;
    left += 1;
    const node = before.nodes.get(key);
    if (node && animates && onScreen(root, box))
      fadeCopy(root, node, box, reduced);
  }

  // What stayed: slides from where it was drawn.
  let moved = false;
  for (const el of items) {
    const key = keyOf(el);
    const was = before.boxes.get(key);
    const is = now.boxes.get(key)!;
    if (!was) continue;
    let dx = was.x - is.x;
    let dy = was.y - is.y;
    const running = slides.get(el);
    if (running) {
      const offset = slidOffset(el);
      dx += offset.x;
      dy += offset.y;
      running.cancel();
      slides.delete(el);
    }
    if (reduced || !animates) continue;
    if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) continue;
    if (!onScreen(root, is) && !onScreen(root, was)) continue;
    moved = true;
    const slide = el.animate(
      [{ transform: `translate(${dx}px, ${dy}px)` }, { transform: "none" }],
      {
        duration: DURATION.standard,
        delay: left ? STEP : 0,
        easing: EASE.move,
        fill: "backwards",
      },
    );
    slides.set(el, slide);
    slide.finished.then(
      () => {
        if (slides.get(el) === slide) slides.delete(el);
      },
      () => {},
    );
  }

  // What arrived: where it lands, once the room is made.
  let i = 0;
  for (const el of items) {
    const key = keyOf(el);
    if (before.boxes.has(key) || el.getAttribute(ARRIVE) === "self") continue;
    if (!animates || !onScreen(root, now.boxes.get(key)!)) continue;
    const wait =
      (moved ? STEP : 0) + (stagger ? Math.min(i++, STEPS) * STEP : 0);
    enter(el, arrive, wait, reduced);
  }
}

function enter(
  el: HTMLElement,
  arrive: Arrival,
  delay: number,
  reduced: boolean,
) {
  if (typeof el.animate !== "function") return;
  if (reduced) {
    el.animate([{ opacity: 0 }, { opacity: 1 }], {
      duration: DURATION.reducedFade,
      easing: "linear",
      fill: "backwards",
    });
    return;
  }
  const from: Keyframe =
    arrive === "grow"
      ? { opacity: 0, transform: "scale(0.96)" }
      : arrive === "rise"
        ? { opacity: 0, transform: "translateY(8px)" }
        : { opacity: 0 };
  el.animate([from, { opacity: 1, transform: "none" }], {
    duration: DURATION.quick,
    delay,
    easing: EASE.interaction,
    fill: "backwards",
  });
}

/**
 * A departed item's last drawing, held where it was for its fade. A copy,
 * never the node React removed: React owns that one, and a node put back
 * into a list it manages is a node it may later move or remove again.
 */
function fadeCopy(
  root: HTMLElement,
  node: HTMLElement,
  box: Box,
  reduced: boolean,
) {
  const copy = node.cloneNode(true) as HTMLElement;
  copy.removeAttribute(KEY);
  for (const el of [copy, ...copy.querySelectorAll<HTMLElement>("[id]")])
    el.removeAttribute("id");
  // A clip in a copy would start loading again for a tenth of a second.
  for (const video of copy.querySelectorAll("video")) video.remove();
  copy.setAttribute("aria-hidden", "true");
  copy.setAttribute("inert", "");
  copy.style.position = "absolute";
  copy.style.left = `${box.x}px`;
  copy.style.top = `${box.y}px`;
  copy.style.width = `${box.w}px`;
  copy.style.height = `${box.h}px`;
  copy.style.margin = "0";
  copy.style.pointerEvents = "none";
  root.appendChild(copy);
  copy
    .animate([{ opacity: 1 }, { opacity: 0 }], {
      duration: reduced ? DURATION.reducedFade : LEAVE_MS,
      easing: reduced ? "linear" : EASE.interaction,
      fill: "forwards",
    })
    .finished.then(
      () => copy.remove(),
      () => copy.remove(),
    );
}
