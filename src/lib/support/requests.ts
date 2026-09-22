import type { components } from "@/lib/api/schema.gen";
import { civilInZone, dayMonth } from "@/lib/format/date";
import { NetworkError, YuvoyError } from "@/lib/api/errors";

/**
 * A help request as the traveller who sent it sees it (yuvoy-api#196), and
 * the pure things the screens say about one.
 *
 * ## What is here, and what is deliberately not
 *
 * The API models four states and stores the traveller's own message. It does
 * NOT store staff replies ("the conversation happens on WhatsApp and is not
 * stored") and it has no `waiting_on_traveller` state. So nothing in this
 * module or the screens that use it may imply a reply will appear in the app,
 * or that the traveller owes an answer: the only honest things to say are
 * where the request is, what it said, and when.
 */

export type SupportRequest = components["schemas"]["SupportRequest"];

/**
 * The status in the traveller's words, from the API's own definitions:
 *
 *   - `open`: "received, nobody has picked it up".
 *   - `in_progress`: "somebody is on it".
 *   - `resolved`: "dealt with".
 *   - `closed`: "closed without action", which the API renamed from its
 *     internal `dismissed` because "`closed` reads less like a rejection to
 *     the person who asked". The word here keeps that choice.
 */
const STATUS_WORDS: Record<string, string> = {
  open: "Received",
  in_progress: "Someone is on it",
  resolved: "Resolved",
  closed: "Closed",
};

/**
 * The status as a word, or `null` for one this build has never heard of.
 *
 * `null`, not a guess, for the reason `StateChip` gives about a booking's
 * state: there is no honest generic. "Received" would claim nobody has
 * picked it up; "Resolved" would claim it was dealt with. A missing word
 * loses a word, and a wrong one misinforms.
 */
export function supportStatusWords(status: unknown): string | null {
  if (typeof status !== "string") return null;
  // An OWN key only: `STATUS_WORDS["toString"]` is a function, not a word.
  return Object.prototype.hasOwnProperty.call(STATUS_WORDS, status)
    ? (STATUS_WORDS[status] ?? null)
    : null;
}

/** Whether a person has the request in hand right now. */
export function isBeingHandled(status: unknown): boolean {
  return status === "in_progress";
}

/**
 * The traveller's own message, cut to a line or two for a list.
 *
 * Whitespace is collapsed first, because the form keeps line breaks and a
 * list row is not the place to reproduce them. The cut lands on a word
 * boundary when one is near, so the excerpt never ends mid-word.
 */
export function messageExcerpt(message: unknown, max = 140): string {
  if (typeof message !== "string") return "";
  const flat = message.replace(/\s+/g, " ").trim();
  if (flat.length <= max) return flat;
  const cut = flat.slice(0, max);
  const lastSpace = cut.lastIndexOf(" ");
  const trimmed = lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut;
  return `${trimmed.replace(/[\s.,;:!?]+$/, "")}…`;
}

/**
 * "21 Sep", in the MARKET's calendar, or `null` for an instant that cannot be
 * read.
 *
 * From the date tables, never `Intl`'s month names: these rows render after
 * hydration today, and this module must stay safe to render on a server
 * (node says "Sept" where WebKit says "Sep", React #418). The market's zone
 * rather than the reader's, the same as every other date in this app.
 */
export function requestDay(iso: unknown): string | null {
  if (typeof iso !== "string") return null;
  const civil = civilInZone(iso, "Asia/Kolkata");
  return civil ? dayMonth(civil) : null;
}

/**
 * The "when" line for a request: when it was sent, and when it last moved if
 * that was on a different day.
 *
 * `updatedAt` is "the latest of: the request being sent again, picked up, or
 * resolved", so a second date is news only when it is a different day. The
 * same day twice is noise.
 */
export function requestWhen(
  request: Pick<SupportRequest, "createdAt" | "updatedAt">,
): string | null {
  const sent = requestDay(request.createdAt);
  if (!sent) return null;
  const updated = requestDay(request.updatedAt);
  return updated && updated !== sent
    ? `Sent ${sent} · updated ${updated}`
    : `Sent ${sent}`;
}

/**
 * Whether a failure means this API has no read side for help requests yet.
 *
 * Before yuvoy-api#209 was deployed `GET /support/requests` answered `405`
 * (only the write existed), and an API a deploy behind could answer either
 * that or a `404` for the path. Both mean the same thing to a traveller: the
 * app has nothing to show beyond what it showed before the read existed.
 */
export function isMissingReadSide(error: unknown): boolean {
  return (
    error instanceof YuvoyError &&
    (error.status === 405 || error.status === 404)
  );
}

/** A sentence for a failed status check, and whether trying again can help. */
export interface LookupFailure {
  body: string;
  canRetry: boolean;
  /** Offer a way back in: the session is gone. */
  signIn?: boolean;
}

/**
 * What to say when one request's status could not be read.
 *
 * Every branch keeps the one thing that is certainly true in view, because
 * the reference and the WhatsApp line stay on screen beside it: the request
 * was sent, and a person answers on WhatsApp. So a failure here never reads as
 * though the request itself failed.
 *
 * `via` is which credential asked. A dead session is fixed by signing in; a
 * dead booking link is not, and the booking page says so from the call that
 * knows (`GET /bookings/status`), so this does not offer a new link beside it.
 */
export function describeLookupFailure(
  error: unknown,
  via: "session" | "token",
): LookupFailure {
  if (error instanceof NetworkError) {
    return {
      body: "That did not reach us. This is usually the island signal. Try again in a moment.",
      canRetry: true,
    };
  }
  if (error instanceof YuvoyError) {
    if (error.status === 401) {
      return via === "session"
        ? {
            body: "Your sign-in has ended, so we cannot show it here. Sign in again to check it.",
            canRetry: false,
            signIn: true,
          }
        : {
            body: "This booking link cannot open it any more.",
            canRetry: false,
          };
    }
    if (isMissingReadSide(error)) {
      /*
        A 404 is also what an unknown reference gets, "word for word" the same
        as somebody else's. Straight after sending, the reference came from
        this API a moment ago, so the read side being missing is the likelier
        cause, and this sentence is true either way.
      */
      return {
        body: "We cannot look this one up here. Keep the reference: the reply comes on WhatsApp.",
        canRetry: false,
      };
    }
    if (error.status === 429) {
      return {
        body: "That is a lot of checks in a short time. Try again shortly.",
        canRetry: true,
      };
    }
  }
  return {
    body: "We could not check it just now. Try again shortly.",
    canRetry: true,
  };
}
