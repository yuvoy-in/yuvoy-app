/**
 * The navigation registry — the single source of truth for every navigable
 * route. The tab bar and the desktop rail are both derived from it.
 *
 * A route is added here in the same PR that ships its page, never before.
 * That makes a link to a non-existent page structurally impossible, and it is
 * the rule the marketing site already runs on.
 *
 * Four destinations, from the approved prototype's tab bar. Adding a fifth is
 * a design change, not a routing one: five targets in a phone-width bar is a
 * toolbar, and the e2e suite pins the count so it cannot arrive by accident.
 */

export interface NavItem {
  href: string;
  label: string;
  /** Matched as a prefix so `/e/some-slug` still highlights Feed. */
  match: (pathname: string) => boolean;
}

export const NAV: readonly NavItem[] = [
  {
    href: "/",
    label: "Feed",
    match: (p) => p === "/" || p.startsWith("/e/"),
  },
  {
    href: "/search",
    label: "Search",
    match: (p) => p.startsWith("/search"),
  },
  {
    href: "/trips",
    label: "Trips",
    match: (p) => p.startsWith("/trips") || p.startsWith("/booking"),
  },
  {
    href: "/account",
    label: "Account",
    match: (p) => p.startsWith("/account"),
  },
] as const;
