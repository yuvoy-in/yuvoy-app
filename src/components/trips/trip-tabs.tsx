"use client";

import { useEffect, useLayoutEffect, useRef } from "react";
import { ChipButton, chipVariants } from "@/components/ui/chip";
import { DURATION, prefersReducedMotion } from "@/lib/motion";
import { TRIP_TABS, TAB_LABEL, type TripTab } from "@/lib/trips/tabs";

/**
 * Upcoming, Past, Cancelled: one fill that slides to the tab tapped (T07 A,
 * approved 4 Oct 2026).
 *
 * The tabs were three chips whose colours faded while the whole screen under
 * them was replaced in one frame, so the large change had no motion and the
 * small one had all of it. Now the choice is one object: a forest fill that
 * moves from the old tab to the new on the tap (250ms on `--ease-move`),
 * before the list has answered, and each label turns paper exactly where the
 * fill passes under it.
 *
 * ## How
 *
 * The fill is the row again, every chip in its chosen look, laid over the
 * real row and clipped to the chosen chip with one `inset()`; the clip is
 * what moves, so the labels never do. It is `aria-hidden`: the tabs below it
 * carry `role="tab"` and `aria-selected`, unchanged, and take every press.
 *
 * Before script has measured (the server's HTML, the first paint), the fill
 * is not drawn and the chosen chip paints its own fill, exactly as before.
 * Once it is placed the row is marked `data-tab-fill="on"`, the chips all
 * draw unchosen, and the fill draws the choice.
 *
 * Reduced motion (S01 A): the fill lands on the new tab at once and fades in
 * there (120ms).
 */
export function TripTabs({
  tab,
  onChange,
}: {
  tab: TripTab;
  onChange: (tab: TripTab) => void;
}) {
  const row = useRef<HTMLDivElement | null>(null);
  const fill = useRef<HTMLDivElement | null>(null);

  useLayoutEffect(() => {
    const list = row.current;
    const layer = fill.current;
    if (!list || !layer) return;
    const clip = clipFor(list, tab);
    if (!clip) return;
    if (list.dataset.tabFill !== "on") {
      // Placed, then armed: the first placement is not a journey.
      place(layer, clip);
      list.dataset.tabFill = "on";
      return;
    }
    layer.style.clipPath = clip;
    if (prefersReducedMotion() && typeof layer.animate === "function") {
      layer.animate([{ opacity: 0 }, { opacity: 1 }], {
        duration: DURATION.reducedFade,
        easing: "linear",
      });
    }
  }, [tab]);

  /*
    A row laid out again without a change (a font arriving, a rotation)
    moves the chips under a fill that stays put, so it is placed again, at
    once.
  */
  useEffect(() => {
    const list = row.current;
    const layer = fill.current;
    if (!list || !layer || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      const chosen = list.querySelector<HTMLElement>('[aria-selected="true"]');
      const clip = chosen ? clipFor(list, chosen.dataset.tab as TripTab) : null;
      if (clip && layer.style.clipPath !== clip) place(layer, clip);
    });
    observer.observe(list);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={row}
      role="tablist"
      aria-label="Which trips"
      className="relative flex gap-2"
    >
      {TRIP_TABS.map((name) => (
        <ChipButton
          key={name}
          role="tab"
          data-tab={name}
          aria-selected={tab === name}
          pressed={tab === name}
          onClick={() => onChange(name)}
        >
          {TAB_LABEL[name]}
        </ChipButton>
      ))}
      <div
        ref={fill}
        aria-hidden="true"
        className="trip-tab-fill pointer-events-none absolute inset-0 flex gap-2"
      >
        {TRIP_TABS.map((name) => (
          <span key={name} className={chipVariants({ tone: "selected" })}>
            {TAB_LABEL[name]}
          </span>
        ))}
      </div>
    </div>
  );
}

/** The chosen chip, as an inset of the row the fill covers, round as a pill. */
function clipFor(list: HTMLElement, tab: TripTab): string | null {
  const chip = list.querySelector<HTMLElement>(`[data-tab="${tab}"]`);
  if (!chip) return null;
  const top = chip.offsetTop;
  const left = chip.offsetLeft;
  const right = list.clientWidth - (left + chip.offsetWidth);
  const bottom = list.clientHeight - (top + chip.offsetHeight);
  return `inset(${top}px ${right}px ${bottom}px ${left}px round 9999px)`;
}

/** Puts the fill somewhere without the journey there. */
function place(layer: HTMLElement, clip: string) {
  layer.style.transition = "none";
  layer.style.clipPath = clip;
  // The jump is applied before the transition comes back.
  void layer.offsetWidth;
  layer.style.transition = "";
}
