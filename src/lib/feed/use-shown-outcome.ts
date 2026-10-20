"use client";

import { useEffect, useSyncExternalStore } from "react";
import { outcomesConsented, subscribeConsent } from "@/lib/analytics/consent";
import { recordOutcome, type OutcomeSurface } from "@/lib/analytics/outcomes";

/**
 * How long a card has to be the one on screen before it was shown: the
 * phone app's second (yuvoy-mobile#338, "a reel on screen for a second sends
 * one shown"), so the two count the same thing. A reel a thumb flicks past
 * was never seen, and counting it would teach the ranking noise.
 */
export const SHOWN_AFTER_MS = 1_000;

const subscribeVisibility = (onChange: () => void) => {
  document.addEventListener("visibilitychange", onChange);
  return () => document.removeEventListener("visibilitychange", onChange);
};
const visibleNow = () => document.visibilityState !== "hidden";
// The server has no tab, and records nothing.
const visibleOnServer = () => true;
const consentedOnServer = () => false;

/**
 * `shown` for the card on screen (yuvoy-app#181): once it has been the one in
 * view for `SHOWN_AFTER_MS` with the page visible, at its place in the list.
 * The collector keeps it to once per card and surface per page load, so
 * scrolling back to a card does not show it twice.
 *
 * Nothing is timed without consent, and a yes given while a card is on screen
 * counts it from then on, which is when it was seen under that yes.
 */
export function useShownOutcome(
  card: { subjectId?: string; position: number } | null,
  surface: OutcomeSurface,
): void {
  const counting = useSyncExternalStore(
    subscribeConsent,
    outcomesConsented,
    consentedOnServer,
  );
  const visible = useSyncExternalStore(
    subscribeVisibility,
    visibleNow,
    visibleOnServer,
  );
  const subjectId = card?.subjectId;
  const position = card?.position;

  useEffect(() => {
    if (!counting || !visible || !subjectId) return;
    const timer = setTimeout(
      () => recordOutcome({ kind: "shown", subjectId, surface, position }),
      SHOWN_AFTER_MS,
    );
    return () => clearTimeout(timer);
  }, [counting, visible, subjectId, surface, position]);
}
