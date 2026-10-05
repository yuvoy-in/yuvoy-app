"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { IconButton } from "./icon-button";
import { CloseIcon } from "./icons";
import { cn } from "@/lib/cn";
import {
  DURATION,
  EASE,
  opacityOf,
  prefersReducedMotion,
  scaledDuration,
  stopAnimations,
  translateYOf,
} from "@/lib/motion";

/**
 * A sheet that rises from the foot of the screen, and a panel on a desktop.
 *
 * The one modal surface in the app. Three screens asked for it in the same
 * week — the search filters (yuvoy-app#37), the listing's date and party
 * pop-ups (#32) and the trips date filter (#38) — and the issue for the third
 * says "build it once", which is what this is.
 *
 * ## Built on `<dialog>`, not on a div with `role="dialog"`
 *
 * The browser gives four things away for free that are laborious and easy to
 * get subtly wrong by hand: the focus trap, Escape to close, inertness of
 * everything behind it, and a top-layer paint that no `z-index` on the page
 * can climb over. A hand-rolled modal that gets three of those right is the
 * usual outcome, and the one it misses is the focus trap.
 *
 * `showModal()` rather than the `open` attribute, because only the modal form
 * gives the top layer and the inertness. It is called from an effect rather
 * than during render: it is a DOM side effect, and calling it twice throws.
 *
 * ## The close button is not optional
 *
 * A sheet on a phone can be dismissed by Escape (no keyboard) or by the
 * backdrop (a target most people do not know exists). Neither is discoverable,
 * so the control is part of the component rather than each caller's problem.
 *
 * ## It leaves the way it came (T06 A, approved 4 Oct 2026)
 *
 * On a phone the sheet rises from the bottom edge (250ms) and every way out,
 * the X, the backdrop, Escape and a caller closing it, sends it back down
 * (200ms, accelerating away). From `sm` up it is a panel floating mid-screen,
 * not an edge sheet: it keeps its rise and leaves by reversing it. Under
 * reduced motion both ways are a 120ms fade (S01 A).
 *
 * The exit is script and the dialog closes only once it has run: a closed
 * `<dialog>` is not drawn, and Safari 27 dropped the `display` transition that
 * would let CSS hold it. So a caller that mounts its sheet only while open
 * wraps it in {@link SheetPresence}, which keeps it mounted until it has gone.
 *
 * ## It can be pulled down
 *
 * On a phone the head (the title row) is a grip: the sheet follows the finger
 * one to one and the tint thins with it. Let go past a quarter of its height,
 * or flick it, and it goes from where it is; otherwise it settles back. The X
 * stays, so the gesture is never the only way out (WCAG 2.5.7).
 */
export function Sheet({
  open,
  onClose,
  title,
  children,
  footer,
  className,
}: {
  open: boolean;
  onClose: () => void;
  /** Names the dialog. Required: an unnamed dialog is an unnamed region. */
  title: string;
  children: ReactNode;
  /** Pinned to the foot, clear of the scrolling body: Apply, Clear. */
  footer?: ReactNode;
  className?: string;
}) {
  const presence = useContext(PresenceContext);
  /** What the sheet should be: the caller's word, and its presence's. */
  const shown = open && (presence ? presence.open : true);

  const ref = useRef<HTMLDialogElement | null>(null);
  const phase = useRef<Phase>("closed");
  /** How the next exit was asked for: a release keeps the finger's curve. */
  const how = useRef<How>("tap");
  const exit = useRef<Animation | null>(null);
  /** An exit is owed to the presence: it is told once the sheet has gone. */
  const owed = useRef(false);
  const drag = useRef<Drag | null>(null);
  const swallow = useRef(false);

  // The latest callbacks, for the listeners bound once.
  const latest = useRef({ onClose, exited: presence?.exited });
  useEffect(() => {
    latest.current = { onClose, exited: presence?.exited };
  });

  const finish = useCallback((dialog: HTMLDialogElement) => {
    exit.current = null;
    phase.current = "closed";
    // Closed first, then cleaned: the dialog is gone before its styles go.
    if (dialog.open) {
      if (typeof dialog.close === "function") dialog.close();
      else dialog.removeAttribute("open");
    }
    clean(dialog);
    if (owed.current) {
      owed.current = false;
      latest.current.exited?.();
    }
  }, []);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;

    if (shown) {
      if (phase.current === "leaving") {
        // Asked back while it was going: it turns round from where it is.
        const leaving = exit.current;
        exit.current = null;
        phase.current = "open";
        playReturn(dialog, leaving);
      } else if (phase.current === "closed") {
        phase.current = "open";
        owed.current = true;
        clean(dialog);
        /*
          `showModal` is not implemented in jsdom, so every unit test rendering
          a sheet would throw on the first open. Guarded rather than mocked
          globally: the fallback still sets `open`, which is enough for the
          content to be in the document and for a test to assert on it, and a
          real browser never takes this branch. The e2e is what proves the
          modal behaviour, because only a real browser has a top layer.
        */
        if (!dialog.open) {
          if (typeof dialog.showModal === "function") dialog.showModal();
          else dialog.setAttribute("open", "");
        }
      }
      return;
    }

    if (phase.current === "open") {
      phase.current = "leaving";
      drag.current = null;
      const animation = playLeave(dialog, how.current);
      how.current = "tap";
      exit.current = animation;
      if (!animation) {
        finish(dialog);
        return;
      }
      animation.finished.then(
        () => {
          if (exit.current === animation) finish(dialog);
        },
        () => {},
      );
    } else if (phase.current === "closed") {
      // The browser had already closed it: nothing left to wait for.
      finish(dialog);
    }
  }, [shown, finish]);

  /*
    Escape, and Android's back, ask the dialog to close through `cancel`, and
    the browser would close it on the spot, without telling React and without
    an exit. Held here and handed to the caller like the X: the caller closes,
    and the sheet leaves. When the browser will not let a close be held (a
    second Escape with no tap between, its rule against trapping people), the
    dialog closes at once and `close` tidies up after it.
  */
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    const onCancel = (e: Event) => {
      e.preventDefault();
      if (phase.current !== "open") return;
      how.current = "tap";
      latest.current.onClose();
    };
    const onClosed = () => {
      if (phase.current === "leaving") finish(dialog);
      else if (phase.current === "open" && !dialog.open) {
        phase.current = "closed";
        clean(dialog);
        latest.current.onClose();
      }
    };
    dialog.addEventListener("cancel", onCancel);
    dialog.addEventListener("close", onClosed);
    return () => {
      dialog.removeEventListener("cancel", onCancel);
      dialog.removeEventListener("close", onClosed);
    };
  }, [finish]);

  // Taken away mid-exit (a screen change): nothing is owed to anybody.
  useEffect(
    () => () => {
      phase.current = "closed";
      exit.current = null;
      owed.current = false;
    },
    [],
  );

  const requestClose = (with_: How) => {
    if (phase.current !== "open") return;
    how.current = with_;
    onClose();
  };

  /* ------------------------------------------------ the head is a grip */

  const onGrip = (e: ReactPointerEvent<HTMLDivElement>) => {
    const dialog = ref.current;
    if (!dialog || phase.current !== "open") return;
    if (e.button > 0 || !e.isPrimary || !isEdgeSheet()) return;
    drag.current = {
      id: e.pointerId,
      y0: e.clientY,
      from: 0,
      y: 0,
      on: false,
      h: dialog.offsetHeight || 1,
      lastY: e.clientY,
      lastAt: e.timeStamp,
      v: 0,
    };
  };

  const onPull = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    const dialog = ref.current;
    if (!d || !dialog || d.id !== e.pointerId) return;
    if (!d.on) {
      if (Math.abs(e.clientY - d.y0) < SLOP) return;
      d.on = true;
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        // A pointer the browser will not capture: the drag still works while
        // the finger stays on the head.
      }
      // Caught wherever it is, mid-entrance included.
      d.from = takeHold(dialog);
      d.y0 = e.clientY;
    }
    const dt = e.timeStamp - d.lastAt;
    if (dt > 0) d.v = (e.clientY - d.lastY) / dt;
    d.lastY = e.clientY;
    d.lastAt = e.timeStamp;
    d.y = Math.max(0, d.from + e.clientY - d.y0);
    follow(dialog, d.y, d.h);
  };

  const onLetGo = (
    e: ReactPointerEvent<HTMLDivElement>,
    cancelled: boolean,
  ) => {
    const d = drag.current;
    const dialog = ref.current;
    if (!d || d.id !== e.pointerId) return;
    drag.current = null;
    if (!d.on || !dialog) return;
    // The click a drag ends in is not a tap on whatever it ended over.
    swallow.current = true;
    dialog.removeAttribute(STATE);
    const goes =
      !cancelled &&
      (d.y > d.h * CLOSE_SHARE || (d.v > FLICK && d.y > FLICK_TRAVEL));
    if (!goes) {
      settle(dialog, d.y);
      return;
    }
    requestClose("gesture");
    // A caller that kept it open gets it back, rather than a sheet left
    // hanging where the finger let go. Two frames: by then the caller's
    // answer has rendered and, if it closed, the exit has begun.
    afterTwoFrames(() => {
      if (phase.current === "open") settle(dialog, translateYOf(dialog));
    });
  };

  return (
    <dialog
      ref={ref}
      aria-label={title}
      // Ships its own reduced motion (a fade), so the global rule leaves it be.
      data-motion=""
      /*
        The backdrop. `::backdrop` cannot be styled by a utility class, so the
        tint lives in globals.css beside the sheet's entrance.

        Clicking it closes, and the test for "was the backdrop clicked" is that
        the target IS the dialog: the dialog's own box is the whole viewport in
        the top layer, and the visible sheet is a child of it. Comparing
        against a bounding box instead would be wrong the moment the sheet
        animates.
      */
      onClick={(e) => {
        if (e.target === e.currentTarget) requestClose("tap");
      }}
      // Every press starts clean, whatever the last drag left behind.
      onPointerDownCapture={() => {
        swallow.current = false;
      }}
      onClickCapture={(e) => {
        if (!swallow.current) return;
        swallow.current = false;
        e.preventDefault();
        e.stopPropagation();
      }}
      className={cn(
        "app-sheet bg-paper text-forest w-full max-w-xl p-0",
        "rounded-t-sheet sm:rounded-sheet",
        className,
      )}
    >
      <div className="flex max-h-[85dvh] flex-col">
        <div
          className="sheet-head border-paper-line flex items-start justify-between gap-3 border-b px-5 py-4"
          onPointerDown={onGrip}
          onPointerMove={onPull}
          onPointerUp={(e) => onLetGo(e, false)}
          onPointerCancel={(e) => onLetGo(e, true)}
        >
          <h2 className="pt-1.5 font-bold text-balance">{title}</h2>
          <IconButton
            label="Close"
            variant="onPaper"
            size="sm"
            onClick={() => requestClose("tap")}
          >
            <CloseIcon className="size-4" />
          </IconButton>
        </div>

        {/* The only scrolling part, so the title and the footer stay put. */}
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-5">
          {children}
        </div>

        {footer ? (
          <div className="border-paper-line sheet-foot border-t px-5 py-4">
            {footer}
          </div>
        ) : null}
      </div>
    </dialog>
  );
}

/**
 * Keeps a sheet mounted until it has left.
 *
 * Every caller mounts its sheet only while it is open: that seeds a sheet's
 * draft afresh on each opening, and a closed `<dialog>` on every page is a
 * focus trap waiting for something to open it. Unmounted on the frame it is
 * closed, though, a sheet has no frames left to leave in. So the caller
 * renders this with its open state and the sheet inside it, unconditionally:
 *
 *     <SheetPresence open={filtersOpen}>
 *       <FilterSheet onClose={() => setFiltersOpen(false)} ... />
 *     </SheetPresence>
 *
 * Its children mount when `open` turns true and unmount once the `Sheet`
 * inside them has finished leaving. Opened again while it is leaving, the
 * same sheet turns round, with its state as it was. Every child must render
 * a `Sheet`: it is the sheet's exit that unmounts them.
 */
export function SheetPresence({
  open,
  children,
}: {
  open: boolean;
  children: ReactNode;
}) {
  const [present, setPresent] = useState(open);
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setPresent(true);
  }
  const exited = useCallback(() => setPresent(false), []);
  const value = useMemo(() => ({ open, exited }), [open, exited]);
  return present ? (
    <PresenceContext value={value}>{children}</PresenceContext>
  ) : null;
}

/* ---------------------------------------------------------------- motion */

type Phase = "closed" | "open" | "leaving";
type How = "tap" | "gesture";

interface Drag {
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

const PresenceContext = createContext<{
  open: boolean;
  exited: () => void;
} | null>(null);

/** A press becomes a drag past this many px. */
const SLOP = 6;
/** Let go past this share of the sheet's height and it goes. */
const CLOSE_SHARE = 0.25;
/** Or flicked down faster than this (px per ms), past `FLICK_TRAVEL` px. */
const FLICK = 0.5;
const FLICK_TRAVEL = 24;

/** The dialog's own state while the script has it: `globals.css` reads it. */
const STATE = "data-sheet";
/** Set once a finger has held it: its entrance keyframes must not replay. */
const TOUCHED = "data-sheet-held";

/** From `sm` up the sheet is a centred panel (`globals.css`, "sheets"). */
const PANEL = "(min-width: 40rem)";

function afterTwoFrames(run: () => void) {
  if (typeof requestAnimationFrame !== "function") return;
  requestAnimationFrame(() => requestAnimationFrame(run));
}

function isEdgeSheet(): boolean {
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
function takeHold(dialog: HTMLDialogElement): number {
  const y = translateYOf(dialog);
  stopAnimations(dialog);
  dialog.style.animation = "none";
  follow(dialog, y, dialog.offsetHeight || 1);
  dialog.setAttribute(TOUCHED, "");
  dialog.setAttribute(STATE, "dragging");
  return y;
}

/** The finger's position, written once per move; the tint thins with it. */
function follow(dialog: HTMLDialogElement, y: number, h: number) {
  dialog.style.transform = `translateY(${y}px)`;
  dialog.style.setProperty("--sheet-tint", String(Math.max(0, 1 - y / h)));
}

/** Back to where it rests, from `y` (200ms, `move`); at once when reduced. */
function settle(dialog: HTMLDialogElement, y: number) {
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
function playLeave(dialog: HTMLDialogElement, how: How): Animation | null {
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
function playReturn(dialog: HTMLDialogElement, leaving: Animation | null) {
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
function clean(dialog: HTMLDialogElement) {
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
