import type { ReactNode } from "react";
import Link from "next/link";
import { NavList } from "./nav-items";
import { TabBar } from "./tab-bar";
import { Wordmark } from "@/components/ui/wordmark";
import { BookIcon } from "@/components/ui/icons";
import { SECONDARY_ROUTES } from "@/lib/site/nav";
import { LoginButton } from "@/components/auth/login-button";

/**
 * The app chassis (v2.7).
 *
 * The forest STAGE is the ground on every viewport. On a phone each screen
 * stands a paper sheet on it and the floating tab bar sits over the foot; the
 * feed alone fills the stage edge to edge with its media ground. On a desktop
 * the navigation moves to a rail and each sheet becomes a panel floating on
 * the stage, so the feed column can stay 9:16 and capped rather than
 * stretching — an upscaled phone video across 1200px looks like a mistake,
 * which is why Instagram's web feed does the same thing.
 *
 * The rail is PINNED to the viewport; only the column beside it scrolls. It
 * used to be an ordinary flex item, which cost two things on any page taller
 * than the window. It scrolled away, so a guide article left the reader with
 * no navigation at all after the first screenful. And because a flex item
 * stretches to its row, the rail was as tall as the DOCUMENT — 2835px on that
 * article — so `mt-auto` pinned Guides to the bottom of the document rather
 * than the bottom of the window, two thousand pixels below the fold.
 *
 * `sticky` rather than `fixed`: it keeps the rail in flow, so the row goes on
 * reserving its 256px and there is no padding on the sibling to keep in sync
 * with the width. `h-dvh` is what stops the stretch and gives `mt-auto` the
 * window to work against; `overflow-y-auto` is for the short window where the
 * rail's own contents do not fit.
 *
 * Chrome is `forest`, never `abyss`. The 1.47:1 between them is what
 * separates the controls from the picture behind them.
 */
export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="stage on-dark flex min-h-dvh flex-col lg:flex-row">
      {/* Desktop rail. Hidden below lg, where the floating bar takes over. */}
      <aside className="app-chrome border-paper/10 hidden w-64 shrink-0 flex-col border-r lg:sticky lg:top-0 lg:flex lg:h-dvh lg:overflow-y-auto">
        <div className="px-6 py-7">
          <Wordmark tone="paper" className="h-8" priority />
        </div>
        <nav aria-label="Primary" className="px-3">
          <NavList orientation="rail" />
        </nav>
        {/*
          Not a fifth destination. Guides are reading, not doing, and the tab
          bar names four things — so they sit below the four, in their own
          list, on the one viewport with room for it.
        */}
        <nav aria-label="More" className="mt-auto px-3 pb-6">
          <ul>
            {SECONDARY_ROUTES.map((route) => (
              <li key={route.href}>
                <Link
                  href={route.href}
                  className="text-paper/70 hover:bg-paper/8 hover:text-paper ease-interaction flex h-11 items-center gap-3 rounded-full px-4 transition-[background-color,color] duration-200"
                >
                  <BookIcon className="size-5" />
                  <span className="label font-bold">{route.label}</span>
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </aside>

      <div className="relative flex min-w-0 flex-1 flex-col">
        {/*
          The desktop Login, in one place for every page (yuvoy-app#56 item 4).

          It cannot live in `Screen`'s header, because that strip is
          `lg:hidden` on a tab root: the rail carries the mark up here. And the
          feed has no `Screen` at all. Putting it on the shell is what makes it
          the same position on every page rather than three positions that
          drift apart.

          `pointer-events-none` on the wrapper so a full-bleed reel still takes
          a click anywhere behind it; only the button itself takes one.
        */}
        <div className="pointer-events-none absolute top-7 right-8 z-30 hidden lg:block">
          <div className="pointer-events-auto">
            <LoginButton />
          </div>
        </div>
        <main id="main" className="flex min-w-0 flex-1 flex-col">
          {children}
        </main>
        <TabBar />
      </div>
    </div>
  );
}
