/**
 * The event vocabulary.
 *
 * A closed list, because an analytics call site that invents a name is a
 * funnel that quietly stops matching itself. These are the steps of the one
 * funnel that matters: does somebody who opens the feed end up on a boat.
 *
 * Nothing here carries a name, a phone number, a booking reference or a token.
 */
export const EVENTS = {
  feedViewed: "feed_viewed",
  experienceOpened: "experience_opened",
  availabilityViewed: "availability_viewed",
  slotSelected: "slot_selected",
  checkoutOpened: "checkout_opened",
  checkoutSubmitted: "checkout_submitted",
  reservationHeld: "reservation_held",
  paymentOpened: "payment_opened",
  bookingConfirmed: "booking_confirmed",
  bookingCancelled: "booking_cancelled",
  searchPerformed: "search_performed",
} as const;

export type EventName = (typeof EVENTS)[keyof typeof EVENTS];
