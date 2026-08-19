import { create } from "zustand";

/**
 * Feed player state.
 *
 * This is global rather than component-local for one reason: the preload
 * budget. Only the active card and the next one may hold a video element, and
 * that has to be decided somewhere that can see all the cards at once. Left to
 * each card, "preload the next one" becomes every card preloading its own
 * neighbour, which on island 4G is the whole feed downloading at once.
 */

/** Active card plus one. Never more. */
export const PRELOAD_AHEAD = 1;

interface FeedState {
  /** Index of the card currently filling the viewport. */
  activeIndex: number;
  /** Muted by default, and remembered for the session once a traveller unmutes. */
  muted: boolean;
  /** False when the connection or the user's preferences say do not autoplay. */
  autoplayAllowed: boolean;

  setActiveIndex: (i: number) => void;
  toggleMuted: () => void;
  setAutoplayAllowed: (allowed: boolean) => void;
  /** Whether this index is inside the preload budget. */
  shouldMount: (index: number) => boolean;
}

export const useFeedStore = create<FeedState>((set, get) => ({
  activeIndex: 0,
  muted: true,
  autoplayAllowed: false,

  setActiveIndex: (i) => set({ activeIndex: i }),
  toggleMuted: () => set((s) => ({ muted: !s.muted })),
  setAutoplayAllowed: (autoplayAllowed) => set({ autoplayAllowed }),

  shouldMount: (index) => {
    const { activeIndex } = get();
    return index >= activeIndex - 1 && index <= activeIndex + PRELOAD_AHEAD;
  },
}));

/**
 * Decides whether video may autoplay at all.
 *
 * Defaults to NO. A clip that stalls at 2% teaches the traveller the app is
 * broken, and on Havelock that is the common case rather than the edge one.
 * Autoplay is enabled only when the connection says it can carry it.
 */
export function detectAutoplayAllowed(): boolean {
  if (typeof window === "undefined") return false;

  // Reduced motion is a preference about movement; autoplaying video ignores
  // it entirely, so it is honoured here rather than only in CSS.
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
    return false;
  }

  const conn = (
    navigator as Navigator & {
      connection?: { effectiveType?: string; saveData?: boolean };
    }
  ).connection;

  // No Network Information API (Safari, Firefox): assume the connection is
  // not good enough rather than assume it is. Poster-first is a complete
  // experience, so the conservative default costs nothing.
  if (!conn) return false;
  if (conn.saveData) return false;
  return conn.effectiveType === "4g";
}
