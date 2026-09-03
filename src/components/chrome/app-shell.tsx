import type { ReactNode } from "react";
import Link from "next/link";
import { NavList } from "./nav-items";
import { TabBar } from "./tab-bar";
import { Wordmark } from "@/components/ui/wordmark";
import { BookIcon } from "@/components/ui/icons";
import { SECONDARY_ROUTES } from "@/lib/site/nav";

/**
 * The app chassis (v2.7).
 *
 * The forest STAGE is the ground on every viewport. On a phone each screen
 * stands a cream sheet on it and the floating tab bar sits over the foot; the
 * feed alone fills the stage edge to edge with its media ground. On a desktop
 * the navigation moves to a rail and each sheet becomes a panel floating on
 * the stage, so the feed column can stay 9:16 and capped rather than
 * stretching — an upscaled phone video across 1200px looks like a mistake,
 * which is why Instagram's web feed does the same thing.
 *
 * Chrome is `forest`, never `abyss`. The 1.47:1 between them is what
 * separates the controls from the picture behind them.
 */
export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="stage on-dark flex min-h-dvh flex-col lg:flex-row">
      {/* Desktop rail. Hidden below lg, where the floating bar takes over. */}
      <aside className="app-chrome border-cream/10 hidden w-64 shrink-0 flex-col border-r lg:flex">
        <div className="px-6 py-7">
          <Wordmark tone="cream" className="h-10" priority />
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
                  className="text-cream/70 hover:bg-cream/8 hover:text-cream ease-interaction flex h-11 items-center gap-3 rounded-full px-4 transition-[background-color,color] duration-200"
                >
                  <BookIcon className="size-5" />
                  <span className="label font-bold">{route.label}</span>
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <main id="main" className="flex min-w-0 flex-1 flex-col">
          {children}
        </main>
        <TabBar />
      </div>
    </div>
  );
}
