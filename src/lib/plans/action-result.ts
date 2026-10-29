import { isErrorEnvelope, YuvoyError } from "@/lib/api/errors";
import type { PlanActionResult, PlanView } from "./types";
import { planWords } from "./words";

/**
 * Turning what the API said about one plan action into a `PlanActionResult`,
 * for both pages (yuvoy-app#193, yuvoy-mobile#373).
 *
 * Two doors in, because the two pages reach the API two ways: the signed-in
 * page through the typed proxy client, which throws a `YuvoyError` on any
 * answer that is not ok, and the guest page through its own route handlers,
 * which a caller may read as a status and a body. Both come out the same, so
 * the plan view reads one shape whichever page drew it.
 */

/**
 * The reason and sentence in an error's `details`.
 *
 * Two kinds of details arrive. A refusal with a cause names it as
 * `details.reason` (`started`, `planner_leaves`, `nonce`). A field refusal
 * (`invalid_input`) is a map of field to sentence, `{ adult: "Tick to say
 * you are 18 or over." }`, and the field is the reason: the view needs to
 * know which box it was about, and the sentence is the one to show.
 */
function readDetails(
  code: string,
  details: Record<string, unknown> | undefined,
  message: string,
): { reason?: string; message: string } {
  if (!details) return { message };
  if (typeof details.reason === "string") {
    return { reason: details.reason, message };
  }
  if (code === "invalid_input") {
    for (const [field, sentence] of Object.entries(details)) {
      if (typeof sentence === "string" && sentence !== "") {
        return { reason: field, message: sentence };
      }
    }
  }
  return { message };
}

/**
 * A plan as it may be shown. `guestKey` is dropped: it is the guest page's
 * secret, answered once on a first reply, and the view has no use for it.
 * Taken out here rather than trusted to be absent, so no render can print it.
 */
function shown(plan: PlanView): PlanView {
  if (!("guestKey" in plan)) return plan;
  const copy = { ...plan };
  delete copy.guestKey;
  return copy;
}

function looksLikePlan(body: unknown): body is PlanView {
  return (
    typeof body === "object" &&
    body !== null &&
    typeof (body as { id?: unknown }).id === "string" &&
    Array.isArray((body as { times?: unknown }).times)
  );
}

/**
 * From a status and a parsed body (the body may be `undefined` for 202 and
 * 204, which carry none).
 */
export function planActionFromAnswer(
  status: number,
  body: unknown,
): PlanActionResult {
  if (status >= 200 && status < 300) {
    if (looksLikePlan(body)) return { kind: "ok", plan: shown(body) };
    if (status === 202) return { kind: "sent" };
    if (status === 204) return { kind: "gone" };
    // A 200 that is not a plan: the answer did not say what happened, so the
    // reader is told it did not go, and the answers stay filled in.
    return { kind: "refused", code: "internal_error", message: planWords.notSent };
  }
  if (status === 404) return { kind: "gone" };
  if (isErrorEnvelope(body)) {
    const { code, message, details } = body.error;
    return { kind: "refused", code, ...readDetails(code, details, message) };
  }
  return { kind: "refused", code: "internal_error", message: planWords.notSent };
}

/**
 * From whatever a client call threw. A `YuvoyError` is the API's refusal; a
 * `NetworkError` or anything else means nothing answered, which is `network`,
 * never a guess that the reply went.
 */
export function planActionFromThrown(error: unknown): PlanActionResult {
  if (error instanceof YuvoyError) {
    if (error.status === 404) return { kind: "gone" };
    return {
      kind: "refused",
      code: error.code,
      ...readDetails(error.code, error.details, error.message),
    };
  }
  return { kind: "refused", code: "network", message: planWords.notSent };
}
