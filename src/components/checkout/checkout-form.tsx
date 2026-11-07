"use client";

import { checkoutRefusal } from "@/lib/booking/checkout-readiness";
import { ButtonLink } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";
import type { components } from "@/lib/api/schema.gen";
import { CheckoutFields } from "./checkout-fields";

export { policyLines } from "./checkout-fields";

type Experience = components["schemas"]["Experience"];
type Slot = components["schemas"]["Slot"];

/**
 * T6 — checkout. The most important screen in the app.
 *
 * The form is deliberately tiny: a name and a WhatsApp number, and nothing
 * else required. Every extra field costs conversions on the one funnel there
 * is, and this is the screen where a traveller decides whether Yuvoy is worth
 * the trouble.
 *
 * The safety gates (T7) render inline rather than as a second step, because
 * the experience response already carries `safety` — a round trip here costs
 * bookings, which is why the contract puts it on the page response.
 *
 * The one action lives in a sticky bar at the foot, with the total on it, as
 * every reference checkout carries it. The bar is the form's last child, so
 * it sticks for the whole page and never covers the last field.
 */
export function CheckoutForm({
  experience,
  slot,
  initialGuests,
  onGuestsChange,
  onRefused,
  arrive = false,
  trigoCardId = null,
}: {
  experience: Experience;
  slot: Slot;
  /**
   * The form is appearing because a departure was just chosen: it fades in
   * and its foot rises from the bottom edge (T09 A). Read when it mounts, so
   * a new departure (a new, keyed form) changes the foot's words in place.
   */
  arrive?: boolean;
  /** Restored from the URL, so a refresh keeps the party (yuvoy-app#62). */
  initialGuests?: number;
  /** Lifted so the screen above can keep it in the URL. */
  onGuestsChange?: (guests: number) => void;
  /**
   * The API refused the reservation because the calendar is out of date:
   * `capacity_unavailable` or `price_moved`. The screen above refetches the
   * month and puts this sentence over the calendar, which is where the
   * traveller looks next.
   */
  onRefused?: (message: string) => void;
  /**
   * The address's `?card=`: the Trigo card this checkout was opened from.
   * A card's prefill applies only when it names that card (yuvoy-app#223).
   */
  trigoCardId?: string | null;
}) {
  /*
    THE DEAD FORM, REFUSED BEFORE IT RENDERS — yuvoy-app#28.

    This wrapper exists so the refusal can come before a single piece of form
    state is created: the rules of hooks forbid returning early from inside
    `CheckoutFields`, and a traveller must not be able to fill in a form that
    can never be submitted. `checkoutRefusal` owns both the condition and the
    sentence, so the two cannot drift apart the way the blocker and its
    checkbox did.
  */
  const refusal = checkoutRefusal(experience);
  if (refusal) {
    return (
      <Panel tone="alert" role="alert">
        <p className="text-sm font-bold">{refusal.title}</p>
        <p className="text-forest/70 mt-1.5 text-sm">{refusal.body}</p>
        <ButtonLink
          href={`/e/${experience.slug}`}
          variant="outline"
          size="sm"
          className="mt-4"
        >
          Back to this experience
        </ButtonLink>
      </Panel>
    );
  }

  return (
    <CheckoutFields
      experience={experience}
      slot={slot}
      initialGuests={initialGuests}
      onGuestsChange={onGuestsChange}
      onRefused={onRefused}
      arrive={arrive}
      trigoCardId={trigoCardId}
    />
  );
}
