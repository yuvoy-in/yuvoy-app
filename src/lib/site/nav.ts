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

export interface NavItem {
  href: string;
  label: string;
  /** Which glyph the bar and the rail draw; the components own the drawing. */
  icon: NavIcon;
  /** Matched as a prefix so `/e/some-slug` still highlights Feed. */
  match: (pathname: string) => boolean;
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
 * secondary list, from the search prompt, from each other, and from the
 * sitemap.
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
  "/guides/",
  "/offline",
] as const;

export function isFocusedRoute(pathname: string | null | undefined): boolean {
  if (!pathname) return false;
  return FOCUSED_ROUTE_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}
