import type { components } from "@/lib/api/schema.gen";

export type CashBooking = components["schemas"]["CashBooking"];

/** Where to finish a booking without a card, as the API describes it. */
export interface PayAtCounter {
  /** The path to POST to, relative to the API base. */
  confirmAt: string;
}

/**
 * Whether this payment-order answer offers paying the operator in cash —
 * yuvoy-app#29.
 *
 * ## Read by PRESENCE, on either answer, and deliberately not by `state`
 *
 * The issue first described `payAtCounter` as arriving on the `coming_soon`
 * answer, and corrected itself before anything was built:
 *
 * > production has a provider configured, so it returns `ready`, not
 * > `coming_soon`. If you had branched on `state === "coming_soon"` to decide
 * > whether to show the cash option, it would never have appeared. Branch on
 * > the presence of `payAtCounter` instead — that is the only correct test, on
 * > either answer.
 *
 * So this switches on the field, not on the state, and not on the status code.
 *
 * ## Why it reads the field itself rather than trusting the generated type
 *
 * When this shipped, the contract declared `payAtCounter` on the `200`
 * (`coming_soon`) answer only, while the correction said it arrives on both —
 * so a read off the generated type compiled for one answer and not the other.
 * yuvoy-api closed that gap at `79ce45af`: `PaymentOrder`, the `201`, declares
 * it now too, and this app is pinned there.
 *
 * The structural read stays anyway, for the reason that outlives the gap: one
 * reader for both answers that does not care which of them arrived, needs no
 * cast at the call site, and degrades the only safe way. A response that does
 * not carry the field, or carries it with `available: false`, produces `null`
 * and no cash option is offered. "Do not offer cash if `payAtCounter` is
 * absent from the payment-order response. That is how this gets turned off
 * when a processor goes live."
 */
export function readPayAtCounter(answer: unknown): PayAtCounter | null {
  if (!answer || typeof answer !== "object") return null;
  const raw = (answer as { payAtCounter?: unknown }).payAtCounter;
  if (!raw || typeof raw !== "object") return null;

  const { available, confirmAt } = raw as {
    available?: unknown;
    confirmAt?: unknown;
  };
  /*
    `available` is required in the contract and is the off switch. Anything
    that is not exactly `true` means do not offer it — an absent flag is not
    permission, and this is a control over whether somebody can commit money.
  */
  if (available !== true) return null;
  if (typeof confirmAt !== "string" || !confirmAt.trim()) return null;

  return { confirmAt: confirmAt.trim() };
}

/**
 * What the traveller must bring, in paise.
 *
 * `payAtCounterPaise` and nothing else. `capturedAmountPaise` is `0` on a cash
 * booking and stays `0` forever — we never touch the money — so a screen that
 * read it would tell somebody to bring nothing.
 */
export function amountToBring(booking: CashBooking): number {
  return Number.isInteger(booking.payAtCounterPaise)
    ? booking.payAtCounterPaise
    : 0;
}

/**
 * Whether this answer completed a booking.
 *
 * `201` the first time and **`200` if the reservation was already confirmed**
 * — the second tap on ferry wifi. Both are the same booking and must render
 * identically; only a fresh-conversion count would ever distinguish them, and
 * this app does not keep one.
 */
export function isBooked(booking: CashBooking): boolean {
  return Boolean(booking.bookingReference?.trim());
}

/**
 * The state a cash booking sits in until the operator records taking the money.
 *
 * ## Why this is a string comparison and not `state === "paid_pending_ops"`
 *
 * It is not in `BookingStatus.state`'s enum. The traveller contract declares
 * `paid_pending_ops` only on `CashBooking`, while `GET /bookings/status`
 * returns it — so TypeScript refuses the comparison as having "no overlap",
 * which is the type system correctly reporting that the document disagrees
 * with the API. Raised on yuvoy-app#29.
 *
 * Narrowed here rather than cast at each call site, so there is one place to
 * delete when the enum grows the value.
 *
 * **`confirmed` is not this.** That is the operator having recorded the cash,
 * and the traveller owes nothing on arrival. Both read as *booked* — "the
 * difference is our bookkeeping, not their standing" — but only this one still
 * has money to hand over.
 */
export function isCashDue(state: string): boolean {
  return state === "paid_pending_ops";
}
