"use client";

import NextLink from "next/link";
import { usePathname } from "next/navigation";
import type { ComponentProps } from "react";
import { routeMotion, type RouteMotion } from "@/lib/motion/route-motion";

type NextLinkProps = ComponentProps<typeof NextLink>;

export type LinkProps = NextLinkProps & {
  /**
   * This link steps BACK (a Back control). The type is still worked out from
   * the two routes, as a step back rather than a step forward.
   */
  back?: boolean;
  /**
   * Say the motion outright instead of working it out; "none" for a link
   * whose screen change should not move. Rarely right: the routes usually
   * know.
   */
  motion?: RouteMotion | "none";
};

/** The path an href leads to, for the motion's sake only. */
function target(href: NextLinkProps["href"]): string {
  if (typeof href === "string") return href;
  return href.pathname ?? "";
}

/**
 * The app's link: Next's own, carrying the type of its screen change.
 *
 * Every in-app link goes through here (ESLint refuses `next/link` anywhere
 * else), so every screen change a tap makes moves by the same rules, decided
 * once from the route registry in `lib/motion/route-motion.ts`. Nothing else
 * about Next's link changes: prefetching, scrolling, `replace`, `onNavigate`,
 * a new tab on a modified click.
 *
 * The type is only ever used by a client-side navigation. A link that leaves
 * the app, opens a new tab or is followed with a modifier never reaches a
 * transition, and Next drops the prop from the anchor.
 */
export default function Link({
  back = false,
  motion,
  transitionTypes,
  href,
  ...props
}: LinkProps) {
  const pathname = usePathname();
  const type =
    motion === "none"
      ? null
      : (motion ?? routeMotion(pathname, target(href), { back }));
  return (
    <NextLink
      href={href}
      transitionTypes={transitionTypes ?? (type ? [type] : undefined)}
      {...props}
    />
  );
}
