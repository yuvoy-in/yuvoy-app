/**
 * Two short lines a traveller weighs beside the price: how they pay, and what
 * happens if they cancel (yuvoy-app#110, yuvoy-app#112).
 *
 * Both are the API's to word, the same rule as `pricingUnitLabel`: a phrase a
 * client builds for itself is a second copy of a rule the server owns, and
 * the copy that drifts is the one that misstates money to a consumer. Neither
 * field is in the pinned contract yet (yuvoy-api#248), so each is read by
 * PRESENCE off the listing, structurally, the way `readPayAtCounter` reads a
 * field the contract had not caught up with. Once the contract carries them,
 * these become plain typed reads.
 */

/**
 * How everybody pays today, stated as a fact about the island, not as a stop
 * gap: "on Havelock this is how people pay". It covers request listings too,
 * because a request that is accepted is paid for exactly the same way.
 */
export const PAY_AT_COUNTER = "Pay at the counter on the day";

/**
 * How this listing is paid for.
 *
 * The API's `paymentLabel` when it sends one, decided by the same code that
 * decides whether a reservation is offered cash or card, so the line changes
 * when card payments go live without a release here. Until the field ships,
 * the app says what is true for every listing today (owner's call, 25 Sep):
 * paying at the counter is the only way a booking can be finished.
 */
export function paymentLine(experience: object): string {
  return phrase(experience, "paymentLabel") ?? PAY_AT_COUNTER;
}

/**
 * The cancellation rule in one line, or nothing.
 *
 * Only ever the API's `cancellationSummary`. `cancellationPolicy` is a
 * 227-character paragraph on every live listing, and cutting a summary out of
 * it here would be the app inventing terms: a "full refund" line that
 * dropped the half-refund window is a misstatement, not a summary. So a
 * listing without the field shows nothing beside the price, and the full
 * policy stays where it always was.
 */
export function cancellationLine(experience: object): string | null {
  return phrase(experience, "cancellationSummary");
}

/** A non-blank string the server sent under `key`, trimmed, or null. */
function phrase(source: object, key: string): string | null {
  const value = (source as Record<string, unknown>)[key];
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}
