import type { Metadata } from "next";

export const metadata: Metadata = { title: "Trips" };

/**
 * T10/T11. Reads from device storage first — a booking must be readable with no account and no signal.
 *
 * Deliberately a stated placeholder rather than a fabricated screen. The nav
 * registry ships a route with its page, and a tab that leads nowhere is worse
 * than one that says what is coming.
 */
export default function TripsPage() {
  return (
    <div className="bg-abyss flex min-h-[60vh] flex-col items-center justify-center px-6 text-center">
      <p className="eyebrow text-terra-soft">Trips</p>
      <p className="font-display tracking-display text-cream mt-4 text-3xl leading-tight">
        Your bookings live here
      </p>
      <p className="text-cream/70 mt-3 max-w-sm text-sm">
        Every booking you make, kept on this device so it works without an
        account and without signal.
      </p>
    </div>
  );
}
