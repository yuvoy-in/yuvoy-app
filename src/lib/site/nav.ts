/**
 * The navigation registry — the single source of truth for every navigable
 * route. The floating tab bar and the desktop rail are both derived from it.
 *
 * A route is added here in the same PR that ships its page, never before.
 * That makes a link to a non-existent page structurally impossible, and it is
 * the rule the marketing site already runs on.
 *
 * Four destinations, from the approved prototype's tab bar. Adding a fifth is
 * a design change, not a routing one: five targets in a phone-width bar is a
 * toolbar, and the e2e suite pins the count so it cannot arrive by accident.
 */

export type NavIcon = "feed" | "search" | "trips" | "account";

/**
 * Something a destination can carry a dot for.
 *
 * One today: a reply on a trip the traveller has not read (yuvoy-api#207).
 * Named here, beside the destination it belongs to, so the chrome asks the
 * registry which item carries it rather than recognising Trips by its href.
 */
export type NavSignal = "unreadTrips";

export interface NavItem {
  href: string;
  label: string;
  /** Which glyph the bar and the rail draw; the components own the drawing. */
  icon: NavIcon;
  /** Matched as a prefix so `/e/some-slug` still highlights Feed. */
  match: (pathname: string) => boolean;
  /** A dot this destination may carry. See {@link NavSignal}. */
  signal?: NavSignal;
}

export const NAV: readonly NavItem[] = [
  {
    href: "/",
    label: "Feed",
    icon: "feed",
    match: (p) => p === "/" || p.startsWith("/e/"),
  },
  {
    href: "/search",
    label: "Search",
    icon: "search",
    match: (p) => p.startsWith("/search"),
  },
  {
    href: "/trips",
    label: "Trips",
    icon: "trips",
    match: (p) => p.startsWith("/trips") || p.startsWith("/booking"),
    signal: "unreadTrips",
  },
  {
    href: "/account",
    label: "Account",
    icon: "account",
    match: (p) => p.startsWith("/account"),
  },
] as const;

/**
 * Routes that exist and are linked, but are NOT tab destinations.
 *
 * The tab bar names four things and a fifth is a design change, not a routing
 * one — so guides live here instead. They are reachable from the rail's
 * secondary list, from each other, and from the sitemap, and on a phone, which
 * never draws the rail, from Search before anything is typed and from Account
 * beside Saved (yuvoy-app#116 item 3: "the search prompt" this named had gone
 * when Search started opening on the grid, so a phone had no way in).
 */
export const SECONDARY_ROUTES = [{ href: "/guides", label: "Guides" }] as const;

/**
 * FOCUSED routes: the screens a traveller goes INTO rather than between.
 *
 * On a phone these hide the floating tab bar and carry a back control and,
 * where there is one, a sticky price bar — the shape every reference detail
 * screen takes (owner decision, 2026-09-02). Tab roots keep the bar; the
 * desktop rail stays on every route.
 *
 * Prefix-matched. `/trips/recover` is listed before the `/trips` tab would
 * catch it because it is a step inside Trips, not the tab itself; `/guides/`
 * with the slash is one guide, while `/guides` is the hub and keeps the bar.
 */
export const FOCUSED_ROUTE_PREFIXES = [
  "/e/",
  "/booking",
  "/trip/",
  "/trips/recover",
  /*
    A trip somebody was invited on. Every branch of the screen draws a Back
    to Trips, which drops the bar's clearance, and the bar floated over it:
    the pill covered the foot of the sheet and, scrolled to the end, the
    centred Decline sat under it (stability audit, 6 Oct 2026).
  */
  "/trips/invited/",
  "/guides/",
  "/offline",
  /*
    A business's pages: the profile, what they run, and one of their reels.

    The profile itself used to keep the bar, as a destination of its own
    (yuvoy-app#33), with only the two pages inside it focused. The approved
    redesign (traveller A, 3 Oct 2026) made it a place a traveller goes INTO
    from a listing or a search, with a way back to wherever that was, so all
    three are focused now.

    `*` matches one path segment, because the slug sits in the middle. The same
    wildcard `PRIVATE_ROUTES` uses for `/e/*​/book`, and the reason
    `isFocusedRoute` is not a plain `startsWith` any more. As a prefix it also
    covers the two pages below the profile.
  */
  "/o/*",
  // A search result, playing. `/search` itself is a tab root and keeps the bar.
  "/search/r/",
  /*
    The wishlist. A place a traveller goes INTO from Account, with its own way
    back, and not one of the four they move between. It is deliberately not a
    fifth tab: the bar answers "where do I go most often", and a wishlist is
    where somebody goes once they already have saves. See `saved-screen`.
  */
  "/saved",
  /*
    The Help Center. A place a traveller goes INTO when something is wrong,
    with its own way back. Not a tab, and not a tab root.
  */
  "/help",
] as const;

/**
 * Routes whose ground is the MEDIA rather than a paper sheet.
 *
 * The feed, a shared reel, a search result played in place, a business's own
 * reels, and a traveller's saves playing: on all five the ground is `abyss`
 * and a moving picture. Everywhere else it is a paper sheet.
 *
 * ## Why this exists, and why it is not `pathname === "/"`
 *
 * The bar is translucent so it sits INTO the picture rather than on top of it,
 * and translucency is a property of the bar on a dark ground, not of the bar.
 * Over a paper sheet the arithmetic inverts: the inactive glyphs are `paper/70`
 * on a pill that is now letting the sheet through, and they measure **2.62:1**
 * against the 3:1 non-text floor. On the media ground the same glyphs measure
 * about 6.6:1, because what shows through is the caption scrim's own dark foot.
 *
 * So the pill is translucent here and solid everywhere else, and the list is
 * every such route rather than the one, because they all have the same ground
 * and would otherwise disagree with each other.
 *
 * `palette.test.ts` pins the measurement; this pins which routes it applies to.
 */
export const MEDIA_GROUND_ROUTES = [
  "/",
  "/r/",
  "/search/r/",
  "/o/*/r/",
  // A traveller's saves, playing (the approved redesign, 3 Oct 2026).
  "/saved/r/",
] as const;

export function isMediaGroundRoute(
  pathname: string | null | undefined,
): boolean {
  if (!pathname) return false;
  if (pathname === "/") return true;
  return MEDIA_GROUND_ROUTES.some(
    (prefix) => prefix !== "/" && matches(prefix, pathname),
  );
}

export function isFocusedRoute(pathname: string | null | undefined): boolean {
  if (!pathname) return false;
  return FOCUSED_ROUTE_PREFIXES.some((prefix) => matches(prefix, pathname));
}

/**
 * A prefix against a pathname, where `*` is exactly one path segment.
 *
 * Plain `startsWith` was enough while every focused route began with a fixed
 * word. `/o/{slug}/listings` does not: the variable part is in the MIDDLE, and
 * a prefix of `/o/` would take the bar off the business's profile too, which
 * is a tab-less destination rather than a step inside one.
 *
 * Deliberately not a regex built from the string. A `*` is the only thing this
 * needs to express, and the moment the prefixes become patterns somebody
 * writes one with a `.` in it and it silently matches more than it says.
 */
function matches(prefix: string, pathname: string): boolean {
  if (!prefix.includes("*")) return pathname.startsWith(prefix);

  const wanted = prefix.split("/");
  const actual = pathname.split("?")[0].split("/");
  if (actual.length < wanted.length) return false;

  return wanted.every((segment, i) => {
    // A prefix ending in "/" splits to a trailing "", which matches anything
    // after it — that is what makes it a prefix rather than a whole path.
    if (segment === "" && i === wanted.length - 1) return true;
    return segment === "*" || segment === actual[i];
  });
}
