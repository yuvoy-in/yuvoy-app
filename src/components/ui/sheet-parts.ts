import {
  DURATION,
  EASE,
  opacityOf,
  prefersReducedMotion,
  scaledDuration,
  stopAnimations,
  translateYOf,
} from "@/lib/motion";

/*
  The sheet's motion (sheet.tsx): the drag thresholds, the data attributes
  globals.css reads, and the hold, follow, settle, leave and return steps.
  Moved out of sheet.tsx so each file stays under 500 lines (yuvoy-app#243).
*/

export type Phase = "closed" | "open" | "leaving";
export type How = "tap" | "gesture";

export interface Drag {
  id: number;
  /** Where the finger was when the sheet was taken. */
  y0: number;
  /** Where the sheet was when it was taken. */
  from: number;
  /** Where the sheet is now. */
  y: number;
  on: boolean;
  h: number;
  lastY: number;
  lastAt: number;
  /** Downward speed, px per ms. */
  v: number;
}

/** A press becomes a drag past this many px. */
export const SLOP = 6;
/** Let go past this share of the sheet's height and it goes. */
export const CLOSE_SHARE = 0.25;
/** Or flicked down faster than this (px per ms), past `FLICK_TRAVEL` px. */
export const FLICK = 0.5;
export const FLICK_TRAVEL = 24;

/** The dialog's own state while the script has it: `globals.css` reads it. */
export const STATE = "data-sheet";
/** Set once a finger has held it: its entrance keyframes must not replay. */
const TOUCHED = "data-sheet-held";

/** From `sm` up the sheet is a centred panel (`globals.css`, "sheets"). */
const PANEL = "(min-width: 40rem)";

export function afterTwoFrames(run: () => void) {
  if (typeof requestAnimationFrame !== "function") return;
  requestAnimationFrame(() => requestAnimationFrame(run));
}

export function isEdgeSheet(): boolean {
  return !(
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia(PANEL).matches
  );
}

/**
 * Takes the sheet over where it is drawn, entrance or settle included, and
 * returns that position. The entrance keyframes are frozen for the rest of
 * this opening: dropped later, they would start again from the edge.
 */
export function takeHold(dialog: HTMLDialogElement): number {
  const y = translateYOf(dialog);
  stopAnimations(dialog);
  dialog.style.animation = "none";
  follow(dialog, y, dialog.offsetHeight || 1);
  dialog.setAttribute(TOUCHED, "");
  dialog.setAttribute(STATE, "dragging");
  return y;
}

/** The finger's position, written once per move; the tint thins with it. */
export function follow(dialog: HTMLDialogElement, y: number, h: number) {
  dialog.style.transform = `translateY(${y}px)`;
  dialog.style.setProperty("--sheet-tint", String(Math.max(0, 1 - y / h)));
}

/** Back to where it rests, from `y` (200ms, `move`); at once when reduced. */
export function settle(dialog: HTMLDialogElement, y: number) {
  dialog.style.transform = "";
  dialog.style.removeProperty("--sheet-tint");
  if (prefersReducedMotion() || typeof dialog.animate !== "function") return;
  dialog.setAttribute(STATE, "settling");
  const animation = dialog.animate(
    [{ transform: `translateY(${y}px)` }, { transform: "translateY(0)" }],
    { duration: DURATION.standard, easing: EASE.move },
  );
  animation.finished.then(
    () => {
      if (dialog.getAttribute(STATE) === "settling")
        dialog.removeAttribute(STATE);
    },
    () => {},
  );
}

/**
 * The exit, from wherever the sheet is drawn. Null where there is nothing to
 * animate with (jsdom): the caller closes at once.
 *
 * - Phone: down to the edge, 200ms scaled by the distance left (120ms at
 *   least), accelerating away; on the finger's own curve after a release.
 * - Panel: it fades as it drops 12px, 200ms.
 * - Reduced motion: it fades where it is, 120ms.
 *
 * The tint follows in the stylesheet, over the same time and curve.
 */
export function playLeave(
  dialog: HTMLDialogElement,
  how: How,
): Animation | null {
  const y = translateYOf(dialog);
  const o = opacityOf(dialog);
  stopAnimations(dialog);
  dialog.style.animation = "none";
  dialog.style.transform = `translateY(${y}px)`;
  dialog.style.opacity = String(o);
  dialog.setAttribute(TOUCHED, "");

  const reduced = prefersReducedMotion();
  let frames: Keyframe[];
  let duration: number;
  let easing: string;
  if (reduced) {
    frames = [{ opacity: o }, { opacity: 0 }];
    duration = DURATION.reducedFade;
    easing = "linear";
  } else if (isEdgeSheet()) {
    const h = dialog.offsetHeight || 1;
    frames = [
      { transform: `translateY(${y}px)` },
      { transform: `translateY(${Math.max(h, y)}px)` },
    ];
    duration = scaledDuration(h - Math.min(y, h), h);
    easing = how === "gesture" ? EASE.move : EASE.exit;
  } else {
    frames = [
      { opacity: o, transform: `translateY(${y}px)` },
      { opacity: 0, transform: `translateY(${y + 12}px)` },
    ];
    duration = DURATION.sheetExit;
    easing = EASE.exit;
  }
  dialog.style.setProperty("--sheet-leave", `${duration}ms`);
  dialog.style.setProperty("--sheet-leave-ease", easing);
  dialog.setAttribute(STATE, "leaving");
  if (typeof dialog.animate !== "function") return null;
  return dialog.animate(frames, { duration, easing, fill: "forwards" });
}

/** Asked back mid-exit: it returns to rest from where it got to (250ms). */
export function playReturn(
  dialog: HTMLDialogElement,
  leaving: Animation | null,
) {
  const y = translateYOf(dialog);
  const o = opacityOf(dialog);
  leaving?.cancel();
  stopAnimations(dialog);
  dialog.style.transform = "";
  dialog.style.opacity = "";
  dialog.style.removeProperty("--sheet-tint");
  dialog.setAttribute(STATE, "settling");
  const done = () => {
    if (dialog.getAttribute(STATE) === "settling")
      dialog.removeAttribute(STATE);
  };
  if (typeof dialog.animate !== "function") {
    done();
    return;
  }
  const reduced = prefersReducedMotion();
  dialog
    .animate(
      reduced
        ? [{ opacity: o }, { opacity: 1 }]
        : [
            { opacity: o, transform: `translateY(${y}px)` },
            { opacity: 1, transform: "translateY(0)" },
          ],
      reduced
        ? { duration: DURATION.reducedFade, easing: "linear" }
        : { duration: DURATION.sheet, easing: EASE.interaction },
    )
    .finished.then(done, () => {});
}

/** Everything the motion wrote, gone: the next opening starts clean. */
export function clean(dialog: HTMLDialogElement) {
  stopAnimations(dialog);
  for (const property of [
    "animation",
    "transform",
    "opacity",
    "--sheet-tint",
    "--sheet-leave",
    "--sheet-leave-ease",
  ]) {
    dialog.style.removeProperty(property);
  }
  dialog.removeAttribute(STATE);
  dialog.removeAttribute(TOUCHED);
}
