import { NetworkError, YuvoyError } from "@/lib/api/errors";
import type { operations } from "@/lib/api/schema.gen";
import {
  civilFromDate,
  civilInZone,
  clockTime,
  dayMonth,
  weekdayName,
} from "@/lib/format/date";
import { DOOR_WORDS as D } from "./door-words";

/**
 * The member's side of the door (yuvoy-app#226, the web half of
 * yuvoy-mobile#394, yuvoy-api #483): reading a typed code or a `/door#CODE`
 * link, what a check-in shows, and what each refusal of
 * `POST /organiser-check-ins` means. Pure, as the phone's
 * `packages/core/src/organisers/door-check-in.ts` and
 * `packages/core/src/operator/check-in-code.ts` on yuvoy-mobile dev.
 *
 * Branches on the status and `error.code`, never on the words. The words shown
 * are the API's own `message`, with its known sentence as the fallback when an
 * answer came without one. There is no queue at the door.
 */

/** How the code reached the page: the card's link (`/door#CODE`), or typed. */
export type CheckInVia = "portal_link" | "typed";

/** The 200 answer of `POST /organiser-check-ins`, as the contract generates it. */
export type CheckInAnswer =
  operations["checkInAtTheDoor"]["responses"][200]["content"]["application/json"];

/** Fewest and most code characters the API takes. */
export const CHECK_IN_CODE_MIN = 8;
export const CHECK_IN_CODE_MAX = 12;

/** Every door time is in India today: the answer carries no zone (#394). */
export const DOOR_ZONE = "Asia/Kolkata";

/** A code as it is sent: capitals, no spaces or hyphens. The API ignores all three. */
export function normaliseCode(raw: string): string {
  return raw.replace(/[\s-]+/g, "").toUpperCase();
}

/**
 * Whether Check in can be pressed: 8 to 12 code characters, letters and
 * digits only, as the phone's `typedCodeReady`.
 */
export function codeReady(raw: string): boolean {
  const code = normaliseCode(raw);
  return (
    /^[A-Z0-9]+$/.test(code) &&
    code.length >= CHECK_IN_CODE_MIN &&
    code.length <= CHECK_IN_CODE_MAX
  );
}

/**
 * The code in the address's `#` part (`#K7QM2XPA`, `#k7qm-2xpa`), as it is
 * sent, or null when the part is empty or is not a code.
 */
export function codeFromHash(hash: string): string | null {
  let raw = hash.startsWith("#") ? hash.slice(1) : hash;
  try {
    raw = decodeURIComponent(raw);
  } catch {
    return null;
  }
  return codeReady(raw) ? normaliseCode(raw) : null;
}

/** "19:42" in India, or "" for a time that does not parse. */
export function doorTime(iso: string): string {
  const civil = civilInZone(iso, DOOR_ZONE);
  return civil ? clockTime(civil) : "";
}

/** What a 200 shows: calm, an already used code too. `sub` is the event's title. */
export function checkInDone(answer: CheckInAnswer): {
  title: string;
  sub: string;
} {
  const sub = answer.eventTitle;
  if (answer.alreadyCheckedIn) {
    return { title: D.already(doorTime(answer.checkedInAt)), sub };
  }
  return { title: D.checkedIn(answer.firstName.trim()), sub };
}

export type CheckInOutcome =
  /** 400, 404, 409 `own_code`, 409 `check_in_not_today`, 429: the API's sentence; the code stays. */
  | { kind: "refused"; message: string }
  /** 403 `adult_confirmation_required`: the age step, then the same code once more. */
  | { kind: "age" }
  /** 401: the sign-in ended or is a recovery link. */
  | { kind: "signIn" }
  /** 503 `organisers_paused`: the paused state with Try again. */
  | { kind: "paused"; message: string }
  /** No answer: the code stays, nothing is queued. */
  | { kind: "offline"; message: string }
  /** A 500, or anything this page cannot read: its own sentence with Try again. */
  | { kind: "broken"; message: string };

const text = (value: unknown): string =>
  typeof value === "string" && value.trim() ? value.trim() : "";

const BROKEN: CheckInOutcome = { kind: "broken", message: D.broken };

/** "This code is for Sat 24 Oct." from `details.validOn`, as the API writes it. */
function notTodayLine(validOn: unknown): string {
  const civil = typeof validOn === "string" ? civilFromDate(validOn) : null;
  return civil
    ? D.notToday(`${weekdayName(civil)} ${dayMonth(civil)}`)
    : D.notTodayNoDay;
}

/** What the door page does after `POST /organiser-check-ins` refused. */
export function checkInRefusal(error: unknown): CheckInOutcome {
  if (error instanceof NetworkError) {
    return { kind: "offline", message: D.offline };
  }
  if (!(error instanceof YuvoyError)) return BROKEN;
  // An answer that was not the API's envelope: the client names it internal_error.
  if (error.code === "internal_error") return BROKEN;

  const code: string = error.code;
  const said = text(error.message);
  const refused = (fallback: string): CheckInOutcome => ({
    kind: "refused",
    message: said || fallback,
  });

  switch (error.status) {
    case 400:
      return refused(D.badCode);
    case 401:
      return { kind: "signIn" };
    case 403:
      if (code === "adult_confirmation_required") return { kind: "age" };
      return said ? refused(said) : BROKEN;
    case 404:
      return refused(D.notFound);
    case 409:
      if (code === "own_code") return refused(D.ownCode);
      if (code === "check_in_not_today") {
        return refused(notTodayLine(error.details.validOn));
      }
      return said ? refused(said) : BROKEN;
    case 429:
      return refused(D.tooFast);
    case 503:
      // The kill switch: a pause, never a fault.
      if (code === "organisers_paused") {
        return { kind: "paused", message: said || D.paused };
      }
      return BROKEN;
    default:
      return BROKEN;
  }
}
