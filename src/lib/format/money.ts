/**
 * Money is `amountMinor` — an integer, in the currency's minor unit.
 * ₹4,500 is 450000. There are no float rupees anywhere in the API and no
 * fractional paise.
 *
 * Format at the render edge; never store the formatted value.
 */

export interface Money {
  amountMinor: number;
  currency: string;
}

const MINOR_UNITS: Record<string, number> = { INR: 2, USD: 2, EUR: 2, JPY: 0 };

/**
 * Renders money for display. Whole amounts drop the decimals — "₹4,500" reads
 * as a price, "₹4,500.00" reads as an invoice, and every price in this product
 * is currently whole rupees.
 */
export function formatMoney(
  money: Money,
  opts?: { locale?: string; alwaysShowMinor?: boolean },
): string {
  const digits = MINOR_UNITS[money.currency] ?? 2;
  const major = money.amountMinor / 10 ** digits;
  const hasFraction = money.amountMinor % 10 ** digits !== 0;
  const showMinor = opts?.alwaysShowMinor || hasFraction;

  return new Intl.NumberFormat(opts?.locale ?? "en-IN", {
    style: "currency",
    currency: money.currency,
    minimumFractionDigits: showMinor ? digits : 0,
    maximumFractionDigits: showMinor ? digits : 0,
  }).format(major);
}

/**
 * A "from" price for a card.
 *
 * `fromPrice` is ABSENT until a real contracted price exists — there is no
 * placeholder price anywhere in this product. A card with no price says so
 * rather than rendering ₹0, which would be a fabricated claim.
 */
export function formatFromPrice(
  money: Money | null | undefined,
): string | null {
  if (!money || typeof money.amountMinor !== "number") return null;
  return formatMoney(money);
}
