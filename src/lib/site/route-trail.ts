import { useSyncExternalStore } from "react";

/**
 * Where the traveller came from, so Back can return there (the approved
 * redesign, traveller A, 3 Oct 2026: "Back returns to where you came from,
 * not always the feed").
 *
 * ## Still a link, never `history.back()`
 *
 * The rule `BackButton` states holds: Back is a plain link to a destination it
 * can name. `history.back()` leaves the app for a traveller who arrived from a
 * shared link or a search result, and where it goes cannot be told to a screen
 * reader before it is pressed. This only decides WHICH destination: the screen
 * of ours the traveller came from, when it is one Back knows how to name
 * (`originOf`), and otherwise the screen's own stated fallback.
 *
 * ## A trail, not "the previous route"
 *
 * Remembering only the previous route makes two screens that lead to each
 * other a loop: listing, then the business's page, then Back to the listing,
 * whose "previous route" is now the business's page. So this keeps the trail
 * of screens, and a STEP BACK (our Back link, or the browser's own back
 * button) onto the screen just before the current one takes the current one
 * off rather than adding another. A tap on an ordinary link is always a step
 * forward, even onto a screen already in the trail: a traveller who opens the
 * business's page and then taps the listing they came from is now on that
 * listing FROM the business, and Back should say so.
 *
 * ## In memory, and nothing else
 *
 * A reload starts a fresh trail, and Back falls back to the screen's own
 * target, exactly as for a traveller who arrived from outside. Nothing is
 * written to storage: where somebody has been is not ours to keep.
 */

export interface Visit {
  /** The pathname alone: what makes two visits the same screen. */
  path: string;
  /** Pathname and query, so a step back to search keeps the search. */
  href: string;
}

export interface TrailState {
  /** Oldest first. The last entry is the screen on screen, once recorded. */
  trail: readonly Visit[];
  /** The next visit is a step back: Back was pressed, or the browser's back. */
  stepBack: boolean;
}

/** Far more than anybody walks; it only stops the array growing for ever. */
const MAX_TRAIL = 50;

export const EMPTY_TRAIL: TrailState = { trail: [], stepBack: false };

function pathOf(href: string): string {
  const cut = href.search(/[?#]/);
  return cut === -1 ? href : href.slice(0, cut);
}

/** Pure: the trail after a visit to `href`. */
export function visit(state: TrailState, href: string): TrailState {
  const path = pathOf(href);
  const { trail } = state;
  const top = trail.at(-1);

  // The same screen with a new query (a search typed): the latest one stands.
  if (top?.path === path) {
    if (top.href === href && !state.stepBack) return state;
    return { trail: [...trail.slice(0, -1), { path, href }], stepBack: false };
  }

  const before = trail.at(-2);
  if (state.stepBack && before?.path === path) {
    return { trail: [...trail.slice(0, -2), { path, href }], stepBack: false };
  }

  return {
    trail: [...trail, { path, href }].slice(-MAX_TRAIL),
    stepBack: false,
  };
}

/**
 * Pure: the href of the screen before `pathname`, or null.
 *
 * Correct before the visit is recorded as well as after it. The screen
 * renders before the recorder's effect runs, so on its first render the
 * trail's last entry is still the screen the traveller left; this works out
 * what the trail is about to be rather than reading a stale one.
 */
export function cameFrom(state: TrailState, pathname: string): string | null {
  const settled =
    state.trail.at(-1)?.path === pathname ? state : visit(state, pathname);
  return settled.trail.at(-2)?.href ?? null;
}

/**
 * The screens Back may return to, and what it calls them ("Back to search").
 *
 * An allowlist rather than "wherever they were": a checkout, a recovery step
 * or a redirect is not a place anybody wants to be sent back into, and every
 * name here is one a screen reader user can act on before pressing it.
 */
const ORIGINS: readonly { pattern: RegExp; label: string }[] = [
  { pattern: /^\/$/, label: "the feed" },
  { pattern: /^\/search$/, label: "search" },
  { pattern: /^\/search\/r\/[^/]+$/, label: "the reel" },
  { pattern: /^\/r\/[^/]+$/, label: "the reel" },
  { pattern: /^\/saved$/, label: "your saved experiences" },
  { pattern: /^\/e\/[^/]+$/, label: "the listing" },
  { pattern: /^\/o\/[^/]+$/, label: "the business's page" },
  { pattern: /^\/o\/[^/]+\/listings$/, label: "what they run" },
  { pattern: /^\/o\/[^/]+\/r\/[^/]+$/, label: "their reels" },
  { pattern: /^\/trips$/, label: "your trips" },
  { pattern: /^\/booking$/, label: "your booking" },
  { pattern: /^\/guides$/, label: "guides" },
  { pattern: /^\/guides\/[^/]+$/, label: "the guide" },
  { pattern: /^\/account$/, label: "your account" },
  { pattern: /^\/help$/, label: "help" },
];

/** Where Back goes for this origin, and its name; null when it is not one. */
export function originOf(href: string): { href: string; label: string } | null {
  const path = pathOf(href);
  const origin = ORIGINS.find(({ pattern }) => pattern.test(path));
  return origin ? { href, label: origin.label } : null;
}

/* The store: module state, because the trail outlives every screen. */

let state: TrailState = EMPTY_TRAIL;
const listeners = new Set<() => void>();

function set(next: TrailState) {
  if (next === state) return;
  state = next;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Called by `RouteTrail` on every change of route or query. `traversed` says
 * the change is the browser's own back or forward, seen from inside the event
 * (see `RouteTrail` for why that cannot wait for `markStepBack`).
 */
export function recordVisit(href: string, traversed = false) {
  set(visit(traversed ? { ...state, stepBack: true } : state, href));
}

/**
 * The next visit is a step back: our Back link was pressed, or the browser
 * traversed its history. `landedOn` is given for the browser's case, where a
 * traversal that only moved the fragment (a "#cancellation" link, then the
 * back button) stays on this screen and is not a step anywhere.
 */
export function markStepBack(landedOn?: string) {
  if (landedOn !== undefined && state.trail.at(-1)?.path === landedOn) return;
  if (!state.stepBack) set({ ...state, stepBack: true });
}

/**
 * The href of the screen before this one, or null.
 *
 * Null on the server and through hydration (`EMPTY_TRAIL`), so the first paint
 * of a loaded page always shows the screen's own fallback, as the server
 * rendered it. There is no trail on a hard load anyway: the page IS the first
 * visit, so nothing is lost by it.
 */
export function useCameFrom(pathname: string | null): string | null {
  const current = useSyncExternalStore(
    subscribe,
    () => state,
    () => EMPTY_TRAIL,
  );
  // No pathname is no router to have walked through: there is no trail.
  return pathname ? cameFrom(current, pathname) : null;
}
