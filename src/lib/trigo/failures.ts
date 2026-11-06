import { StalledError } from "@/lib/api/deadline";
import { NetworkError, YuvoyError } from "@/lib/api/errors";

/**
 * How a failed Trigo call reads for the chat (yuvoy-app#223), by status and
 * `error.code` only. Moved out of `./api` word for word (yuvoy-app#243), which
 * still exports these names, so imports from `./api` keep working.
 */

export function isSignedOut(error: unknown): boolean {
  return error instanceof YuvoyError && error.status === 401;
}

export type TrigoFailure =
  | { kind: "signed_out" } // 401
  | { kind: "not_released"; message: string } // 404 on turn or accept
  | { kind: "age" } // 403 adult_confirmation_required
  | { kind: "consent"; noticeVersion: string | null } // 409 consent_required, details.noticeVersion
  | { kind: "limit"; resetsAt: string | null; message: string } // 429 daily_limit_reached, details.resetsAt
  | { kind: "rate_limited"; message: string; retryAfterSeconds?: number } // 429 rate_limited
  | { kind: "in_progress"; retryAfterSeconds?: number } // 409 turn_in_progress
  | { kind: "idempotency_in_progress"; retryAfterSeconds?: number } // 409 idempotency_in_progress: read the chat, do not resend
  | { kind: "busy"; message: string; retryAfterSeconds?: number } // 503: show the API's sentence, Try again with the same key
  | { kind: "offline" } // no connection / navigator.onLine false
  | { kind: "rejected" } // 400, 409 idempotency_key_reuse: the same send gets the same answer
  | { kind: "failure"; retryAfterSeconds?: number }; // anything else (500, unknown)

function isOffline(): boolean {
  return typeof navigator !== "undefined" && navigator.onLine === false;
}

function stringDetail(error: YuvoyError, name: string): string | null {
  const v = error.details[name];
  return typeof v === "string" ? v : null;
}

/** The longest the Trigo chat holds Send or Try again, or a card its buttons, for a `Retry-After`, in seconds. */
export const TRIGO_WAIT_MAX_SECONDS = 120;

/**
 * The answer's `Retry-After`, for the kinds that offer Try again or Send
 * again: the API sends `2` on `409 idempotency_in_progress`, and the seconds
 * until its limiter lets one more turn through on `429 rate_limited`
 * (yuvoy-api#598). The sheet waits that long. `429 daily_limit_reached`
 * carries none: its wait is `details.resetsAt`.
 * Nothing when there was none, so those kinds read as they always did.
 * A longer wait than `TRIGO_WAIT_MAX_SECONDS` is cut to it, so a wrong
 * header holds Send and Try again for two minutes at most. The error keeps
 * the value as sent. A card's failures carry it the same way
 * (`classifyCardError` in `./actions`).
 */
export function trigoWaitOf(error: YuvoyError): { retryAfterSeconds?: number } {
  return error.retryAfterSeconds === undefined
    ? {}
    : {
        retryAfterSeconds: Math.min(
          error.retryAfterSeconds,
          TRIGO_WAIT_MAX_SECONDS,
        ),
      };
}

/**
 * Which state a Trigo failure puts the chat in. Branches on status and
 * `error.code` only (YuvoyError), never on the message text; the message is
 * carried only where the screen shows the API's own sentence.
 */
export function classifyTrigoError(error: unknown): TrigoFailure {
  if (isOffline()) return { kind: "offline" };
  if (error instanceof NetworkError) {
    /*
      A send that went quiet for `WRITE_STALL_MS` is not a lost connection:
      the turn may have been answered. "Try again" with the same key returns
      it if so, which is what the failure line offers.
    */
    return error.cause instanceof StalledError
      ? { kind: "failure" }
      : { kind: "offline" };
  }
  if (!(error instanceof YuvoyError)) return { kind: "failure" };
  const { status, code } = error;
  if (status === 400) return { kind: "rejected" };
  if (status === 401) return { kind: "signed_out" };
  if (status === 404) return { kind: "not_released", message: error.message };
  if (status === 403 && code === "adult_confirmation_required") {
    return { kind: "age" };
  }
  if (status === 409) {
    if (code === "consent_required") {
      return {
        kind: "consent",
        noticeVersion: stringDetail(error, "noticeVersion"),
      };
    }
    if (code === "turn_in_progress") {
      return { kind: "in_progress", ...trigoWaitOf(error) };
    }
    if (code === "idempotency_in_progress") {
      return { kind: "idempotency_in_progress", ...trigoWaitOf(error) };
    }
    if (code === "idempotency_key_reuse") return { kind: "rejected" };
    return { kind: "failure", ...trigoWaitOf(error) };
  }
  if (status === 429) {
    if (code === "daily_limit_reached") {
      return {
        kind: "limit",
        resetsAt: stringDetail(error, "resetsAt"),
        message: error.message,
      };
    }
    return {
      kind: "rate_limited",
      message: error.message,
      ...trigoWaitOf(error),
    };
  }
  if (status === 503) {
    return { kind: "busy", message: error.message, ...trigoWaitOf(error) };
  }
  return { kind: "failure", ...trigoWaitOf(error) };
}
