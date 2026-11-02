import type { components } from "@/lib/api/schema.gen";
import { readAttribution, type Attribution } from "@/lib/booking/attribution";

/**
 * The checkout a Trigo book card opens (yuvoy-app#223 part 2,
 * yuvoy-mobile#391), carried from the card to `/e/{slug}/book`.
 *
 * The departure, date and party ride in the address the checkout already
 * reads (`?date=&slot=&guests=`), and so does the card's id (`&card=`). What
 * the address cannot carry is kept here, in sessionStorage under the
 * listing's slug: the card's id again, its `idempotencyKey` and the total it
 * was checked at. sessionStorage, never localStorage: the tab is the visit,
 * and nothing here outlives it.
 *
 * The prefill counts only on a checkout whose address names its card. A
 * checkout of the same listing opened another way (from the listing page,
 * after an abandoned card checkout) is a booking of its own, with no Trigo
 * attribution, key or total. Not cut off at the card's `expiresAt`: a
 * confirmed request card stays live past it, and a prefill lost there would
 * mint a new key and allow a second request.
 *
 * At the checkout's tap, `trigoCheckoutFor` says what the reservation sends:
 *
 *   - attribution `placement: trigo`, `campaign: <actionId>` on a
 *     reservation from the card's checkout while the prefill stands. The API
 *     marks the card used from that too (its own traveller only), so a party
 *     changed on the form still closes the card.
 *   - the card's `idempotencyKey` and `expectTotalPaise` only while the
 *     departure and the party are the card's. Change either and the form's
 *     own key and total are used: the card's key was checked for the card's
 *     body, and the API refuses a known key with another body.
 *
 * Every storage call is in try/catch: a private window or blocked storage
 * loses the card's key and attribution, never the checkout.
 */

type Checkout = Extract<
  components["schemas"]["TrigoActionConfirmation"]["next"],
  { checkout: unknown }
>["checkout"];

export interface TrigoCheckoutPrefill extends Omit<
  Checkout,
  "expectTotalPaise"
> {
  /** Gone once a reservation under it was refused `price_moved`. */
  expectTotalPaise?: number;
  actionId: string;
  /** When the confirm answered, ms. A prefill is dropped after `MAX_AGE_MS`. */
  savedAt: number;
}

const PREFIX = "yuvoy.trigo.checkout.";

/** The checkout address's name for its card: `?card=<actionId>`. */
export const CARD_PARAM = "card";

/** A card's checkout is a hold's length at most; two hours is generous. */
export const MAX_AGE_MS = 2 * 60 * 60_000;

function storageKey(slug: string): string {
  return `${PREFIX}${slug}`;
}

/** Keeps the confirm's checkout for its listing, from the confirm's answer. */
export function saveTrigoCheckout(
  actionId: string,
  checkout: Checkout,
  now: number,
): void {
  const prefill: TrigoCheckoutPrefill = { ...checkout, actionId, savedAt: now };
  try {
    sessionStorage.setItem(
      storageKey(checkout.experienceSlug),
      JSON.stringify(prefill),
    );
  } catch {
    // Storage refused: the checkout still opens, filled from the address.
  }
}

function isPrefill(v: unknown): v is TrigoCheckoutPrefill {
  if (!v || typeof v !== "object") return false;
  const p = v as Record<string, unknown>;
  return (
    typeof p.actionId === "string" &&
    typeof p.experienceSlug === "string" &&
    typeof p.slotId === "string" &&
    typeof p.guests === "number" &&
    typeof p.idempotencyKey === "string" &&
    typeof p.savedAt === "number" &&
    (p.expectTotalPaise === undefined || typeof p.expectTotalPaise === "number")
  );
}

/** The listing's prefill, or null when there is none or it is too old. */
export function readTrigoCheckout(
  slug: string,
  now: number,
): TrigoCheckoutPrefill | null {
  try {
    const raw = sessionStorage.getItem(storageKey(slug));
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!isPrefill(parsed) || now - parsed.savedAt > MAX_AGE_MS) {
      sessionStorage.removeItem(storageKey(slug));
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

/** Forgets the listing's prefill: after a reservation was made under it. */
export function clearTrigoCheckout(slug: string): void {
  try {
    sessionStorage.removeItem(storageKey(slug));
  } catch {
    // Nothing to forget when storage is refused.
  }
}

/**
 * After `409 price_moved` under the card's total, the next tap sends the
 * total on screen: the card's total is no longer one the traveller can agree
 * to, and sending it again would be refused again. The key stays, as a
 * refused reservation leaves it unused.
 */
export function dropTrigoTotal(slug: string): void {
  try {
    const raw = sessionStorage.getItem(storageKey(slug));
    if (!raw) return;
    const parsed: unknown = JSON.parse(raw);
    if (!isPrefill(parsed)) return;
    const next: TrigoCheckoutPrefill = { ...parsed };
    delete next.expectTotalPaise;
    sessionStorage.setItem(storageKey(slug), JSON.stringify(next));
  } catch {
    // The next tap sends the card's total again and is refused again.
  }
}

/**
 * Where a book card's checkout opens: the checkout's own address, with the
 * card's id, so the prefill applies to this checkout and no other.
 */
export function trigoCheckoutHref(
  checkout: Checkout,
  actionId: string,
): string {
  const q = new URLSearchParams({
    date: checkout.localDate,
    slot: checkout.slotId,
    guests: String(checkout.guests),
    [CARD_PARAM]: actionId,
  });
  const slug = encodeURIComponent(checkout.experienceSlug);
  return `/e/${slug}/book?${q.toString()}`;
}

/** What a reservation from the checkout takes from a standing prefill. */
export interface TrigoReservationParts {
  attribution: Attribution;
  /** Only while the departure and party are the card's. */
  idempotencyKey?: string;
  /** Only while the departure and party are the card's, and not refused. */
  expectTotalPaise?: number;
}

/**
 * Read at the checkout's tap (an event handler, so `now` is the tap's).
 * `cardId` is the checkout address's `?card=`. Null when the traveller did
 * not come from a Trigo card for this listing, or came to this checkout
 * another way than the card's own address.
 */
export function trigoCheckoutFor(
  slug: string,
  cardId: string | null,
  body: { slotId: string; guests: number },
  now: number,
): TrigoReservationParts | null {
  if (!cardId) return null;
  const prefill = readTrigoCheckout(slug, now);
  if (!prefill || prefill.actionId !== cardId) return null;
  const attribution: Attribution = {
    ...readAttribution(),
    placement: "trigo",
    campaign: prefill.actionId,
  };
  if (body.slotId !== prefill.slotId || body.guests !== prefill.guests) {
    return { attribution };
  }
  return {
    attribution,
    idempotencyKey: prefill.idempotencyKey,
    ...(prefill.expectTotalPaise !== undefined
      ? { expectTotalPaise: prefill.expectTotalPaise }
      : {}),
  };
}
