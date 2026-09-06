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
 * Decides whether video may autoplay **by itself**.
 *
 * This is not "can this play at all" — that question is the player's, and
 * conflating the two is what made every reel a dead poster on Safari.
 *
 * ## The defect this replaces
 *
 * It used to refuse whenever `navigator.connection` was missing, "rather than
 * assume it is [good enough]", on the stated grounds that "poster-first is a
 * complete experience, so the conservative default costs nothing". Both halves
 * were wrong:
 *
 *   - **The Network Information API does not exist in Safari or Firefox.** It
 *     is Chromium-only. So the branch that reads as an edge case was in fact
 *     iOS and every Mac — which `feed-player.tsx` calls "most of our traffic"
 *     three files away.
 *   - **It did not cost nothing.** `canPlay` gated the `<video>` element on
 *     this flag, so the poster was not a graceful default, it was the whole
 *     experience, permanently, with no way to reach the video.
 *
 * Reported by the owner as "videos are not getting played correctly", with
 * correct media behind it the whole time — yuvoy-app#17.
 *
 * ## The rule now: refuse only on evidence
 *
 * Silence from the browser is not evidence of a bad connection. Autoplay is
 * refused when something actually says so — Data Saver, a reduced-motion
 * preference, or an `effectiveType` that positively reports a slow link — and
 * allowed otherwise. `4g` is no longer required: 5G and most Wi-Fi do not
 * report it, and a traveller on hotel Wi-Fi is not who this was protecting.
 *
 * Being wrong here is now cheap in both directions. Too eager costs a few
 * seconds of a muted clip nobody asked for; too shy leaves a play button that
 * works. Neither is a dead end.
 */
export function detectAutoplayAllowed(): boolean {
  if (typeof window === "undefined") return false;

  // Reduced motion is a preference about movement; autoplaying video ignores
  // it entirely, so it is honoured here rather than only in CSS. It does NOT
  // stop manual playback — asking for a video is not the same as being shown
  // one unbidden.
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
    return false;
  }

  const conn = (
    navigator as Navigator & {
      connection?: { effectiveType?: string; saveData?: boolean };
    }
  ).connection;

  // No Network Information API — Safari, Firefox, and every iOS browser.
  // Nothing has said the connection is poor, so nothing here pretends it did.
  if (!conn) return true;

  // Data Saver is the traveller telling us directly. The only signal here
  // that is a stated preference rather than an inference.
  if (conn.saveData) return false;

  /*
    Positive evidence only. An absent or unrecognised `effectiveType` is
    silence, and silence is not a slow link — this is the same mistake as the
    missing-API branch above, one field further in.
  */
  const slow = new Set(["slow-2g", "2g", "3g"]);
  return !slow.has(conn.effectiveType ?? "");
}
