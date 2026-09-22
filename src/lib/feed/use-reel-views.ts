"use client";

import { useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import {
  consentServerSnapshot,
  consentSnapshot,
  subscribeConsent,
} from "@/lib/analytics/consent";
import { reelViewCollector, type ReelView } from "@/lib/analytics/reel-views";

/**
 * What a player reports about the clip it is playing, for a view in progress.
 *
 * Handed to the ACTIVE card's player only, and stable for the life of the
 * strip, so passing it down re-renders nothing.
 */
export interface ReelWatch {
  /** The clip played this many more milliseconds. */
  played(ms: number): void;
  /** The clip came to its end. */
  completed(): void;
}

const subscribeVisibility = (onChange: () => void) => {
  document.addEventListener("visibilitychange", onChange);
  return () => document.removeEventListener("visibilitychange", onChange);
};
const visibleNow = () => document.visibilityState !== "hidden";
// The server has no tab; it also records nothing, so the answer is moot.
const visibleOnServer = () => true;

/**
 * One view per reel on screen, reported only with consent (yuvoy-app#96).
 *
 * `active` is the reel filling the strip. A view begins when it arrives and
 * ends when it leaves, when the page is hidden (and a new one begins when the
 * page comes back, because the traveller is watching again), and when the
 * strip unmounts. See `lib/analytics/reel-views.ts` for the owner's ruling
 * this is built to: consent only, anonymous, never persisted.
 *
 * What is waiting is sent whenever the reels are LEFT, with `keepalive` so the
 * request outlives a page that is closing: the page hidden, the page going
 * away, and the strip unmounting on a navigation.
 *
 * ## Consent is read live
 *
 * Through the same store the consent prompt writes, so a withdrawal reaches
 * this at once: the view in progress is dropped rather than ended, and the
 * collector drops what is queued and aborts what is in flight.
 */
export function useReelViews(
  active: { reelId?: string; experienceId?: string } | null,
): ReelWatch {
  const consent = useSyncExternalStore(
    subscribeConsent,
    consentSnapshot,
    consentServerSnapshot,
  );
  const visible = useSyncExternalStore(
    subscribeVisibility,
    visibleNow,
    visibleOnServer,
  );
  const granted = consent === "granted";
  const view = useRef<ReelView | null>(null);

  const reelId = active?.reelId;
  const experienceId = active?.experienceId;

  useEffect(() => {
    if (!granted || !visible || !reelId) return;
    const current = reelViewCollector().beginView({ reelId, experienceId });
    view.current = current;
    return () => {
      current.end();
      if (view.current === current) view.current = null;
    };
  }, [granted, visible, reelId, experienceId]);

  // A withdrawal stops everything, including what was already queued.
  useEffect(() => {
    if (!granted) reelViewCollector().withdraw();
  }, [granted]);

  useEffect(() => {
    if (!granted) return;
    const leave = () => {
      view.current?.end();
      view.current = null;
      reelViewCollector().flush({ keepalive: true });
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") leave();
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", leave);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", leave);
      // The strip is going: send what it saw.
      leave();
    };
  }, [granted]);

  return useMemo(
    () => ({
      played: (ms: number) => view.current?.played(ms),
      completed: () => view.current?.completed(),
    }),
    [],
  );
}
