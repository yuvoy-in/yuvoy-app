import { useSyncExternalStore } from "react";

/**
 * The motion system in script (approved 4 Oct 2026; the study and its
 * decisions are in yuvoy/motion-lab, the rules in docs/DESIGN_SYSTEM.md §3).
 *
 * CSS carries most motion. These are the values a Web Animations call needs,
 * which cannot read `var()`: the curves mirror the `--ease-*` tokens in
 * globals.css and `motion.test.ts` fails the moment the two disagree.
 */
export const EASE = {
  /** Arriving, answering a touch. Production's own curve. */
  interaction: "cubic-bezier(0.32, 0.72, 0, 1)",
  /** A screen or picture travelling; lands softly. */
  cinematic: "cubic-bezier(0.22, 1, 0.36, 1)",
  /** A to B with both ends on screen. */
  move: "cubic-bezier(0.2, 0, 0, 1)",
  /** Leaving: accelerates away. */
  exit: "cubic-bezier(0.3, 0, 0.8, 0.15)",
} as const;

/** Durations by job, in ms. Exits are about two thirds of entrances. */
export const DURATION = {
  press: 100,
  quick: 150,
  standard: 200,
  sheet: 250,
  sheetExit: 200,
  spatial: 350,
  spatialExit: 250,
  moment: 450,
  /** The reduced-motion stand-in for any travel: a short crossfade. */
  reducedFade: 120,
} as const;

const QUERY = "(prefers-reduced-motion: reduce)";

/**
 * Whether the person has asked for less motion, read at the moment of use.
 * False wherever there is no `matchMedia` (the server, jsdom): the callers
 * all fall back to the instant path's sibling, never to something that moves
 * more.
 */
export function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" &&
    typeof window.matchMedia === "function"
    ? window.matchMedia(QUERY).matches
    : false;
}

function subscribe(onChange: () => void): () => void {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function")
    return () => {};
  const list = window.matchMedia(QUERY);
  list.addEventListener("change", onChange);
  return () => list.removeEventListener("change", onChange);
}

/**
 * The same preference as a render value that follows a live change in the
 * system setting. The server snapshot is `false`, so the first client render
 * matches the server's HTML; nothing visible may branch on it before
 * hydration (see `useHasMounted`).
 */
export function useReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, prefersReducedMotion, () => false);
}

/**
 * Cancels the script-started animations an element is running (CSS
 * transitions and keyframes are left to the stylesheet). Read where the
 * element IS before calling this: a motion that starts from that reading
 * continues from the frame the old one reached, so every motion here is
 * interruptible. `getAnimations` is missing in jsdom and older engines.
 */
export function stopAnimations(el: Element): void {
  if (typeof el.getAnimations !== "function") return;
  for (const animation of el.getAnimations()) {
    const fromCss =
      (typeof CSSTransition !== "undefined" &&
        animation instanceof CSSTransition) ||
      (typeof CSSAnimation !== "undefined" &&
        animation instanceof CSSAnimation);
    if (!fromCss) animation.cancel();
  }
}
