"use client";

import { useLayoutEffect, useRef } from "react";
import { RollingNumber } from "@/components/ui/rolling-number";
import { DURATION, EASE, prefersReducedMotion } from "@/lib/motion";

/**
 * The count on Filters. It rolls to its new figure (T14 A), and the badge
 * grows in when a first filter is applied on this screen. Hidden from
 * assistive technology: the button's own name carries the number.
 */
function FilterCount({ count, arrive }: { count: number; arrive: boolean }) {
  const ref = useRef<HTMLSpanElement | null>(null);
  // Read once: a badge drawn with the screen is simply there.
  const appears = useRef(arrive);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !appears.current || typeof el.animate !== "function") return;
    el.animate(
      prefersReducedMotion()
        ? [{ opacity: 0 }, { opacity: 1 }]
        : [
            { opacity: 0, transform: "scale(0.96)" },
            { opacity: 1, transform: "none" },
          ],
      prefersReducedMotion()
        ? { duration: DURATION.reducedFade, easing: "linear" }
        : { duration: DURATION.quick, easing: EASE.interaction },
    );
  }, []);
  return (
    <span
      ref={ref}
      aria-hidden="true"
      className="bg-forest text-paper ml-1.5 inline-flex size-5 items-center justify-center overflow-hidden rounded-full text-xs font-bold"
    >
      <RollingNumber value={count} />
    </span>
  );
}

export { FilterCount };
