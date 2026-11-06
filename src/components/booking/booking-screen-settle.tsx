"use client";

import { DURATION, EASE, arriveFrom, prefersReducedMotion } from "@/lib/motion";

/*
  The confirmed tick and the arrival moment of the booking page, moved word
  for word out of booking-screen.tsx.
*/

/** The tick a confirmed booking's eyebrow carries in place of its square. */
export function TickMark() {
  return (
    <svg viewBox="0 0 12 12" aria-hidden="true" className="eyebrow-tick-mark">
      <path data-arrival-tick="" d="M2.25 6.5 5 9.25 9.75 3" pathLength={1} />
    </svg>
  );
}

/** The moment, played once on the page the booking tap lands on (T10 A). */
export function settle(root: HTMLElement) {
  if (typeof root.animate !== "function") return;
  // The first panel in reading order: what to bring, else the booking itself.
  const panel = root.querySelector<HTMLElement>("[data-arrival-panel]");
  const reference = root.querySelector<HTMLElement>("[data-arrival-reference]");
  const tick = root.querySelector<SVGPathElement>("[data-arrival-tick]");
  if (prefersReducedMotion()) {
    for (const el of [panel, reference])
      el?.animate(arriveFrom({ opacity: 0 }), {
        duration: DURATION.reducedFade,
        easing: "linear",
      });
    return;
  }
  panel?.animate(arriveFrom({ opacity: 0, transform: "translateY(12px)" }), {
    duration: DURATION.sheet,
    easing: EASE.interaction,
  });
  tick?.animate([{ strokeDashoffset: 1 }, { strokeDashoffset: 0 }], {
    duration: DURATION.sheet,
    delay: 100,
    easing: EASE.interaction,
    fill: "backwards",
  });
  reference?.animate(arriveFrom({ opacity: 0 }), {
    duration: DURATION.quick,
    delay: 200,
    easing: EASE.interaction,
    fill: "backwards",
  });
}
