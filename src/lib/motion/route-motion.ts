import { isFocusedRoute, isMediaGroundRoute } from "@/lib/site/nav";

/**
 * How a screen change moves (the motion system, approved 4 Oct 2026: T01 C
 * and A, T02 C, T03 B; the study is yuvoy/motion-lab).
 *
 * ## One word per navigation, decided here
 *
 * A screen change is a React view transition, and every one carries exactly
 * ONE type, worked out from the two routes by {@link routeMotion}. The screens
 * never decide: `Screen`, the reel strip and the tab bar each say how they
 * answer each type (the maps below), and the stylesheet says what each answer
 * looks like (`globals.css`, "motion: screen changes").
 *
 * A navigation with no type does not move at all, and that is deliberate for
 * three kinds: the browser's own back and forward (iOS Safari draws its own
 * swipe, and a second animation on top of it is the classic double slide), a
 * query changing on the same screen (a search being typed), and the redirects
 * the app makes for itself after an action.
 *
 * ## The words
 *
 * - `deeper`: into a screen a traveller goes INTO (T01 C). The stage stays;
 *   the old sheet's words leave it, the new sheet rises 32px and fades in, and
 *   the tab bar steps down.
 * - `back`: out again, by a Back control (T01 C reversed): the sheet drops
 *   away, the screen behind it fades back, the bar steps up.
 * - `sideways`: between places at the same depth, the tab roots above all
 *   (T01 A): the old fades out, the new fades in, nothing moves.
 * - `reel-open` / `reel-back`: from a reel to its listing, which is the page
 *   to the right of the reel (T02 C), and back.
 * - `picture` / `picture-back`: from a saved picture to the listing that leads
 *   with it, the picture flying to the hero (T03 B), and home again.
 */
export const MOTION = {
  deeper: "deeper",
  back: "back",
  sideways: "sideways",
  reelOpen: "reel-open",
  reelBack: "reel-back",
  picture: "picture",
  pictureBack: "picture-back",
} as const;

export type RouteMotion = (typeof MOTION)[keyof typeof MOTION];

const LISTING = /^\/e\/[^/]+$/;

/**
 * The pathname of an in-app href, or null for anything that is not one: an
 * address on another origin, a bare fragment, an empty string. Only a path is
 * ours to animate into.
 */
export function pathOf(href: string): string | null {
  if (!href.startsWith("/") || href.startsWith("//")) return null;
  const cut = href.search(/[?#]/);
  return cut === -1 ? href : href.slice(0, cut) || "/";
}

/** A screen whose ground is a moving picture: the feed and its siblings. */
function isReelScreen(path: string): boolean {
  return isMediaGroundRoute(path);
}

/**
 * The type for a navigation from `from` to `href`, or null for one that should
 * not move (see the module note). `back` is set by the controls that step
 * back; everything else is a step forward.
 */
export function routeMotion(
  from: string | null | undefined,
  href: string,
  { back = false }: { back?: boolean } = {},
): RouteMotion | null {
  const to = pathOf(href);
  const here = from ? pathOf(from) : null;
  if (!here || !to || to === here) return null;

  if (back) {
    // The reel was always to the left of the page about it.
    if (isReelScreen(to)) return MOTION.reelBack;
    // A reel has no sheet to drop; leaving one is a change of place.
    if (isReelScreen(here)) return MOTION.sideways;
    if (to === "/saved" && LISTING.test(here)) return MOTION.pictureBack;
    return MOTION.back;
  }

  if (isReelScreen(here) && LISTING.test(to)) return MOTION.reelOpen;
  if (here === "/saved" && LISTING.test(to)) return MOTION.picture;
  if (isFocusedRoute(to)) return MOTION.deeper;
  return MOTION.sideways;
}

/*
  How each part of a screen answers each type. Every map ends in
  `default: "none"`, so anything not named here (a Suspense boundary
  revealing, a refresh, a browser traversal) leaves that part alone.
*/

/**
 * The strip above a sheet: a screen's header, or its picture and the discs on
 * it. Between two tab roots it is the same header, so it does not move at all.
 */
export const STAGE_MOTION = {
  enter: {
    deeper: "vt-stage-in",
    picture: "vt-stage-in",
    back: "vt-stage-in",
    "picture-back": "vt-stage-in",
    "reel-open": "vt-push-in",
    default: "none",
  },
  exit: {
    deeper: "vt-stage-out",
    picture: "vt-stage-out",
    back: "vt-stage-out-slow",
    "picture-back": "vt-stage-out-slow",
    "reel-back": "vt-push-out",
    default: "none",
  },
  default: "none",
} as const;

/** The paper sheet: the reading surface of every screen but a reel. */
export const SHEET_MOTION = {
  enter: {
    deeper: "vt-sheet-rise",
    picture: "vt-sheet-rise",
    back: "vt-sheet-return",
    "picture-back": "vt-sheet-return",
    sideways: "vt-fade-in",
    "reel-open": "vt-push-in",
    default: "none",
  },
  exit: {
    deeper: "vt-sheet-hold",
    picture: "vt-sheet-hold",
    back: "vt-sheet-drop",
    "picture-back": "vt-sheet-drop",
    sideways: "vt-sheet-hold",
    "reel-back": "vt-push-out",
    default: "none",
  },
  default: "none",
} as const;

/** A reel screen: the feed, a shared reel, a search result, saves, a business's reels. */
export const REEL_MOTION = {
  enter: {
    deeper: "vt-fade-in",
    sideways: "vt-fade-in",
    "reel-back": "vt-reel-return",
    default: "none",
  },
  exit: {
    deeper: "vt-fade-out",
    sideways: "vt-fade-out",
    "reel-open": "vt-reel-leave",
    "reel-back": "vt-push-out",
    default: "none",
  },
  default: "none",
} as const;

/**
 * The floating tab bar, which a focused screen does not have. It only enters
 * and leaves; between two tab roots it stays where it is and glides (T04 B).
 */
export const BAR_MOTION = {
  enter: {
    back: "vt-bar-in",
    "picture-back": "vt-bar-in",
    sideways: "vt-bar-in",
    "reel-back": "vt-reel-return",
    default: "none",
  },
  exit: {
    deeper: "vt-bar-out",
    picture: "vt-bar-out",
    sideways: "vt-bar-out",
    "reel-open": "vt-reel-leave",
    default: "none",
  },
  default: "none",
} as const;

/**
 * The saved picture and the listing's frame showing the same picture: one
 * object (T03 B). Shared only for the two picture types, so the name never
 * pairs two screens anything else connects.
 */
export const PICTURE_MOTION = {
  share: {
    picture: "vt-picture",
    "picture-back": "vt-picture-home",
    default: "none",
  },
  default: "none",
} as const;

/** The name the saved picture and the listing's frame share. */
export function pictureName(mediaId: string): string {
  // A view-transition name is a CSS identifier: keep it to safe characters.
  return `picture-${mediaId.replace(/[^a-zA-Z0-9_-]/g, "_")}`;
}
