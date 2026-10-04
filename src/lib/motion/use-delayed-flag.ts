import { useEffect, useRef, useState } from "react";

/** How long a wait must last before it is shown (the motion system, §8). */
export const SHOW_DELAY_MS = 300;

/** How long a wait, once shown, stays shown. */
export const SHOW_MINIMUM_MS = 300;

/**
 * Whether a wait should be SHOWN, which is not the same as whether there is
 * one (T11 A, approved 4 Oct 2026).
 *
 * Under 300ms a loading state is a flash, not information: the answer is
 * back before anybody could read the placeholder, and the screen has changed
 * shape twice for nothing. So nothing is shown until the wait has lasted
 * `delay`; and once something is shown it stays at least `minimum`, so an
 * answer landing a moment after the placeholder appeared does not blink it
 * away again.
 *
 * Every change happens in a timer, never in the effect itself: the flag is
 * a reading of elapsed time, and an effect setting state on its own run is
 * a cascading render.
 */
export function useDelayedFlag(
  active: boolean,
  {
    delay = SHOW_DELAY_MS,
    minimum = SHOW_MINIMUM_MS,
  }: { delay?: number; minimum?: number } = {},
): boolean {
  const [shown, setShown] = useState(false);
  const shownAt = useRef(0);

  useEffect(() => {
    if (active && !shown) {
      const timer = window.setTimeout(() => {
        shownAt.current = performance.now();
        setShown(true);
      }, delay);
      return () => window.clearTimeout(timer);
    }
    if (!active && shown) {
      const left = minimum - (performance.now() - shownAt.current);
      const timer = window.setTimeout(() => setShown(false), Math.max(0, left));
      return () => window.clearTimeout(timer);
    }
  }, [active, shown, delay, minimum]);

  return shown;
}
