"use client";

import { usePathname } from "next/navigation";
import { isFeedRoute, isFocusedRoute } from "@/lib/site/nav";
import { useFeedStore } from "@/lib/feed/store";
import { NavList } from "./nav-items";

/**
 * The floating tab bar — a forest pill detached from the foot of the phone.
 *
 * Fixed rather than in flow, so the feed can be truly full-bleed beneath it;
 * every tab root pays for that with `tabbar-clearance` (see `Screen`). It is
 * absent on a focused route, where the screen carries its own way back and
 * its own action bar, and absent from `lg` up, where the rail takes over.
 *
 * The wrapper is inert so the strip beside the pill still scrolls the feed.
 *
 * ## It retracts on the feed, and only on the feed
 *
 * A traveller moving DOWN the reels is watching, not navigating, so the bar
 * drops out of the window and the card takes the room back; moving UP one
 * reel brings it straight back. The rule itself is one line in the feed store
 * — see `setActiveIndex` — and this component only draws it.
 *
 * TWO conditions, and the second is not redundant. The flag lives in a module
 * store that outlives any component, so `isFeedRoute` is what guarantees that
 * a value left behind by a feed can never take the navigation off a different
 * screen. `Feed` clears it on unmount as well; belt and braces, because the
 * failure mode here is an app with no way to get anywhere.
 *
 * It is TRANSLATED, never unmounted or hidden — see `.tabbar-slide` for why
 * a keyboard traveller can still tab straight to it.
 */
export function TabBar() {
  const pathname = usePathname();
  const chromeRetracted = useFeedStore((s) => s.chromeRetracted);

  if (isFocusedRoute(pathname)) return null;

  const retracted = chromeRetracted && isFeedRoute(pathname);

  return (
    <nav
      aria-label="Primary"
      data-retracted={retracted ? "true" : "false"}
      className="tabbar-foot tabbar-slide pointer-events-none fixed inset-x-0 bottom-0 z-30 flex justify-center px-4 lg:hidden"
    >
      <div className="app-chrome ring-cream/12 pointer-events-auto rounded-full p-1.5 ring-1">
        <NavList orientation="bar" />
      </div>
    </nav>
  );
}
