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
