import { CACHE } from "@/lib/query/policy";

/**
 * The reel a traveller was watching on each reel screen, so that a step BACK
 * returns to it (an integration change of T02 C, approved 4 Oct 2026).
 *
 * A listing slides in from the right of the reel it was opened from, and Back
 * slides it away again with the reel returning from the left. That only means
 * anything if it is the same reel: before this, every return to a reel screen
 * started at its first reel, because the scroller is a new element at
 * scrollTop 0 and the strip resets its index on mount.
 *
 * Only a step back resumes (our Back, or the browser's back and forward). A
 * step forward onto the feed, the Feed tab say, starts at the top as it always
 * has: going somewhere is not going back to it.
 *
 * Keyed by the screen (path and query, as the route trail keys a visit) and by
 * the CLIP, never an index: the same clip is found wherever it now sits, and a
 * list that no longer holds it (a new visit, reshuffled) resumes nothing. Kept
 * as long as the visit it belongs to (`CACHE.reelVisit`), in memory only, like
 * the trail: where somebody has been is not ours to keep.
 */

const KEEP_MS = CACHE.reelVisit.gcTime;

const watched = new Map<string, { mediaId: string; at: number }>();

const now = () =>
  typeof performance !== "undefined" ? performance.now() : Date.now();

/** The reel screen on screen, as a key: its path and its query. */
export function reelScreenKey(): string {
  if (typeof window === "undefined") return "";
  return window.location.pathname + window.location.search;
}

export function rememberReel(screen: string, mediaId: string): void {
  watched.set(screen, { mediaId, at: now() });
}

/** The clip last on screen on `screen`, if it is still part of this visit. */
export function recallReel(screen: string): string | null {
  const last = watched.get(screen);
  if (!last) return null;
  if (now() - last.at > KEEP_MS) {
    watched.delete(screen);
    return null;
  }
  return last.mediaId;
}

/** For the unit tests. */
export function forgetReels(): void {
  watched.clear();
}
