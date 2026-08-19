import type { Metadata } from "next";

export const metadata: Metadata = { title: "Account" };

/**
 * T5/T11. Optional sign-in; nothing is gated behind it.
 *
 * Deliberately a stated placeholder rather than a fabricated screen. The nav
 * registry ships a route with its page, and a tab that leads nowhere is worse
 * than one that says what is coming.
 */
export default function AccountPage() {
  return (
    <div className="bg-abyss flex min-h-[60vh] flex-col items-center justify-center px-6 text-center">
      <p className="eyebrow text-terra-soft">Account</p>
      <p className="font-display tracking-display text-cream mt-4 text-3xl leading-tight">
        An account is optional
      </p>
      <p className="text-cream/70 mt-3 max-w-sm text-sm">
        Booking never needs one. Signing in just keeps your trips if you change
        phone.
      </p>
    </div>
  );
}
