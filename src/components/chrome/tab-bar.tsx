"use client";

import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";
import { isFocusedRoute, isMediaGroundRoute } from "@/lib/site/nav";
import { NavList } from "./nav-items";
import { ViewTransition } from "@/lib/motion/view-transition";
import { BAR_MOTION } from "@/lib/motion/route-motion";

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
 * ## It used to retract on the feed, and no longer does
 *
 * Moving DOWN a reel dropped the bar out of the window and moving up brought
 * it back, so a traveller watching got the whole screen. The owner ruled
 * against it on 13 September (yuvoy-app#36): "the tab bar must stay visible on
 * every reel." The flag, the store rule, the slide and the masthead fade are
 * all gone rather than left switched off, so there is nothing here to
 * re-enable by accident. The reel's own overlay was cut back in the same
 * change, which is what buys the picture its room instead.
 */
export function TabBar() {
  const pathname = usePathname();

  if (isFocusedRoute(pathname)) return null;

  /*
    Translucent over a moving picture, solid over a paper sheet.

    See `isMediaGroundRoute` for the measurement. In short: on the reel screens
    the pill lets the caption scrim's dark foot through and the inactive glyphs
    measure about 6.6:1; over a paper sheet the same pill puts them at 2.62:1,
    under the 3:1 floor. It is one conditional and it is the difference between
    a bar that sits into the feed and a regression on Trips in sunlight.
  */
  const onMedia = isMediaGroundRoute(pathname);

  return (
    /*
      The bar leaves when a traveller goes into a focused screen and comes
      back with them (T01 C: it steps down 16px and fades, and up again).
      Between two tab roots it never leaves, so it glides instead (T04 B).
    */
    <ViewTransition {...BAR_MOTION}>
      <nav
        aria-label="Primary"
        data-tabbar=""
        className="tabbar-foot pointer-events-none fixed inset-x-0 bottom-0 z-30 flex justify-center px-4 lg:hidden"
      >
        {/*
          The pill, and its ground drawn apart from it. The ground is what
          the glide stretches when the open destination's width changes (see
          `tab-glide.ts`); the row inside is never scaled. Same surface, same
          hairline ring as when the pill painted itself.
        */}
        <div
          data-tabbar-pill=""
          className="pointer-events-auto relative isolate rounded-full p-1.5"
        >
          <span
            aria-hidden="true"
            data-tabbar-ground=""
            className={cn(
              "tabbar-ground ring-paper/12 rounded-full ring-1",
              onMedia ? "tabbar-on-media" : "app-chrome",
            )}
          />
          <NavList orientation="bar" />
        </div>
      </nav>
    </ViewTransition>
  );
}
