import type { components } from "@/lib/api/schema.gen";

type Experience = components["schemas"]["Experience"];

/** Why checkout cannot be offered, in the words the screen needs. */
export interface CheckoutRefusal {
  title: string;
  body: string;
}

/**
 * Whether this experience can be checked out at all — yuvoy-app#28.
 *
 * ## The defect this exists to make impossible
 *
 * Checkout required acceptance of the cancellation policy unconditionally,
 * and rendered the checkbox that accepts it only `if (experience
 * .cancellationPolicy)`. When the field was absent the traveller was asked to
 * accept something that was never on the page: a dead submit button and a
 * hint naming a control that did not exist. **Nothing on `app.yuvoy.in` could
 * be booked, by anybody, from launch until 9 Sep 2026.**
 *
 * `cancellationPolicy` is declared on the contract and was `omitempty`, so it
 * was silently missing from every response while the e2e passed and every
 * response shape validated — an optional field that is never populated is
 * invisible to both sides' checks. The API now populates it (yuvoy-api#138,
 * deployed and verified on the live listing endpoint before this shipped).
 *
 * ## Why the requirement stays
 *
 * The alternative was to gate the blocker on the same condition as the
 * control, which makes a listing with no policy bookable with **no terms
 * accepted at all**. Refusing to display terms we did not send is right;
 * taking money against terms nobody agreed to is not. So the requirement
 * stands and the refusal becomes explicit, which is the option yuvoy-api#138
 * asked for and the one that fails in the safe direction.
 *
 * ## The general rule
 *
 * *A required condition whose control is conditional must render a reason
 * when the control is absent.* A dead button with no explanation is the worst
 * of the available outcomes. Pairing the two here — the condition and the
 * sentence, in one function — is what stops them drifting apart again, and
 * `pnpm qa` fails the build if a blocker in the form is added without its
 * control being unconditional or its refusal being declared here.
 *
 * Returns `null` when checkout can proceed.
 */
export function checkoutRefusal(
  experience: Pick<Experience, "cancellationPolicy">,
): CheckoutRefusal | null {
  if (!experience.cancellationPolicy?.trim()) {
    return {
      title: "We cannot take a booking for this one yet",
      body:
        "This experience has no cancellation terms published, and we will not " +
        "take your money without telling you what happens if it is called " +
        "off. It is our side that is incomplete, not anything you did.",
    };
  }
  return null;
}
