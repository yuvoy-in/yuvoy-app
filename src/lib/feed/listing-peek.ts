import {
  DURATION,
  EASE,
  prefersReducedMotion,
  stopAnimations,
} from "@/lib/motion";

/**
 * The listing that follows a traveller's finger in from the right of a reel
 * (T02 C, "Spatial push", approved 4 Oct 2026).
 *
 * The listing is the page to the RIGHT of the reel. A right-to-left swipe
 * brings it in under the thumb, one to one, while the reel moves a third as
 * far and dims a quarter toward the forest. Let go past a quarter of the
 * width, or flick, and it completes and the route follows; otherwise it
 * springs back and nothing happened. Book and the title go to the same page
 * by a view transition that draws the same slide (`route-motion.ts`).
 *
 * ## Why this is not a view transition
 *
 * A view transition starts when a navigation commits, and this one has to be
 * on screen BEFORE anything has been decided: the traveller may change their
 * mind halfway. So the listing is drawn ahead of time, as a preview held off
 * the right edge (`ListingPeek`, mounted by the app shell), and the finger
 * moves it. The route is only pushed once the listing has fully arrived; the
 * real page then renders under the preview, which fades away once the page's
 * own picture is ready.
 *
 * ## Built while watching, shown only when swiped
 *
 * A reel that has been on screen for {@link DWELL_MS} arms the preview for its
 * listing: the real `ExperienceDetail`, rendered off screen and skipped by
 * layout, with its pictures and live reads held until it is shown (see
 * `preview-context.ts`). The one cost of a reel that is never swiped is the
 * listing's JSON, the same read Saved and checkout make.
 *
 * ## When it does not run
 *
 * Reduced motion (the swipe opens with a crossfade instead, S01 A), and from
 * `lg` up, where a listing is a panel beside the rail and nothing arrives from
 * the viewport's edge: there the swipe keeps its old nudge, and the route's
 * own transition carries the change. Also whenever the preview is not ready
 * yet (a swipe in the first moments of a reel): the same fallback.
 *
 * The DOM is written directly during a drag, as the old card nudge did: a
 * React render per pointer move on the screen that is playing video is what
 * the swipe hook was written to avoid.
 */

/** How long a reel is watched before its listing is built, in ms. */
export const DWELL_MS = 700;

/** How far the listing must come in to complete on release, of the width. */
export const COMMIT_SHARE = 0.25;
/** The reel moves this much of the listing's travel. */
const PARALLAX = 0.3;
/** How dark the reel gets under a listing that has fully arrived. */
const DIM = 0.25;
/** A flick: this fast leftward (px/ms) over at least this far (px). */
const FLICK_VELOCITY = 0.5;
const FLICK_TRAVEL = 40;
/** The shortest completion, as a share of the full 350ms. */
const MIN_SHARE = 0.45;
/** A route that never arrives: put the feed back rather than hold a screen. */
const LANDING_TIMEOUT_MS = 10_000;

export type PeekPhase =
  "idle" | "armed" | "dragging" | "opening" | "landing" | "closing";

export interface PeekState {
  /** The listing the preview is built for. */
  slug: string | null;
  href: string | null;
  /** The finger has brought it in at least once: its live parts may run. */
  shown: boolean;
  phase: PeekPhase;
}

const IDLE: PeekState = { slug: null, href: null, shown: false, phase: "idle" };

let state: PeekState = IDLE;
const listeners = new Set<() => void>();

function set(next: Partial<PeekState>) {
  state = { ...state, ...next };
  for (const listener of listeners) listener();
}

export function subscribePeek(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getPeek(): PeekState {
  return state;
}

export function getServerPeek(): PeekState {
  return IDLE;
}

/* ---------------------------------------------------------------- the DOM */

interface Parts {
  /** The preview: full screen, held off the right edge. */
  sheet: HTMLElement;
  /** The forest dim over the reel, under the preview. */
  dim: HTMLElement;
}

let parts: Parts | null = null;
/** The preview has rendered its listing (not only a skeleton). */
let contentReady = false;

/** Called by `ListingPeek` with its two layers; returns the release. */
export function registerPeek(next: Parts): () => void {
  parts = next;
  return () => {
    if (parts === next) parts = null;
  };
}

export function setPeekContentReady(ready: boolean): void {
  contentReady = ready;
}

const PHONE = "(width < 64rem)";

/** Whether the swipe may bring the listing in by the finger at all. */
export function peekAllowed(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function")
    return false;
  return window.matchMedia(PHONE).matches && !prefersReducedMotion();
}

/**
 * Build the preview for the listing of the reel on screen. Called once a reel
 * has been watched for {@link DWELL_MS}; a later reel replaces it, and a
 * preview in use is never swapped from under a finger.
 */
export function armPeek(slug: string, href: string): void {
  if (!peekAllowed()) return;
  if (state.phase !== "idle" && state.phase !== "armed") return;
  if (state.slug === slug && state.phase === "armed") return;
  set({ slug, href, shown: false, phase: "armed" });
}

/** Forget it: the strip went away, or the listing it was for did. */
export function disarmPeek(): void {
  if (state.phase === "armed") {
    hide();
    set(IDLE);
  }
}

/* ------------------------------------------------------------ the gesture */

export interface PeekSession {
  /** The finger has travelled `pull` px leftward since the swipe began. */
  drag(pull: number): void;
  /**
   * The finger lifted. Completes, then calls `navigate`, or springs back.
   * `velocity` is the last horizontal speed in px/ms, negative leftward.
   */
  release(pull: number, velocity: number, navigate: () => void): void;
  /** The browser took the gesture away: spring back. */
  cancel(): void;
}

let moving: { feed: HTMLElement | null; bar: HTMLElement | null } = {
  feed: null,
  bar: null,
};
let landingTimer: ReturnType<typeof setTimeout> | null = null;

function translate(el: HTMLElement | null, x: number) {
  if (el) el.style.transform = x ? `translate3d(${x.toFixed(2)}px, 0, 0)` : "";
}

/**
 * The x the element is drawn at right now, a running animation included, so
 * a motion that takes over continues from the frame the last one reached.
 */
function currentX(el: HTMLElement | null): number {
  if (!el) return 0;
  const drawn = getComputedStyle(el).transform;
  if (drawn && drawn !== "none" && typeof DOMMatrixReadOnly === "function") {
    try {
      return new DOMMatrixReadOnly(drawn).m41;
    } catch {
      // Not a matrix this engine can read; fall back to what was written.
    }
  }
  const written = /translate3d\(\s*(-?[\d.]+)px/.exec(el.style.transform);
  return written ? Number(written[1]) : 0;
}

function show(p: Parts) {
  p.sheet.style.visibility = "visible";
  p.sheet.style.contentVisibility = "visible";
  p.dim.style.visibility = "visible";
}

function hide() {
  if (!parts) return;
  const { sheet, dim } = parts;
  stopAnimations(sheet);
  stopAnimations(dim);
  sheet.style.visibility = "hidden";
  sheet.style.contentVisibility = "hidden";
  sheet.style.transform = "translate3d(100%, 0, 0)";
  sheet.style.opacity = "";
  dim.style.visibility = "hidden";
  dim.style.opacity = "0";
  dim.style.pointerEvents = "";
}

/** Put the reel and the bar back where they live, at once. */
function settleReel() {
  for (const el of [moving.feed, moving.bar]) {
    if (!el) continue;
    stopAnimations(el);
    el.style.transform = "";
    el.style.willChange = "";
  }
  moving = { feed: null, bar: null };
}

/**
 * Start bringing the listing in, from the card the finger is on; null when
 * the preview is not there to bring (the caller keeps its old behaviour).
 */
export function beginPeek(slug: string, from: Element): PeekSession | null {
  if (!parts || !contentReady || !peekAllowed()) return null;
  if (state.slug !== slug) return null;
  if (state.phase === "closing") {
    // A second swipe while the first springs back: start clean.
    hide();
    settleReel();
    set({ phase: "armed" });
  }
  if (state.phase !== "armed") return null;

  const p = parts;
  const width = window.innerWidth;
  moving = {
    feed: from.closest<HTMLElement>("[data-reel-screen]"),
    bar: document.querySelector<HTMLElement>("nav[data-tabbar]"),
  };
  for (const el of [moving.feed, moving.bar]) {
    if (el) el.style.willChange = "transform";
  }

  stopAnimations(p.sheet);
  stopAnimations(p.dim);
  p.sheet.style.transform = `translate3d(${width}px, 0, 0)`;
  show(p);
  set({ shown: true, phase: "dragging" });

  const place = (pull: number) => {
    const travel = Math.max(0, Math.min(width, pull));
    p.sheet.style.transform = `translate3d(${(width - travel).toFixed(2)}px, 0, 0)`;
    translate(moving.feed, -travel * PARALLAX);
    translate(moving.bar, -travel * PARALLAX);
    p.dim.style.opacity = String((travel / width) * DIM);
  };

  const springBack = () => {
    if (state.phase !== "dragging") return;
    set({ phase: "closing" });
    const options: KeyframeAnimationOptions = {
      duration: DURATION.standard,
      easing: EASE.move,
    };
    const from = currentX(p.sheet);
    const done = p.sheet.animate(
      [
        { transform: `translate3d(${from}px, 0, 0)` },
        { transform: `translate3d(${width}px, 0, 0)` },
      ],
      options,
    );
    p.sheet.style.transform = `translate3d(${width}px, 0, 0)`;
    for (const el of [moving.feed, moving.bar]) {
      if (!el) continue;
      const x = currentX(el);
      el.animate(
        [{ transform: `translate3d(${x}px, 0, 0)` }, { transform: "none" }],
        options,
      );
      el.style.transform = "";
    }
    const dimFrom = Number(p.dim.style.opacity) || 0;
    p.dim.animate([{ opacity: dimFrom }, { opacity: 0 }], options);
    p.dim.style.opacity = "0";
    done.finished.then(
      () => {
        if (state.phase !== "closing") return;
        hide();
        settleReel();
        set({ phase: "armed" });
      },
      () => {
        // Cancelled by a new swipe, which has already reset everything.
      },
    );
  };

  return {
    drag(pull) {
      if (state.phase === "dragging") place(pull);
    },
    release(pull, velocity, navigate) {
      if (state.phase !== "dragging") return;
      const opens =
        pull > width * COMMIT_SHARE ||
        (pull >= FLICK_TRAVEL && velocity <= -FLICK_VELOCITY);
      if (!opens) return springBack();

      set({ phase: "opening" });
      // Taps on the reel beneath must not land while the listing arrives.
      p.dim.style.pointerEvents = "auto";
      const remaining = Math.max(0, width - Math.max(0, pull));
      const options: KeyframeAnimationOptions = {
        duration: Math.round(
          DURATION.spatial * Math.max(MIN_SHARE, remaining / width),
        ),
        easing: EASE.cinematic,
      };
      const from = currentX(p.sheet);
      const arrived = p.sheet.animate(
        [
          { transform: `translate3d(${from}px, 0, 0)` },
          { transform: "translate3d(0px, 0, 0)" },
        ],
        options,
      );
      p.sheet.style.transform = "translate3d(0px, 0, 0)";
      for (const el of [moving.feed, moving.bar]) {
        if (!el) continue;
        const x = currentX(el);
        el.animate(
          [
            { transform: `translate3d(${x}px, 0, 0)` },
            { transform: `translate3d(${-width * PARALLAX}px, 0, 0)` },
          ],
          options,
        );
        el.style.transform = `translate3d(${-width * PARALLAX}px, 0, 0)`;
      }
      const dimFrom = Number(p.dim.style.opacity) || 0;
      p.dim.animate([{ opacity: dimFrom }, { opacity: DIM }], options);
      p.dim.style.opacity = String(DIM);

      arrived.finished.then(
        () => {
          if (state.phase !== "opening") return;
          set({ phase: "landing" });
          landingTimer = setTimeout(abandonLanding, LANDING_TIMEOUT_MS);
          navigate();
        },
        () => {},
      );
    },
    cancel: springBack,
  };
}

/* ------------------------------------------------------------- the landing */

/**
 * The listing's route has rendered under the preview. Called by `ListingPeek`
 * once the page's own picture is ready: the preview fades and goes, and
 * everything it moved is put back.
 */
export function finishLanding(): Promise<void> {
  if (state.phase !== "landing" || !parts) return Promise.resolve();
  if (landingTimer) clearTimeout(landingTimer);
  landingTimer = null;
  const p = parts;
  // The page is under the preview now, not the reel: no dim between them.
  stopAnimations(p.dim);
  p.dim.style.opacity = "0";
  p.dim.style.pointerEvents = "";
  settleReel();
  const fade = p.sheet.animate([{ opacity: 1 }, { opacity: 0 }], {
    duration: DURATION.quick,
    easing: EASE.exit,
  });
  p.sheet.style.opacity = "0";
  return fade.finished.then(
    () => {
      hide();
      set(IDLE);
    },
    () => {
      hide();
      set(IDLE);
    },
  );
}

/** The route went somewhere else, or never came: give the screen back. */
export function abandonLanding(): void {
  if (landingTimer) clearTimeout(landingTimer);
  landingTimer = null;
  if (state.phase === "idle") return;
  hide();
  settleReel();
  set(IDLE);
}
