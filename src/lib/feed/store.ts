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
  /**
   * Whether video may START on its own. Nothing about whether it may play.
   *
   * THREE answers, not two, and `undefined` is the load-bearing one: the
   * browser has not been asked yet. It is `false` only when something actually
   * refused, which is Data Saver, a reduced-motion preference or a positively
   * slow link.
   *
   * It used to start `false` and be corrected by an effect on mount, and that
   * is the whole of the play-icon flash the owner reported. `false` is a
   * REFUSAL, and the player draws its tap-to-play control over the poster when
   * it reads one. So every card drew that control on first paint and took it
   * away a tick later, on every load, for every traveller.
   *
   * Undecided is not refused. Nothing that renders may collapse the two.
   */
  autoplayAllowed: boolean | undefined;

  setActiveIndex: (i: number) => void;
  toggleMuted: () => void;
  setAutoplayAllowed: (allowed: boolean) => void;
  /**
   * Back to the top of the feed.
   *
   * Called when a reel scroller mounts and when it unmounts, so the next one
   * starts at its own first card rather than inheriting an index from a list
   * it has nothing to do with. The feed, the search grid's reel view and a
   * business's reels are three different sequences behind one store.
   */
  resetFeed: () => void;
  /** Whether this index is inside the preload budget. */
  shouldMount: (index: number) => boolean;
}

export const useFeedStore = create<FeedState>((set, get) => ({
  activeIndex: 0,
  muted: true,
  // Undecided. `detectAutoplayAllowed` answers it on mount. Never `false` here:
  // see the field's own note, and never rendered as a refusal before it lands.
  autoplayAllowed: undefined,

  /*
    The chrome used to retract here.

    Moving DOWN a reel dropped the floating tab bar out of the window, lifted
    the masthead and gave the caption the room back; moving up brought it all
    back. It was deliberate, it was one line, and the owner ruled against it on
    13 September (yuvoy-app#36): the bar stays visible on every reel. Removed
    rather than defaulted to false, because a flag nothing writes is a flag
    somebody re-wires.

    A re-report of the same index is still short-circuited. An
    IntersectionObserver can fire twice for one card, and every subscriber to
    this store re-renders on a set.
  */
  setActiveIndex: (i) =>
    set((s) => (i === s.activeIndex ? s : { activeIndex: i })),
  toggleMuted: () => set((s) => ({ muted: !s.muted })),
  setAutoplayAllowed: (autoplayAllowed) => set({ autoplayAllowed }),
  resetFeed: () => set({ activeIndex: 0 }),

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
