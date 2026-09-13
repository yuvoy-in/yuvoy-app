import { YuvoyError } from "@/lib/api/errors";

/**
 * The conversation with the business, and the rules a composer has to keep.
 *
 * ## Why this call needs its own reading of `invalid_input`
 *
 * `invalid_input` is in `CLIENT_BUGS`, so `describeError` renders "Something
 * went wrong ... trying again often fixes it" and offers a retry. That is
 * right almost everywhere: a body our own code built wrongly is our defect,
 * not the traveller's, and there is nothing for them to do about it.
 *
 * Here it is exactly backwards. The body is the traveller's own sentence, the
 * server refused it for a reason they can act on, and **the same text fails
 * again** -- so a retry button is a loop and "it is us, not you" is false.
 *
 * The branch is on `details.text`, which is a token, never on the message.
 * The message is then RENDERED, because the API writes the sentence that
 * explains the refusal and it arrives already stripped of long dashes by
 * `createApiClient`. Our own wording stands behind it for an API that sends
 * the code and no prose.
 *
 * ## What is deliberately NOT done here
 *
 * There is no client-side check for a phone number, an email or a link. The
 * server's rules are specific enough to disagree with a re-implementation --
 * "arrived.in" reads as a link, "14.09.2026" does not read as a phone number,
 * and seven digits are counted THROUGH the spaces and dashes between them --
 * and a client that disagreed would either block a message the API would have
 * taken or promise one it will refuse. One rule, in one place, and the screen
 * renders what it says. D-018 holds on both sides: neither party can put a
 * phone number in a message.
 */

/** The longest message the API takes, counted as characters rather than bytes. */
export const MESSAGE_MAX = 1000;

/** How many are fetched at once. The API's own default. */
export const MESSAGE_PAGE = 50;

/** The `details.text` values that mean the traveller's text, not our bug. */
const TEXT_PROBLEMS = new Set([
  "contact details",
  "required",
  "too long",
  "unprintable",
]);

/** Ours, for an API that sends the code and no sentence. */
function ourWordsFor(problem: string, detail: string | undefined): string {
  if (problem === "contact details") {
    const kind =
      detail === "phone"
        ? "a phone number, from seven or more digits written close together"
        : detail === "email"
          ? "an email address"
          : detail === "link"
            ? "a link"
            : "contact details";
    return `Messages cannot include phone numbers, email addresses or links. This one looks like it has ${kind}. Take it out and send the message again.`;
  }
  if (problem === "required") return "Write something before sending.";
  if (problem === "too long") {
    return `A message can be up to ${MESSAGE_MAX} characters. Shorten it and send it again.`;
  }
  return "This message has characters that cannot be shown. Remove them and send it again.";
}

/**
 * Why a send was refused, in a sentence, or `null` when this is not a refusal
 * the traveller can do anything about.
 *
 * `null` is the signal to fall back to `describeError`, which is correct for a
 * dead link, a rate limit or an outage.
 */
export function describeSendRefusal(error: unknown): string | null {
  if (!(error instanceof YuvoyError)) return null;

  if (error.code === "messages_closed") {
    const reason = readString(error.details.reason);
    return error.message.trim() || closedBecause(reason);
  }

  if (error.code !== "invalid_input") return null;
  const problem = readString(error.details.text);
  // An `invalid_input` that is NOT about the text really is our bug, and has
  // to keep reading as one rather than being dressed up as the writer's fault.
  if (!problem || !TEXT_PROBLEMS.has(problem)) return null;

  return (
    error.message.trim() ||
    ourWordsFor(problem, readString(error.details.contactDetail))
  );
}

/**
 * Why the conversation cannot be written in.
 *
 * Used for the thread's own `closedReason`, which is not an error and carries
 * no sentence, and as the fallback for a `409 messages_closed`. Every one of
 * them says the conversation can still be READ, because it can, and a screen
 * that only said "closed" would read as the history being gone.
 */
export function closedBecause(reason: string | undefined): string {
  switch (reason) {
    case "not_booked":
      return "There is no booking behind this link yet, so there is nobody to write to. Messages open once the booking is made.";
    case "cancelled":
      return "This booking was cancelled, so no more messages can be sent. The conversation can still be read.";
    case "declined":
      return "This booking was declined, so no more messages can be sent. The conversation can still be read.";
    case "window_closed":
      return "Messages close a while after a trip ends, and this one has closed. The conversation can still be read.";
    default:
      /*
        A reason this build has not seen. The set is the server's and can grow
        without a deploy here, so the fallback says the part that is certainly
        true and never guesses at which of the four it was.
      */
      return "This conversation is not taking new messages. It can still be read.";
  }
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}
