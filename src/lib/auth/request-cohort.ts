import { cache } from "react";
import type { Cohort } from "@/lib/site/app-config";
import { readSessionCookie } from "./session-cookie";
import { callUpstream } from "./upstream";

/**
 * Who this request's traveller is among the people who see releases early,
 * read on the server: `cohort` on `GET /me` (yuvoy-app#181, R0-T5).
 *
 * The server's half of `releaseOpen`, for a page that decides a release before
 * it renders, as a gated page decides access (`request-access.ts`). Nothing
 * calls it in R0, where nothing is gated; R2's screens do.
 *
 * Reading the cookie makes the page that asks render per request, so only a
 * page that shows a release's screen should ask, never the root layout.
 *
 * ## Null on anything but an answer
 *
 * No session, a session the API refused, a failure and a slow second are all
 * `null`: the cohort of everybody who is not staff or early. A release at
 * `all` is open to null, and one at `staff` or `early` stays shut, which is
 * the side to fail on for a screen still being tried.
 */

/** How long a page waits for `GET /me`: the gate's three seconds. */
export const COHORT_TIMEOUT_MS = 3_000;

function cohortOf(body: unknown): Cohort {
  if (typeof body !== "object" || body === null) return null;
  const cohort = (body as { cohort?: unknown }).cohort;
  return cohort === "staff" || cohort === "early" ? cohort : null;
}

async function readCohort(scenario?: string): Promise<Cohort> {
  const token = await readSessionCookie();
  if (!token) return null;
  try {
    const answer = await callUpstream({
      method: "GET",
      path: "/me",
      token,
      scenario,
      signal: AbortSignal.timeout(COHORT_TIMEOUT_MS),
    });
    if (answer.status < 200 || answer.status >= 300) return null;
    return cohortOf(answer.body);
  } catch (cause) {
    console.error(
      "[cohort] GET /me failed; releases read as they do for everybody.",
      cause,
    );
    return null;
  }
}

/** One `GET /me` per request, however many parts of a page ask. */
export const getCohort = cache(readCohort);
