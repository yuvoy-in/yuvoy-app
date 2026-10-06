"use client";

import { useLayoutEffect, useRef } from "react";
import { cn } from "@/lib/cn";
import {
  DURATION,
  EASE,
  opacityOf,
  prefersReducedMotion,
  stopAnimations,
  translateYOf,
} from "@/lib/motion";

/**
 * A figure that changes, seen changing (the motion system §7: counts roll in
 * the traveller app; approved 4 Oct 2026 with T14 A and T09 A).
 *
 * The old figure leaves as the new one arrives: upward when the number goes
 * up, downward when it falls, so the direction says which way it went. The
 * new figure takes 200ms; the old one is gone in 140ms, accelerating away.
 * Under reduced motion the new figure only fades in (120ms).
 *
 * The first drawing never rolls: a figure is simply there until it changes.
 * The copy that leaves is hidden from assistive technology, so a screen
 * reader only ever reads the current number, and a caller whose control
 * already names the number keeps the whole figure `aria-hidden`.
 *
 * Put it in a box that clips (`overflow-hidden`) when the figure should
 * roll inside a shape, as the Filters count does inside its circle.
 */
export function RollingNumber({
  value,
  className,
}: {
  value: number;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement | null>(null);
  const last = useRef(value);

  useLayoutEffect(() => {
    const el = ref.current;
    const was = last.current;
    last.current = value;
    if (!el || was === value || typeof el.animate !== "function") return;
    roll(el, String(was), value > was ? 1 : -1);
  }, [value]);

  return (
    <span ref={ref} className={cn("inline-block tabular-nums", className)}>
      {value}
    </span>
  );
}

/** Each figure's arrival while it plays: a change part way starts from it. */
const rolling = new WeakMap<Element, Animation>();

function roll(el: HTMLElement, from: string, direction: 1 | -1) {
  /*
    Where the figure was drawn as it changed: at rest, or part of the way
    through the last roll. Changed twice inside 200ms (a party of three, then
    four), it used to leave from rest: back down to its place and whole, a
    jump and a flash in the middle of a roll.
  */
  const at = translateYOf(el);
  const drawnAt = opacityOf(el);
  const midway = rolling.get(el)?.playState === "running";
  stopAnimations(el);
  if (prefersReducedMotion()) {
    rolling.set(
      el,
      el.animate([{ opacity: midway ? drawnAt : 0 }, { opacity: 1 }], {
        duration: DURATION.reducedFade,
        easing: "linear",
      }),
    );
    return;
  }
  const parent = el.parentElement;
  if (!parent) return;
  if (getComputedStyle(parent).position === "static")
    parent.style.position = "relative";
  // Read after the parent became the containing block, so the copy lands
  // exactly on the figure.
  const height = el.offsetHeight || 16;
  const travel = height * 0.6 * direction;
  const copy = document.createElement("span");
  copy.textContent = from;
  copy.className = el.className;
  copy.setAttribute("aria-hidden", "true");
  copy.style.position = "absolute";
  copy.style.left = `${el.offsetLeft}px`;
  copy.style.top = `${el.offsetTop}px`;
  copy.style.width = `${el.offsetWidth}px`;
  copy.style.height = `${height}px`;
  copy.style.margin = "0";
  copy.style.pointerEvents = "none";
  parent.appendChild(copy);
  copy
    .animate(
      [
        { transform: `translateY(${at}px)`, opacity: drawnAt },
        { transform: `translateY(${-travel}px)`, opacity: 0 },
      ],
      {
        duration: Math.round(DURATION.standard * 0.7),
        easing: EASE.exit,
        fill: "forwards",
      },
    )
    .finished.then(
      () => copy.remove(),
      () => copy.remove(),
    );
  const arrival = el.animate(
    [
      { transform: `translateY(${travel}px)`, opacity: 0 },
      { transform: "none", opacity: 1 },
    ],
    {
      duration: DURATION.standard,
      easing: EASE.interaction,
      fill: "backwards",
    },
  );
  rolling.set(el, arrival);
}
