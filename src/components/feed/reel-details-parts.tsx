"use client";

import {
  useLayoutEffect,
  useRef,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from "react";
import Link from "@/components/ui/link";
import {
  PANEL_DEPARTURES,
  departureHref,
  type Departure,
  type NextDepartures,
} from "@/lib/feed/next-departures";
import { ChevronRightIcon } from "@/components/ui/icons";
import { Button } from "@/components/ui/button";
import {
  DURATION,
  EASE,
  prefersReducedMotion,
  scaledDuration,
} from "@/lib/motion";
import { useHeightGlide } from "@/lib/motion/use-height-glide";

/**
 * "Coming up": the next open departures, each one a way into checkout on it.
 *
 * Every state says something true and none is a dead end: loading is a
 * skeleton the size of what it will become, a failure says so and offers the
 * read again (the action below still opens the listing), and none open says
 * so in words.
 *
 * The skeleton is the size of three, and a listing may have fewer, none, or a
 * read that failed. The panel fits its details, so its top moves when they
 * land at another height; it glides there while the panel is open
 * (`useHeightGlide`), rather than jumping.
 */
export function Departures({
  state,
  slug,
  instant,
  open,
}: {
  state: NextDepartures;
  slug: string;
  instant: boolean;
  /** Whether the panel is open: a shut panel has nothing to glide. */
  open: boolean;
}) {
  const ref = useRef<HTMLElement | null>(null);
  useHeightGlide(
    ref,
    state.state === "open" ? `open:${state.departures.length}` : state.state,
    open,
  );
  return (
    <section ref={ref} className="reel-sheet-deps" aria-label="Coming up">
      <p className="reel-sheet-deps-head">
        <span className="label text-paper/75">Coming up</span>
        {state.state === "open" ? (
          <span className="text-paper/70 text-xs">
            {instant ? "Tap one to book it" : "Tap one to ask"}
          </span>
        ) : null}
      </p>

      {state.state === "open" ? (
        <ul className="reel-sheet-dep-list">
          {state.departures.map((d) => (
            <li key={d.slotId}>
              <DepartureRow departure={d} slug={slug} instant={instant} />
            </li>
          ))}
        </ul>
      ) : state.state === "error" ? (
        <div className="reel-sheet-deps-note">
          <p>The departures did not load. The listing has them too.</p>
          <Button
            variant="outlineOnDark"
            size="sm"
            className="mt-2"
            onClick={state.retry}
          >
            Try again
          </Button>
        </div>
      ) : state.state === "none" ? (
        <p className="reel-sheet-deps-note">Nothing open to book right now.</p>
      ) : (
        <div role="status" aria-label="Loading departures">
          {Array.from({ length: PANEL_DEPARTURES }, (_, i) => (
            <span
              key={i}
              aria-hidden="true"
              className="reel-sheet-dep-skeleton"
            >
              <span className="reel-sheet-dep-skeleton-bar" />
            </span>
          ))}
        </div>
      )}
    </section>
  );
}

function DepartureRow({
  departure,
  slug,
  instant,
}: {
  departure: Departure;
  slug: string;
  instant: boolean;
}) {
  return (
    <Link href={departureHref(slug, departure)} className="reel-sheet-dep">
      {/* The verb, for a screen reader: sighted travellers have the hint. */}
      {/*
        Spaces between the parts are real text, so the link's name reads
        "Book Tomorrow 07:00 3 seats left" and not "Tomorrow07:00". A grid
        container drops whitespace-only text, so nothing moves on screen.
      */}
      <span className="sr-only">{instant ? "Book" : "Ask for"}</span>{" "}
      <span className="reel-sheet-dep-day">{departure.day}</span>{" "}
      <span className="reel-sheet-dep-time">{departure.time}</span>{" "}
      {departure.seats ? (
        <span className="reel-sheet-dep-seats">{departure.seats}</span>
      ) : (
        <span className="reel-sheet-dep-seats" aria-hidden="true" />
      )}
      <ChevronRightIcon className="text-paper/60 size-4 shrink-0" />
    </Link>
  );
}

/** The pull on the handle (T05 A). */
const PULL = {
  /** A press becomes a pull past this many px. */
  slop: 6,
  /** Let go past this many px and it closes. */
  close: 64,
  /** Or flicked down at this speed, px per ms. */
  flick: 0.5,
} as const;

interface PanelDrag {
  id: number;
  y0: number;
  y: number;
  at: number;
  /** Downward speed, px per ms. */
  v: number;
  /** How far the panel is pulled, px. */
  dy: number;
  on: boolean;
}

/**
 * The pull on the handle (T05 A), for `ReelDetails`: `ref` is its panel and
 * `onClose` its own. The handle takes `onGrip`, `onPull` and `onLetGo`; the
 * panel takes `freshPress` and `swallowed`, to drop the click a pull ends in.
 */
export function usePanelPull(
  ref: RefObject<HTMLDivElement | null>,
  open: boolean,
  onClose: () => void,
) {
  /*
    The pull on the handle. The panel's own transitions do the travel; while a
    finger holds it the panel follows inline, and its release hands the rest
    back to them from where it was let go.
  */
  const drag = useRef<PanelDrag | null>(null);
  /** The click a drag ends in is not a tap on the handle. */
  const swallow = useRef(false);
  /** Clears the release's own timing once it has run. */
  const release = useRef<number | undefined>(undefined);

  /*
    A fresh opening starts from the stylesheet, whatever the last release left
    inline; and a panel closed under a finger (Escape, the next reel) is let go
    so the stylesheet takes it from where it is. Before paint, so the opening
    never runs a release's leftover curve.
  */
  useLayoutEffect(() => {
    const panel = ref.current;
    if (!panel) return;
    if (open || drag.current) {
      window.clearTimeout(release.current);
      drag.current = null;
      panel.removeAttribute("data-held");
      panel.style.transition = "";
      panel.style.transform = "";
    }
  }, [open, ref]);

  const onGrip = (e: ReactPointerEvent<HTMLButtonElement>) => {
    if (!open || e.button > 0 || !e.isPrimary) return;
    drag.current = {
      id: e.pointerId,
      y0: e.clientY,
      y: e.clientY,
      at: e.timeStamp,
      v: 0,
      dy: 0,
      on: false,
    };
    ref.current?.setAttribute("data-held", "");
  };

  const onPull = (e: ReactPointerEvent<HTMLButtonElement>) => {
    const d = drag.current;
    const panel = ref.current;
    if (!d || !panel || d.id !== e.pointerId) return;
    /*
      The card's swipe to the listing never sees a pull's moves, so a pull
      that wanders sideways stays a pull. Its press does reach the card: that
      is where the swipe forgets whatever its last gesture left behind.
    */
    e.stopPropagation();
    if (!d.on) {
      if (Math.abs(e.clientY - d.y0) < PULL.slop) return;
      d.on = true;
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        // Not captured: the pull still works while the finger is on the handle.
      }
      window.clearTimeout(release.current);
      panel.style.transition = "none";
      // From here, so the panel does not jump by the slop.
      d.y0 = e.clientY;
    }
    const dt = e.timeStamp - d.at;
    if (dt > 0) d.v = (e.clientY - d.y) / dt;
    d.y = e.clientY;
    d.at = e.timeStamp;
    d.dy = Math.max(0, e.clientY - d.y0);
    panel.style.transform = `translateY(${d.dy}px)`;
  };

  const onLetGo = (
    e: ReactPointerEvent<HTMLButtonElement>,
    cancelled: boolean,
  ) => {
    const d = drag.current;
    const panel = ref.current;
    if (!d || d.id !== e.pointerId) return;
    drag.current = null;
    panel?.removeAttribute("data-held");
    if (!d.on || !panel) return;
    e.stopPropagation();
    swallow.current = true;
    const closes = !cancelled && (d.dy > PULL.close || d.v >= PULL.flick);
    const reduced = prefersReducedMotion();
    let ms: number;
    if (reduced) {
      /*
        Nothing travels: a closing pull fades out where it was let go, then the
        panel goes home unseen; a short one is simply back.
      */
      ms = closes ? DURATION.reducedFade : 0;
      panel.style.transition = closes
        ? `opacity ${ms}ms linear, visibility 0s linear ${ms}ms`
        : "none";
      if (!closes) panel.style.transform = "";
    } else {
      const h = panel.offsetHeight || 1;
      ms = closes
        ? scaledDuration(h - Math.min(d.dy, h), h)
        : DURATION.standard;
      panel.style.transition = closes
        ? `transform ${ms}ms ${EASE.move}, visibility 0s linear ${ms}ms`
        : `transform ${ms}ms ${EASE.move}`;
      panel.style.transform = "";
    }
    release.current = window.setTimeout(() => {
      panel.style.transition = "";
      if (closes) panel.style.transform = "";
    }, ms + 50);
    if (closes) onClose();
  };

  /*
    The writes to `swallow` stay in here: the panel only asks. A value a hook
    returns is not the caller's to change.
  */
  const freshPress = () => {
    swallow.current = false;
  };
  /** Whether this click ends a pull, so is not a tap; asked once per click. */
  const swallowed = () => {
    if (!swallow.current) return false;
    swallow.current = false;
    return true;
  };

  return { freshPress, swallowed, onGrip, onPull, onLetGo };
}
