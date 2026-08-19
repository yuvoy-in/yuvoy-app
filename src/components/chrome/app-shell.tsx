import type { ReactNode } from "react";
import { NavList } from "./nav-items";
import { Wordmark } from "@/components/ui/wordmark";

/**
 * The app chassis.
 *
 * Mobile is the phone product: full-bleed content on the media ground, with a
 * tab bar pinned to the foot. Desktop is the same product with the navigation
 * moved to a rail, so the feed column can stay 9:16 and capped rather than
 * stretching — an upscaled phone video across 1200px looks like a mistake,
 * which is why Instagram's web feed does the same thing.
 *
 * Chrome is `forest`, never `abyss`. The 1.47:1 between them is what separates
 * the controls from the picture behind them.
 */
export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="bg-abyss on-abyss flex min-h-dvh flex-col lg:flex-row">
      {/* Desktop rail. Hidden below lg, where the tab bar takes over. */}
      <aside className="app-chrome border-cream/10 hidden w-56 shrink-0 flex-col border-r lg:flex">
        <div className="px-4 py-6">
          <Wordmark tone="cream" className="h-7" />
        </div>
        <nav aria-label="Primary" className="px-2">
          <NavList orientation="rail" />
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile masthead. The rail carries the mark on desktop. */}
        <header className="app-chrome flex h-14 items-center px-5 lg:hidden">
          <Wordmark tone="cream" className="h-6" />
        </header>

        <main id="main" className="min-w-0 flex-1">
          {children}
        </main>

        {/* Mobile tab bar. `tabbar-foot` handles the safe area. */}
        <nav
          aria-label="Primary"
          className="app-chrome tabbar-foot border-cream/10 sticky bottom-0 z-30 border-t pt-1 lg:hidden"
        >
          <NavList orientation="bar" />
        </nav>
      </div>
    </div>
  );
}
