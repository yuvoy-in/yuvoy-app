/**
 * Words the chat sheet needs that R5-T5's "Copy (exact)" does not give.
 *
 * Ours, not the spec's: the spec's own lines are in `@/lib/trigo/words`, and
 * server sentences (the notice, fixed replies, error messages) are drawn as
 * sent and never copied anywhere. Kept apart so a product review can see at a
 * glance which lines nobody has signed off yet (yuvoy-app#223).
 */

export const ASK_ABOUT = "Ask Trigo about this";
export const SIGN_IN = "Sign in";
export const COMPOSER_LABEL = "Message to Trigo";
export const SEND = "Send";
export const SENDING = "Sending";
export const STARTERS_LABEL = "Ways to start";
export const LOADING_CHAT = "Opening your chat";
export const CHAT_FAILED = "We could not open your chat.";
export const SAVE_FAILED = "That did not save. Try again.";
export const REMOVED_MESSAGE = "This message was removed after 90 days.";
export const AGE_YEAR_INVALID = "Write the year you were born, like 1994.";
export const YES = "Yes";
export const NO = "No";

/** Who wrote a message, read out before it in the log. */
export const SPEAKER_YOU = "You";
export const SPEAKER_TRIGO = "Trigo";
export const SPEAKER_TEAM = "Yuvoy team";

/** Under the composer once the text is close to the 1,000 limit. */
export function charactersLeft(n: number): string {
  return n === 1 ? "1 character left" : `${n} characters left`;
}

/** Under the limit line, before the reset time in IST and a full stop. */
export const RESET_LEAD = "Your messages come back at";

/** Names of the consent and limit panels, for screen readers. */
export const CONSENT_LABEL = "Before you start";
export const LIMIT_LABEL = "Today's messages";

/*
  The confirm card's own lines that yuvoy-mobile#391 does not give
  (yuvoy-app#223 part 2). Ours, unsigned.
*/
export const CARD_DECLINED = "You said not now.";
export const CARD_SUPERSEDED = "Trigo made a newer card for this.";
export const CARD_FAILURE = "Something went wrong on our side. Try again.";
export const CARD_OFFLINE = "You're offline. Try again when you're back.";
/** A move or add-people card (yuvoy-mobile#398): no web screen for it yet. */
export const CARD_NOT_ON_WEB = "This change can't be made on the web yet.";
/** The card's name for screen readers, before the server's heading. */
export const CARD_LABEL = "Trigo's card";
