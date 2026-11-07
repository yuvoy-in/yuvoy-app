import { DURATION, EASE, arriveFrom, opacityOf } from ".";

/**
 * The measuring, sliding and fading that useListMotion runs. Moved out of
 * use-list-motion.ts so each file stays under 500 lines (yuvoy-app#243).
 */

export function observeSize(el: HTMLElement, onResize: () => void) {
  if (typeof ResizeObserver === "undefined") return null;
  const observer = new ResizeObserver(onResize);
  observer.observe(el);
  return observer;
}

export type Arrival = "grow" | "rise" | "fade";

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Memory {
  boxes: Map<string, Box>;
  /** Each item's element as last drawn, so a departure can be copied. */
  nodes: Map<string, HTMLElement>;
  /** What may go from inside an item: where it was, and which item held it. */
  nested: Map<HTMLElement, { box: Box; item: string }>;
}

const KEY = "data-motion-key";
export const ARRIVE = "data-motion-arrive";
/** A departed item's fading copy: never an item itself. */
const GHOST = "data-motion-ghost";
/** Inside an item, something that fades where it was when it goes. */
const LEAVE = "data-motion-leave";
/** The system's stagger step, and its cap. */
export const STEP = 40;
export const STEPS = 4;
/** What leaves goes quickly. */
const LEAVE_MS = 100;

/** The slides each element is running, so a new change continues from them. */
const slides = new WeakMap<HTMLElement, Animation>();

/** The names given to elements that carry no key, held off the DOM. */
const names = new WeakMap<Element, string>();
let named = 0;

/** An item's name: its key, or for a page of sections its node's own. */
export function keyOf(el: Element): string {
  const key = el.getAttribute(KEY);
  if (key !== null) return key;
  let name = names.get(el);
  if (!name) {
    name = `node-${(named += 1)}`;
    names.set(el, name);
  }
  return name;
}

export function itemsOf(root: HTMLElement, byNode: boolean): HTMLElement[] {
  return Array.from(root.children).filter(
    (el): el is HTMLElement =>
      el instanceof HTMLElement &&
      !el.hasAttribute(GHOST) &&
      (byNode || el.hasAttribute(KEY)),
  );
}

/** Offsets are read against `root`, which needs to be their containing block. */
export function containBlock(root: HTMLElement) {
  if (
    typeof getComputedStyle === "function" &&
    getComputedStyle(root).position === "static"
  )
    root.style.position = "relative";
}

export function measure(root: HTMLElement, items: HTMLElement[]): Memory {
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
export function onScreen(root: HTMLElement, box: Box): boolean {
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

export function play(
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

/**
 * The arrivals still playing, so something that goes before it has fully
 * arrived fades from where it had got to (`fadeCopy`). Kept here because by
 * then React has removed the element, and a removed element's animations are
 * listed on it in WebKit but not in Chromium; the animation itself can still
 * be read in both.
 */
const arrivals = new WeakMap<
  Element,
  { animation: Animation; from: number; rest: number }
>();

/*
  From nothing to where the item rests (`arriveFrom`): the end is the item's
  own values, whatever they are. A departure that is full rests at 40%
  opacity, and an arrival written to 1 would land bright and then drop.
*/
export function enter(
  el: HTMLElement,
  arrive: Arrival,
  delay: number,
  { reduced, ms }: { reduced: boolean; ms: number },
) {
  if (typeof el.animate !== "function") return;
  // Where it will rest, read before the arrival draws over it.
  const rest = opacityOf(el);
  const from: Keyframe = reduced
    ? { opacity: 0 }
    : arrive === "grow"
      ? { opacity: 0, transform: "scale(0.96)" }
      : arrive === "rise"
        ? { opacity: 0, transform: "translateY(8px)" }
        : { opacity: 0 };
  const animation = el.animate(
    arriveFrom(from),
    reduced
      ? { duration: DURATION.reducedFade, easing: "linear", fill: "backwards" }
      : { duration: ms, delay, easing: EASE.interaction, fill: "backwards" },
  );
  arrivals.set(el, { animation, from: Number(from.opacity ?? 0), rest });
  animation.finished.then(
    () => {
      if (arrivals.get(el)?.animation === animation) arrivals.delete(el);
    },
    () => {},
  );
}

/**
 * How opaque an arrival still playing has its element drawn, or `null` for
 * one that has landed or never arrived here. The effect's progress is the
 * eased one, which is the opacity a 0-to-rest arrival is drawn at (measured
 * equal in Chromium 151 and WebKit 26.5, 7 Oct 2026).
 */
function arrivalOpacity(el: Element): number | null {
  const arrival = arrivals.get(el);
  const progress = arrival?.animation.effect?.getComputedTiming().progress;
  if (!arrival || progress === null || progress === undefined) return null;
  return arrival.from + (arrival.rest - arrival.from) * progress;
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
  /*
    Where it had got to. A copy carries none of the original's animations, so
    an item that goes while it, or something in it, is still arriving was
    copied whole and flashed brighter than it had been drawn: two taps on the
    Trips tabs inside a quarter of a second drew the first tab whole for a
    frame as it went. `cloneNode` makes the same tree, element for element in
    the same order, so the two are read side by side, before anything is
    taken out of the copy.
  */
  const drawn = [node, ...node.querySelectorAll("*")].map(arrivalOpacity);
  [copy, ...copy.querySelectorAll<HTMLElement | SVGElement>("*")].forEach(
    (part, i) => {
      const at = drawn[i];
      if (i > 0 && at !== null && at !== undefined)
        part.style.opacity = String(at);
    },
  );
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
  /*
    And it fades from there: from where its arrival had got to, or else from
    its own opacity, read off the copy, which carries its classes. It used to
    fade from 1, so a departure drawn dimmed flashed whole as it went.
  */
  const from = drawn[0] ?? opacityOf(copy);
  copy
    .animate([{ opacity: from }, { opacity: 0 }], {
      duration: reduced ? DURATION.reducedFade : LEAVE_MS,
      easing: reduced ? "linear" : EASE.interaction,
      fill: "forwards",
    })
    .finished.then(
      () => copy.remove(),
      () => copy.remove(),
    );
}
