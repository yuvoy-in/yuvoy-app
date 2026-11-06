/**
 * Every fixed line the Trigo chat shows, word for word from R5-T5's "Copy
 * (exact)" and yuvoy-mobile#356 (yuvoy-app#223). One place, so the screens
 * and their tests read the same words.
 *
 * Only the client's own lines are here. What the server writes (fixed
 * replies, the notice, `error.message`, team lines and due times) is shown as
 * sent and never copied into this file.
 */

export const TRIGO_TITLE = "Ask Trigo";

export const GREETING =
  "Hi, I'm Trigo. Ask me what to do, where to go or what to bring. I answer from what is listed on Yuvoy.";

export const TALK_TO_A_PERSON = "Talk to a person";

/** Starter chips with no place or listing in view. */
export const CHIPS_GENERAL: readonly string[] = [
  "What should I do this weekend?",
  "Free things this weekend",
  "Something calm with my parents",
  TALK_TO_A_PERSON,
];

/** Starter chips while the traveller is looking at Andaman. */
export const CHIPS_ANDAMAN: readonly string[] = [
  "Beginner dive Saturday for two",
  "Something calm with my parents",
  "Sunset on the water",
  TALK_TO_A_PERSON,
];

/** Starter chips when Trigo was opened from a listing. */
export const CHIPS_LISTING: readonly string[] = [
  "Do I need to swim?",
  "What should I bring?",
  "Is it good for kids?",
  TALK_TO_A_PERSON,
];

export const COMPOSER_NOTE = "Write in English, Hindi, Telugu or Kannada.";

/** Shown only from 5 left down. */
export const REMAINING_SHOWN_AT = 5;

/** "{n} messages left today", shown at 5 or fewer (`REMAINING_SHOWN_AT`). */
export function remainingLine(n: number): string {
  return `${n} messages left today`;
}

export const TYPING = "Trigo is looking";

export const LIMIT_LINE =
  "You've used today's 20 messages. You can ask again after midnight, or talk to a person.";

export const OFFLINE_LINE =
  "You're offline. Your message is kept here, and you can send it when you're back.";

export const FAILURE_LINE =
  "Something went wrong on our side. Your message is still here.";

export const TRY_AGAIN = "Try again";

/**
 * Under Try again while the answer's `Retry-After` runs, the reason it is
 * off. Our draft: R5-T5 names no words for it.
 */
export const TRY_AGAIN_SOON = "You can try again in a moment.";

export const SIGNED_OUT_LINE =
  "Sign in to ask Trigo. Trigo needs your account so the Yuvoy team can reply to you.";

export const NOT_RELEASED_LINE = "Trigo isn't open to your account yet.";

/** 403 `adult_confirmation_required` (CAL-15). The same words the contract gives. */
export const AGE_LINE = "Add your birth year to use Trigo.";

export const AGE_BUTTON = "Add birth year";

/** The web's own age form (no R4-T1 form exists on the web yet). */
export const AGE_YEAR_LABEL = "Year you were born";
export const AGE_BIRTHDAY_QUESTION = "Has your birthday passed this year?";
export const AGE_SAVE = "Save";

/** 409 `turn_in_progress`. */
export const IN_PROGRESS_LINE = "Trigo is still answering your last message.";

/** The hand-off button under a reply with `handoffOffer`. */
export const ASK_THE_TEAM = "Ask the team";

/** Our draft: R5-T5 names no words for withdrawing consent. */
export const TURN_OFF = "Turn off Trigo";

/** Our draft: R5-T5 names no words for accepting the notice. */
export const ACCEPT = "I understand";

/*
  The confirm card under a reply (yuvoy-app#223 part 2, yuvoy-mobile#391).
  The card's heading, lines and both labels are the server's and drawn as
  sent; these are the state lines #391 gives the app.
*/

/** While a confirm is out: both buttons are off. */
export const CARD_CHECKING = "Checking it's still the same";

/**
 * A card read as `state: expired`. A confirm refused `409 action_changed` or
 * `action_expired` shows the API's own sentence instead.
 */
export const CARD_EXPIRED_LINE = "This card has expired. Ask Trigo again.";

/** A book card already confirmed: opens the same checkout again. */
export const GO_TO_CHECKOUT = "Go to checkout";

/** A book card used: a booking carries it. */
export function bookedLine(reference: string): string {
  return `Booked: ${reference}`;
}

/** A date alert card used. */
export const DATE_ALERT_DONE = "Done. I'll tell you once when it has a date.";

/** A trip draft card used. */
export const TRIP_DRAFT_DONE = "Saved to your trips.";

/*
  The cards in a reply and the note on a link Trigo did not open
  (yuvoy-app#223 (b) and (c)). Every line on a live card is the server's.
  These four are proposed on yuvoy-app#223 and wait for Sai Teja's yes.
*/

/** On a card whose listing or event is gone, in place of the price and the link. */
export const NO_LONGER_LISTED = "No longer listed on Yuvoy.";

/** Under a reply to a message that held a link (`linkNotChecked`). */
export function linkNotCheckedLine(domain: string): string {
  return `Trigo doesn't open links, so nothing on ${domain} has been checked yet.`;
}

/** The button beside that note: hands this message to the team. */
export const ASK_TEAM_TO_CHECK = "Ask the team to check";

/** The hand-off did not reach the server (offline, or no answer). Ours, proposed. */
export const ASK_TEAM_FAILED = "That didn't reach the team. Try again.";
