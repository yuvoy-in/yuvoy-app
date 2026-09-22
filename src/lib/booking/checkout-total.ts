import type { components } from "@/lib/api/schema.gen";

type Money = components["schemas"]["Money"];
type PricingUnit = NonNullable<
  components["schemas"]["Experience"]["pricingUnit"]
>;

/**
 * What this party pays for this departure, computed the way the API computes
 * it, or `null` when the departure carries no price.
 *
 * `per_group` prices the whole departure, so the party size does not change
 * it; `per_person` multiplies by the party. The API's own rule, from the price
 * snapshot `POST /reservations` takes: `case pricing_unit when 'per_group'
 * then unit_price else unit_price * guests`.
 *
 * ## Why it lives here and not inline in the form
 *
 * It is one number with three readers: the Total line, the button that says
 * "Hold these seats · ₹X", and `expectTotalPaise`, the total the traveller
 * agreed to, which the API refuses with `409 price_moved` when it does not
 * match. The form multiplied by the party for every listing, so a ₹18,000
 * charter for four read ₹72,000 on screen, and the moment the agreed total
 * was actually sent, every such booking would have been refused. One function
 * means the screen and the request cannot disagree.
 *
 * An absent `pricingUnit` is `per_person`, which is what every listing meant
 * before the field existed and what the API assumes too.
 */
export function checkoutTotal(
  price: Money | undefined,
  guests: number,
  pricingUnit: PricingUnit | undefined,
): Money | null {
  if (!price) return null;
  return {
    amountMinor:
      pricingUnit === "per_group"
        ? price.amountMinor
        : price.amountMinor * guests,
    currency: price.currency,
  };
}
