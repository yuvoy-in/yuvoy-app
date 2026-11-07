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
  /** A place chosen on `/` (yuvoy-app#179), with `via: list | near_you | link`. */
  placePicked: "place_picked",
  /*
    The Trigo chat sheet (yuvoy-app#223). Never the message text, only its
    shape: a length bucket, a turn number, the outcome, a card count.
  */
  /** With `entry: masthead | listing | found_card | account | notice`. */
  trigoOpened: "trigo_opened",
  /** With `lengthBucket` and `turnIndex`. */
  trigoMessageSent: "trigo_message_sent",
  /** With `outcome`, `cards` and `latencyBucket`. */
  trigoReplyShown: "trigo_reply_shown",
  trigoLimitReached: "trigo_limit_reached",
  /** With `accepted`: true on accept, false on Turn off Trigo. */
  trigoConsent: "trigo_consent",
} as const;

export type EventName = (typeof EVENTS)[keyof typeof EVENTS];
