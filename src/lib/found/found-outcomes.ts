"use client";

import { useCallback, useEffect, useState } from "react";
import { outcomesConsented, subscribeConsent } from "@/lib/analytics/consent";
import { recordOutcome } from "@/lib/analytics/outcomes";
import { SHOWN_AFTER_MS } from "@/lib/feed/use-shown-outcome";

/**
 * What people do with a found card, counted (yuvoy-app#179, R2-T4).
 *
 * R0-T5's transport, unchanged (`lib/analytics/outcomes.ts`): only after
 * analytics consent, anonymously, never persisted, batched as the API asks.
 * What this adds is the subject: a found item is an `event` to the API, not an
 * `experience`, and the two surfaces it is seen on are `found_feed` and
 * `found_detail`. A found card is never `saved` here (that is R4's), and
 * `problem_reported` is R2's own.
 *
 * `shown` follows the issue's rule: half of the card on screen for one
 * second, once per card per view of the feed. The second is the phone app's
 * and the reels' (`SHOWN_AFTER_MS`), so the three count the same thing.
 */

export type FoundOutcomeKind =
  "shown" | "opened" | "link_out" | "shared" | "problem_reported";

export type FoundSurface = "found_feed" | "found_detail";

/** Something happened to a found card. Never throws; nothing without consent. */
export function recordFound(
  kind: FoundOutcomeKind,
  itemId: string,
  surface: FoundSurface,
  position?: number,
): void {
  recordOutcome({
    kind,
    subjectType: "event",
    subjectId: itemId,
    surface,
    ...(position === undefined ? {} : { position }),
  });
}

/** How much of a card has to be on screen before its second starts. */
export const SHOWN_SHARE = 0.5;

export interface ShownTrackerDeps {
  /** A card has been seen: count it. */
  record(itemId: string, position: number | undefined): void;
  /** Whether counting is allowed right now: consent given, page visible. */
  counting(): boolean;
  setTimer(run: () => void, ms: number): unknown;
  clearTimer(handle: unknown): void;
}

/**
 * The cards of ONE view of the feed, and which of them have been seen.
 *
 * Kept apart from the observer so the rule can be tested without layout,
 * which jsdom does not have. A card starts its second when half of it comes
 * on screen and loses it when it goes; a card counted once is not counted
 * again in this view, however often it is scrolled back to. A new view (the
 * feed mounted again) is a new tracker.
 *
 * The collector underneath keeps its own once per card and surface per page
 * load, so a second view in the same page load sends nothing new for a card
 * the first view already counted. That is R0's rule and this does not undo it.
 */
export function createShownTracker(deps: ShownTrackerDeps) {
  const counted = new Set<string>();
  /** The cards half on screen now, with their place in the list. */
  const inView = new Map<string, number | undefined>();
  const timers = new Map<string, unknown>();

  const start = (id: string) => {
    if (counted.has(id) || timers.has(id) || !deps.counting()) return;
    timers.set(
      id,
      deps.setTimer(() => {
        timers.delete(id);
        if (!inView.has(id) || counted.has(id)) return;
        counted.add(id);
        deps.record(id, inView.get(id));
      }, SHOWN_AFTER_MS),
    );
  };

  const stop = (id: string) => {
    const timer = timers.get(id);
    if (timer === undefined) return;
    deps.clearTimer(timer);
    timers.delete(id);
  };

  return {
    /** Half of the card came on screen. */
    enter(id: string, position?: number) {
      inView.set(id, position);
      start(id);
    },
    /** The card went below half, or off the screen. */
    leave(id: string) {
      inView.delete(id);
      stop(id);
    },
    /** The page was hidden, or consent withdrawn: no second runs on. */
    pause() {
      for (const id of [...timers.keys()]) stop(id);
    },
    /** Back: the cards on screen start their second again, from now. */
    resume() {
      for (const id of inView.keys()) start(id);
    },
    dispose() {
      for (const id of [...timers.keys()]) stop(id);
      inView.clear();
    },
  };
}

export type ShownTracker = ReturnType<typeof createShownTracker>;

const pageVisible = () =>
  typeof document === "undefined" || document.visibilityState !== "hidden";

/** The tracker and the one observer behind a view's cards. */
function makeView(surface: FoundSurface) {
  const tracker = createShownTracker({
    record: (id, position) => recordFound("shown", id, surface, position),
    counting: () => outcomesConsented() && pageVisible(),
    setTimer: (run, ms) => setTimeout(run, ms),
    clearTimer: (handle) =>
      clearTimeout(handle as ReturnType<typeof setTimeout>),
  });
  /*
    None on the server, and none in a browser without one: then nothing is
    counted as shown, which is the honest answer when nothing can tell.
  */
  const observer =
    typeof IntersectionObserver === "undefined"
      ? null
      : new IntersectionObserver(
          (entries) => {
            for (const entry of entries) {
              const target = entry.target as HTMLElement;
              const id = target.dataset.foundId;
              if (!id) continue;
              if (
                entry.isIntersecting &&
                entry.intersectionRatio >= SHOWN_SHARE
              ) {
                const raw = Number(target.dataset.foundPosition);
                tracker.enter(id, Number.isInteger(raw) ? raw : undefined);
              } else {
                tracker.leave(id);
              }
            }
          },
          { threshold: [0, SHOWN_SHARE] },
        );
  return { tracker, observer };
}

/**
 * `shown` for the cards of one feed view: returns a ref for each card's
 * element, which must carry `data-found-id` and may carry
 * `data-found-position`.
 *
 * One observer for the whole list rather than one per card: a feed of sixty
 * cards is sixty elements to watch, not sixty observers. Made once per view
 * (the lazy state below), which is what makes "once per card per view" mean
 * this mount of the feed. `surface` is read once: a view does not change
 * which surface it is.
 */
export function useFoundShown(surface: FoundSurface) {
  const [view] = useState(() => makeView(surface));

  useEffect(() => {
    // A hidden page and a withdrawn yes both stop the clock; coming back restarts it.
    const onChange = () => {
      if (outcomesConsented() && pageVisible()) view.tracker.resume();
      else view.tracker.pause();
    };
    document.addEventListener("visibilitychange", onChange);
    const stopConsent = subscribeConsent(onChange);
    return () => {
      document.removeEventListener("visibilitychange", onChange);
      stopConsent();
      view.tracker.pause();
    };
  }, [view]);

  return useCallback(
    (element: HTMLElement | null) => {
      const { observer, tracker } = view;
      if (!element || !observer) return;
      observer.observe(element);
      return () => {
        observer.unobserve(element);
        const id = element.dataset.foundId;
        if (id) tracker.leave(id);
      };
    },
    [view],
  );
}
