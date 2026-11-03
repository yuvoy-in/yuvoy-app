import { NetworkError, YuvoyError } from "@/lib/api/errors";
import { ORGANISER_WORDS as W } from "./words";

/**
 * What an organiser screen does after an organiser route refuses
 * (yuvoy-app#224, from the phone's `refusal.ts` on yuvoy-mobile dev, and the
 * issue's "Messages from the API"). Branches on the status and `error.code`,
 * never on the words; the words shown are the API's own `message`, with its
 * known sentence as the fallback when an answer came without one. The order
 * matches the order the API checks in.
 *
 * A group's setup (yuvoy-app#225): 409 `club_already_linked` is `clubLinked`,
 * which opens the person's own organiser in `details.organiserId`. 403
 * `not_club_holder` and `people_paused` stay `other` with the API's sentence,
 * and the group's 404 is `notFound`, as any other 404. `clubId` is a field, so
 * its 400 is `fields` like the rest. On the web `organiser_email_required` is
 * `emailRequired`: the API's sentence, with no button.
 */

/** The page's fields (`OrganiserInput`), each a `details` key with its own sentence. */
export const ORGANISER_PAGE_FIELDS = [
  "name",
  "destinationKey",
  "departments",
  "about",
  "links",
  "contactEmail",
  "runsIt",
] as const;

/** The event's fields (`OrganiserEventInput`). */
export const ORGANISER_EVENT_FIELDS = [
  "title",
  "department",
  "startsAt",
  "endsAt",
  "repeatsWeeklyUntil",
  "destinationKey",
  "venueName",
  "address",
  "free",
  "priceFromRupees",
  "priceNote",
  "link",
  "about",
] as const;

/**
 * Every key a form shows a sentence under: the bodies, a group's `clubId`, a
 * helper's `email`, the numbers' `on`.
 */
const KNOWN: ReadonlySet<string> = new Set<string>([
  ...ORGANISER_PAGE_FIELDS,
  ...ORGANISER_EVENT_FIELDS,
  "clubId",
  "email",
  "on",
]);

/**
 * The answer's `Retry-After` in seconds, or null. Read by name so it works
 * before and after the client carries it: yuvoy-app#223 adds
 * `YuvoyError.retryAfterSeconds`, filled from the header by the client.
 */
function retryAfterOf(error: YuvoyError): number | null {
  const seconds: unknown = (error as { retryAfterSeconds?: unknown })
    .retryAfterSeconds;
  return typeof seconds === "number" && Number.isFinite(seconds) && seconds > 0
    ? seconds
    : null;
}

/** A page link's own key: `links.0` to `links.2`. */
const LINK_KEY = /^links\.\d{1,2}$/;

/** Whether a `details` key is one a form can show a sentence under. */
export function isOrganiserField(key: string): boolean {
  return KNOWN.has(key) || LINK_KEY.test(key);
}

export type OrganiserRefusal =
  /**
   * 400 `invalid_input` naming fields, or 400 `no_account_with_that_email`
   * (`details.email`): each sentence under its field, everything typed kept.
   * `message` is the API's line for the whole.
   */
  | {
      kind: "fields";
      fields: Readonly<Record<string, string>>;
      message: string;
    }
  /** 401: the sign-in ended or is a recovery link. The middleware's line is not shown. */
  | { kind: "signedOut" }
  /** 403 `adult_confirmation_required`: the age step, then the same call once more. */
  | { kind: "age"; message: string }
  /** 409 `organiser_email_required`: the API's sentence, no button on the web. */
  | { kind: "emailRequired"; message: string }
  /** 503 `organisers_paused`: the paused state with Try again. */
  | { kind: "paused"; message: string }
  /** 404: `supply` closed, an unknown organiser, an unknown event, or not a helper. */
  | { kind: "notFound"; message: string }
  /** 403 `not_a_member`. */
  | { kind: "notMember"; message: string }
  /** 403 `not_owner`. */
  | { kind: "notOwner"; message: string }
  /**
   * 409 `club_already_linked`: the group has an organiser already, and
   * `details.organiserId` is the person's own, so the screen opens it.
   */
  | { kind: "clubLinked"; message: string; organiserId: string }
  /** 409 `event_has_ended`. */
  | { kind: "ended"; message: string }
  /** 409 `conflict`, with `details.state` (the organiser's or the event's). */
  | { kind: "conflict"; state: string | null; message: string }
  /**
   * 429: the API's sentence, and its `Retry-After` in seconds when the error
   * carries one (a day limit sends it; "too fast" does not).
   */
  | { kind: "limit"; message: string; retryAfterSec: number | null }
  /** No answer (offline, a stall, a timeout). A write may have gone through. */
  | { kind: "network" }
  /**
   * Anything else: a 400 with no `details` (the API's "Send it as the API
   * contract describes it."), a 5xx, a code this build does not know.
   * `message` is the API's for a 4xx, else null.
   */
  | { kind: "other"; message: string | null };

export type OrganiserRefusalKind = OrganiserRefusal["kind"];

const text = (value: unknown): string =>
  typeof value === "string" && value.trim() ? value.trim() : "";

/** The refusal an organiser route's error means. */
export function organiserRefusal(error: unknown): OrganiserRefusal {
  if (error instanceof NetworkError) return { kind: "network" };
  if (!(error instanceof YuvoyError)) return { kind: "other", message: null };

  const code: string = error.code;
  const said = text(error.message);
  const details = error.details;

  switch (error.status) {
    case 400: {
      if (code === "invalid_input" || code === "no_account_with_that_email") {
        const fields: Record<string, string> = {};
        for (const [key, value] of Object.entries(details)) {
          if (isOrganiserField(key) && text(value)) fields[key] = text(value);
        }
        const sentences = Object.values(fields);
        if (sentences.length > 0) {
          const whole =
            sentences.length === 1
              ? (sentences[0] ?? W.checkFields)
              : W.checkFields;
          return { kind: "fields", fields, message: said || whole };
        }
      }
      return { kind: "other", message: said || W.badBody };
    }
    case 401:
      return { kind: "signedOut" };
    case 403:
      if (code === "adult_confirmation_required")
        return { kind: "age", message: said || W.adultsOnly };
      if (code === "not_a_member")
        return { kind: "notMember", message: said || W.notMember };
      if (code === "not_owner")
        return { kind: "notOwner", message: said || W.notOwner };
      if (code === "not_club_holder")
        return { kind: "other", message: said || W.notClubHolder };
      if (code === "people_paused") {
        const ended = text(details.standing) === "ended";
        return {
          kind: "other",
          message: said || (ended ? W.peopleEnded : W.peoplePaused),
        };
      }
      return { kind: "other", message: said || null };
    case 404:
      return { kind: "notFound", message: said || W.notFound };
    case 409: {
      if (code === "organiser_email_required")
        return { kind: "emailRequired", message: said || W.needEmail };
      if (code === "event_has_ended")
        return { kind: "ended", message: said || W.notNow };
      if (code === "club_already_linked") {
        const organiserId = text(details.organiserId);
        // With no organiser to open, it is the API's sentence and nothing more.
        return organiserId
          ? { kind: "clubLinked", message: said || W.clubLinked, organiserId }
          : { kind: "other", message: said || W.clubLinked };
      }
      if (code === "conflict") {
        const state = text(details.state) || null;
        return {
          kind: "conflict",
          state,
          message: said || conflictWords(state),
        };
      }
      return { kind: "other", message: said || null };
    }
    case 429:
      return {
        kind: "limit",
        message: said || W.slowDown,
        retryAfterSec: retryAfterOf(error),
      };
    case 503:
      // The kill switch: a pause, never a fault.
      if (code === "organisers_paused")
        return { kind: "paused", message: said || W.paused };
      return { kind: "other", message: null };
    default:
      return { kind: "other", message: null };
  }
}

/** The API's sentence for a 409 `conflict` that came without one, by `details.state`. */
function conflictWords(state: string | null): string {
  if (state === "pending" || state === "not_verified")
    return W.helpersAfterCheck;
  if (state === "suspended") return W.suspended;
  if (state === "closed") return W.closed;
  return W.notNow;
}

/** The one line a refusal shows, for a screen that has no field to put it under. */
export function organiserRefusalLine(refusal: OrganiserRefusal): string {
  switch (refusal.kind) {
    case "signedOut":
      return W.signIn;
    case "network":
    case "other":
      return refusal.kind === "other" && refusal.message
        ? refusal.message
        : W.notNow;
    default:
      return refusal.message;
  }
}
