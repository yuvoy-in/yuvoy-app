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
 * Whether this booking still owes the operator cash on the day.
 *
 * ## Read `payment`, never the state — and the state used to be the answer
 *
 * `GET /bookings/status` used to return `paid_pending_ops` for a cash booking
 * until the operator recorded the money, and this function was
 * `state === "paid_pending_ops"`. Owner decision D-034 (yuvoy-api#168, live
 * since 12 Sep) changed the projection: a cash booking now reads `confirmed`
 * from the moment it is made, because the seat was taken against a live hold
 * and there is no money in flight to wait on. What is still owed moved to a
 * `payment` object.
 *
 * That is a better answer for the traveller and it inverted this client
 * silently. `paid_pending_ops` is not in `BookingStatus.state`'s enum and
 * never was, so nothing failed to compile; the comparison simply stopped
 * matching. The booking screen went on rendering the row it renders for a card
 * booking — **"Paid ₹9,000"**, to somebody who has not handed over a rupee and
 * is about to be asked for the notes — and dropped the standing "Bring ₹9,000
 * in cash" line that exists precisely so a traveller reloading on the morning
 * of the trip knows what to take.
 *
 * So: the fact is `payment`, and `payment` is the only thing consulted. It is
 * present only on a cash booking, and `collected` flips when the operator
 * records taking it.
 *
 * ## Both halves are checked, and the second one matters
 *
 * `payment.collected` is what turns the line off. Keying on the object's mere
 * presence would leave "Bring ₹9,000 in cash" on the screen of somebody who
 * has already paid — the same class of untruth as the one above, pointing the
 * other way.
 */
export function cashOwed(status: {
  payment?: { method?: string; collected?: boolean; amountPaise?: number };
}): boolean {
  const payment = status.payment;
  return payment?.method === "cash" && payment.collected !== true;
}

/**
 * What to bring, in paise, or `null` when nothing is owed.
 *
 * From `payment.amountPaise`, which the contract states is the price frozen at
 * checkout and "the same number as `price.totalPaise`". Taken from `payment`
 * rather than from `price` anyway, because it is the field that describes the
 * obligation: if the two ever disagree, the one naming the debt is the one to
 * put in front of somebody counting out notes.
 */
export function cashOwedPaise(status: {
  payment?: { method?: string; collected?: boolean; amountPaise?: number };
}): number | null {
  return cashOwed(status) ? (status.payment?.amountPaise ?? null) : null;
}
