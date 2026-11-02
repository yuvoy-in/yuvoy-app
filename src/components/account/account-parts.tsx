"use client";

import { ButtonLink } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";
import { InviteCodeForm } from "@/components/auth/invite-gate";
import { civilInZone, monthName } from "@/lib/format/date";
import type { TravellerAccount } from "@/lib/auth/use-my-account";

/* The signed-in Account screen's smaller parts, kept apart from the screen. */

/**
 * "Enter your invite code", on the one screen a traveller who is not in can
 * always reach (yuvoy-api#195).
 *
 * The gate itself asks for a code wherever somebody is stopped by it. This is
 * the standing place for it: somebody who was given a code and has not used
 * it yet has nowhere else to type it, because every screen that would ask is
 * behind the gate and shows the landing instead.
 *
 * The SAME form as the gate's, not a second one, so there is one set of
 * sentences for a code that is unknown, used, expired or throttled.
 *
 * No `autoFocus`. This renders with the page rather than after a tap, and a
 * field that takes the focus on load moves a screen reader away from the
 * heading and opens the keyboard over the rest of the screen.
 */
export function InviteEntry({
  admitted,
  onAdmitted,
}: {
  admitted: boolean;
  onAdmitted: () => void;
}) {
  return (
    <Panel className="mt-6">
      <p className="text-sm font-bold text-balance">Enter your invite code</p>
      <p className="text-forest/70 text-body mt-1.5 text-pretty">
        Yuvoy is by invitation for now. Enter the code you were given, once, and
        this number is in on any phone you sign in on.
      </p>
      <InviteCodeForm onAdmitted={onAdmitted} />
      {/*
        A way onward rather than a screen that congratulates you and stops.
        The form says what happened; this is where to go with it.
      */}
      {admitted ? (
        <ButtonLink href="/" size="sm" className="mt-4">
          Start looking
        </ButtonLink>
      ) : null}
    </Panel>
  );
}

/**
 * "Member since Sep 2026".
 *
 * Built from civil fields rather than formatted, for the reason in
 * `lib/format/date`: `Intl` takes its month names from the runtime's CLDR, and
 * this screen is server rendered (yuvoy-app#67).
 */
export function memberSince(iso: string): string | null {
  const civil = civilInZone(iso, "Asia/Kolkata");
  return civil ? `${monthName(civil)} ${civil.year}` : null;
}

/** "3 trips · 1 review", with the singular where it belongs. */
export function counts(me: TravellerAccount): string {
  const trips = me.trips?.total ?? 0;
  const reviews = me.reviews?.count ?? 0;
  const plural = (n: number, word: string) =>
    `${n} ${word}${n === 1 ? "" : "s"}`;
  return `${plural(trips, "trip")} · ${plural(reviews, "review")}`;
}
