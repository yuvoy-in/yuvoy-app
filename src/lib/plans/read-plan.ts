import { headers } from "next/headers";
import { isErrorEnvelope } from "@/lib/api/errors";
import { readSessionCookie } from "@/lib/auth/session-cookie";
import { callUpstream } from "@/lib/auth/upstream";
import type { PlanView } from "./types";

/**
 * The signed-in plan page's one read, on the server: `GET /plans/{id}` with
 * the session from the cookie (yuvoy-app#193). Server only: `callUpstream`
 * reaches the API directly, with the token, which no browser code holds.
 *
 * ## What the page can be told
 *
 *   - `not-found`: an id that is not a plan id, or the API's 404. The 404
 *     covers more than "no such plan": a plan this reader is not on, a plan
 *     purged, and plans closed to this reader (the release is off for them)
 *     all read the same, by the API's design, so a stranger cannot tell a
 *     real plan from a made-up id. The page shows the app's own not-found
 *     page with its own words for all of them.
 *   - `signed-out`: no session cookie, or a session the API no longer takes.
 *     With no cookie nothing is asked at all: the API would only say 401.
 *   - `paused`: `503 plans_unavailable`, plans switched off for a moment.
 *   - `failed`: anything else, or no answer, with the request id when there
 *     is one so the error state can show it.
 *
 * A malformed id is `not-found` before the cookie is read, signed in or not.
 * The API would answer it 404 (or 400) whoever asked, so a signed-out reader
 * of `/plans/not-a-plan` is told the truth, "we do not have this one",
 * rather than asked to sign in to find that out.
 */

export type PlanRead =
  | { kind: "plan"; plan: PlanView }
  | { kind: "not-found" }
  | { kind: "signed-out" }
  | { kind: "paused"; requestId?: string }
  | { kind: "failed"; status?: number; requestId?: string };

/** A plan id is a UUID; nothing else is worth sending to the API. */
export const PLAN_ID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The page's wait: the same eight seconds `callUpstream` gives any read. */
const READ_TIMEOUT_MS = 8_000;

/**
 * Enough of a plan to draw. The contract types the 200, but the page draws
 * every list it carries, and a body that is not one would take the page down
 * on `.map` rather than land on the error state.
 */
function isPlan(body: unknown): body is PlanView {
  if (typeof body !== "object" || body === null) return false;
  const b = body as Record<string, unknown>;
  return (
    typeof b.id === "string" &&
    typeof b.title === "string" &&
    typeof b.state === "string" &&
    typeof b.timeZone === "string" &&
    typeof (b.planner as { name?: unknown } | undefined)?.name === "string" &&
    ["times", "ideas", "items", "costs", "people"].every((k) =>
      Array.isArray(b[k]),
    )
  );
}

async function visitorHeaders(): Promise<Headers | undefined> {
  try {
    return await headers();
  } catch {
    // Outside a request (a unit test): no visitor address to pass on.
    return undefined;
  }
}

export async function readPlanForPage(
  id: string,
  scenario?: string,
): Promise<PlanRead> {
  if (!PLAN_ID.test(id)) return { kind: "not-found" };

  const token = await readSessionCookie();
  if (!token) return { kind: "signed-out" };

  let answer: Awaited<ReturnType<typeof callUpstream>>;
  try {
    answer = await callUpstream({
      method: "GET",
      path: `/plans/${encodeURIComponent(id)}`,
      token,
      scenario,
      visitor: await visitorHeaders(),
      signal: AbortSignal.timeout(READ_TIMEOUT_MS),
    });
  } catch (cause) {
    console.error("[plans] GET /plans/{id} did not answer.", cause);
    return { kind: "failed" };
  }

  const requestId = answer.requestId ?? undefined;
  if (answer.status === 200 && isPlan(answer.body)) {
    // The guest page's secret, never the signed-in page's. Dropped so no
    // render can print it, whatever the API sends.
    const plan = { ...answer.body };
    delete plan.guestKey;
    return { kind: "plan", plan };
  }
  if (answer.status === 401) return { kind: "signed-out" };
  if (answer.status === 404 || answer.status === 400) {
    return { kind: "not-found" };
  }
  if (
    answer.status === 503 &&
    isErrorEnvelope(answer.body) &&
    answer.body.error.code === "plans_unavailable"
  ) {
    return { kind: "paused", requestId };
  }
  return { kind: "failed", status: answer.status, requestId };
}
