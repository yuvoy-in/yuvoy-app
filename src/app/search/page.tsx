import type { Metadata } from "next";

export const metadata: Metadata = { title: "Search" };

/**
 * T2's search tab. Ships with date-first discovery (bookableOn) in Phase 1.
 *
 * Deliberately a stated placeholder rather than a fabricated screen. The nav
 * registry ships a route with its page, and a tab that leads nowhere is worse
 * than one that says what is coming.
 */
export default function SearchPage() {
  return (
    <div className="bg-abyss flex min-h-[60vh] flex-col items-center justify-center px-6 text-center">
      <p className="eyebrow text-terra-soft">Search</p>
      <p className="font-display tracking-display text-cream mt-4 text-3xl leading-tight">
        Find something by date
      </p>
      <p className="text-cream/70 mt-3 max-w-sm text-sm">
        Pick a day and see only what can actually be booked on it. Being built
        now.
      </p>
    </div>
  );
}
