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
 * A list that is one thing replaced by another (a tab's contents) can fade
 * THROUGH rather than across (`through`): what arrives waits until what left
 * has gone (100ms out, then 150ms in), so two lists are never seen at once.
 *
 * `signature` changes whenever the list does (its keys, in order, and any
 * label that changes an item's size); the hook runs on each change only. An
 * item that animates its own arrival marks itself `data-motion-arrive="self"`
 * and is only moved here, never faded in twice.
 *
 * Positions are read as offsets inside `ref`, which is made the containing
 * block, so a list that scrolls, or a page that scrolled between two
 * changes, reads the same.
 *
 * Items are named by `data-motion-key`. A page of sections that come and go
 * (`byNode`) is named by its elements instead: React keeps the node of a
 * section that stays, so every element child of `ref` is an item, and
 * `signature` is then anything that changes when the page does.
 *
 * Something that goes from INSIDE an item that stays (a field's reason, T16
 * A) marks itself `data-motion-leave`: it is not an item and is never moved,
 * but when it goes it fades where it was, like an item, and what follows
 * waits the same step for it.
 */
export function useListMotion(
  ref: RefObject<HTMLElement | null>,
  signature: unknown,
  {
    arrive,
    stagger = false,
    arriveOnMount = false,
    through = false,
    arriveMs = DURATION.quick,
    leave = true,
    byNode = false,
  }: {
    arrive: Arrival;
    stagger?: boolean;
    /** Animate the first items in, rather than drawing them in place. */
    arriveOnMount?: boolean;
    /** What arrives waits for what left to have gone. */
    through?: boolean;
    /** How long an arrival takes; 150ms unless the list's own job says. */
    arriveMs?: number;
    /** Whether what leaves fades where it was, or is simply gone. */
    leave?: boolean;
    /** Every element child is an item, named by its node, not by a key. */
    byNode?: boolean;
  },
): void {
  const memory = useRef<Memory | null>(null);
  /** The element and the signature the last reading was taken for. */
  const seen = useRef<{ root: HTMLElement | null; signature: unknown }>({
    root: null,
    signature: undefined,
  });
  /** Whether any element has been read yet: only the first may arrive. */
  const rooted = useRef(false);
  const watcher = useRef<ResizeObserver | null>(null);

  /*
    After every render, acting only on a change: the list changed
    (`signature`), or its element did. The second happens when a screen draws
    the list a render after it mounts (behind a sign-in still being read, say)
    or draws a new one; a new element is a first drawing, simply there, and
    only the very first may arrive (`arriveOnMount`).
  */
  useLayoutEffect(() => {
    const root = ref.current;
    const last = seen.current;
    if (root === last.root && Object.is(signature, last.signature)) return;
    seen.current = { root, signature };
    if (root !== last.root) {
      /*
        A list re-laid out without changing (a rotation, a wider window)
        would leave the remembered places stale, and the next change would
        slide items from where they used to be; so whichever element is the
        list is watched, and re-read when it resizes.
      */
      watcher.current?.disconnect();
      watcher.current = root
        ? observeSize(root, () => {
            if (memory.current && ref.current === root)
              memory.current = measure(root, itemsOf(root, byNode));
          })
        : null;
    }
    if (!root) {
      memory.current = null;
      return;
    }
    containBlock(root);
    const items = itemsOf(root, byNode);
    const now = measure(root, items);
    const before = root === last.root ? memory.current : null;
    memory.current = now;
    const reduced = prefersReducedMotion();
    if (!before) {
      const first = !rooted.current;
      rooted.current = true;
      if (!first || !arriveOnMount) return;
      let i = 0;
      for (const el of items) {
        if (
          el.getAttribute(ARRIVE) === "self" ||
          !onScreen(root, now.boxes.get(keyOf(el))!)
        )
          continue;
        enter(el, arrive, stagger ? Math.min(i++, STEPS) * STEP : 0, {
          reduced,
          ms: arriveMs,
        });
      }
      return;
    }
    play(root, before, now, items, {
      arrive,
      stagger,
      through,
      reduced,
      arriveMs,
      leave,
    });
  });

  useEffect(
    () => () => {
      watcher.current?.disconnect();
      watcher.current = null;
    },
    [],
  );
}

/* ---------------------------------------------------------------- inside */

function observeSize(el: HTMLElement, onResize: () => void) {
  if (typeof ResizeObserver === "undefined") return null;
  const observer = new ResizeObserver(onResize);
  observer.observe(el);
  return observer;
}

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
  /** What may go from inside an item: where it was, and which item held it. */
  nested: Map<HTMLElement, { box: Box; item: string }>;
}

const KEY = "data-motion-key";
const ARRIVE = "data-motion-arrive";
/** A departed item's fading copy: never an item itself. */
const GHOST = "data-motion-ghost";
/** Inside an item, something that fades where it was when it goes. */
const LEAVE = "data-motion-leave";
/** The system's stagger step, and its cap. */
const STEP = 40;
const STEPS = 4;
/** What leaves goes quickly. */
const LEAVE_MS = 100;

/** The slides each element is running, so a new change continues from them. */
const slides = new WeakMap<HTMLElement, Animation>();

/** The names given to elements that carry no key, held off the DOM. */
const names = new WeakMap<Element, string>();
let named = 0;

/** An item's name: its key, or for a page of sections its node's own. */
function keyOf(el: Element): string {
  const key = el.getAttribute(KEY);
  if (key !== null) return key;
  let name = names.get(el);
  if (!name) {
    name = `node-${(named += 1)}`;
    names.set(el, name);
  }
  return name;
}

function itemsOf(root: HTMLElement, byNode: boolean): HTMLElement[] {
  return Array.from(root.children).filter(
    (el): el is HTMLElement =>
      el instanceof HTMLElement &&
      !el.hasAttribute(GHOST) &&
      (byNode || el.hasAttribute(KEY)),
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

function measure(root: HTMLElement, items: HTMLElement[]): Memory {
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
  const nested = new Map<HTMLElement, { box: Box; item: string }>();
  const listed = new Set(items);
  for (const el of root.querySelectorAll<HTMLElement>(`[${LEAVE}]`)) {
    const item = itemOf(root, el);
    if (!item || item === el || !listed.has(item)) continue;
    const at = offsetIn(root, el);
    if (!at) continue;
    nested.set(el, {
      box: { ...at, w: el.offsetWidth, h: el.offsetHeight },
      item: keyOf(item),
    });
  }
  return { boxes, nodes, nested };
}

/** The item (a child of `root`) that an element is drawn inside. */
function itemOf(root: HTMLElement, el: HTMLElement): HTMLElement | null {
  let node: HTMLElement | null = el;
  while (node && node.parentElement !== root) node = node.parentElement;
  return node;
}

/**
 * Where an element inside `root` is drawn, as an offset from it: offsets
 * rather than a bounding box, so a transform still playing on it (its own
 * entrance, a slide) is not read as where it is. `null` when its offset
 * chain does not lead back to `root` (a fixed layer, or not drawn at all).
 */
function offsetIn(
  root: HTMLElement,
  el: HTMLElement,
): { x: number; y: number } | null {
  let x = 0;
  let y = 0;
  let node = el;
  for (;;) {
    x += node.offsetLeft;
    y += node.offsetTop;
    const parent = node.offsetParent;
    if (parent === root) return { x, y };
    if (!(parent instanceof HTMLElement) || !root.contains(parent)) return null;
    x += parent.clientLeft;
    y += parent.clientTop;
    node = parent;
  }
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
    through,
    reduced,
    arriveMs,
    leave,
  }: {
    arrive: Arrival;
    stagger: boolean;
    through: boolean;
    reduced: boolean;
    arriveMs: number;
    leave: boolean;
  },
) {
  const animates = typeof root.animate === "function";

  // What left: a copy fades where it was drawn.
  let left = 0;
  for (const [key, box] of before.boxes) {
    if (now.boxes.has(key)) continue;
    left += 1;
    const node = before.nodes.get(key);
    if (leave && node && animates && onScreen(root, box))
      fadeCopy(root, node, box, reduced);
  }
  /*
    What left from inside an item that stayed, the same way. Inside an item
    that left as a whole, the item's own copy already carries it.
  */
  for (const [node, { box, item }] of before.nested) {
    if (root.contains(node) || !now.boxes.has(item)) continue;
    left += 1;
    if (leave && animates && onScreen(root, box))
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
    const room = through && left && !reduced ? LEAVE_MS : moved ? STEP : 0;
    const wait = room + (stagger ? Math.min(i++, STEPS) * STEP : 0);
    enter(el, arrive, wait, { reduced, ms: arriveMs });
  }
}

/*
  From nothing to where the item rests: ONE keyframe, so the end is the
  item's own values, whatever they are. A departure that is full rests at 40%
  opacity, and an arrival written to 1 would land bright and then drop.
*/
function enter(
  el: HTMLElement,
  arrive: Arrival,
  delay: number,
  { reduced, ms }: { reduced: boolean; ms: number },
) {
  if (typeof el.animate !== "function") return;
  if (reduced) {
    el.animate([{ opacity: 0 }], {
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
  el.animate([from], {
    duration: ms,
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
  copy.setAttribute(GHOST, "");
  for (const el of [copy, ...copy.querySelectorAll<HTMLElement>("[id]")])
    el.removeAttribute("id");
  // A clip in a copy would start loading again for a tenth of a second.
  for (const video of copy.querySelectorAll("video")) video.remove();
  /*
    Its last drawing, held still: an entrance its classes carry (a reason
    rising in, a section fading up) would otherwise play again in the copy,
    against the copy's own fade. And it says nothing: a live region put back
    into the page can be read out again, hidden or not.
  */
  for (const el of [copy, ...copy.querySelectorAll<HTMLElement>("*")]) {
    el.style.animation = "none";
    if (/^(alert|status|log)$/.test(el.getAttribute("role") ?? ""))
      el.removeAttribute("role");
    el.removeAttribute("aria-live");
  }
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
