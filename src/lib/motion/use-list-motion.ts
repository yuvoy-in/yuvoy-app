import { useEffect, useLayoutEffect, useRef, type RefObject } from "react";
import { DURATION, prefersReducedMotion } from ".";
import {
  ARRIVE,
  containBlock,
  enter,
  itemsOf,
  keyOf,
  measure,
  observeSize,
  onScreen,
  play,
  STEP,
  STEPS,
  type Arrival,
  type Memory,
} from "./use-list-motion-parts";

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
