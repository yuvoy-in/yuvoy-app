import { http, HttpResponse } from "msw";
import type { components } from "../src/lib/api/schema.gen";
import { mockHeaders } from "./fixtures";
import {
  defaultAlerts,
  defaultDrafts,
  manyAlerts,
  manyDrafts,
} from "./trigo-list-fixtures";

/**
 * The date alerts and trip drafts on the signed-in number (yuvoy-app#220):
 * `GET /me/date-alerts`, `DELETE /me/date-alerts/{id}`, `GET /me/trip-drafts`
 * and `DELETE /me/trip-drafts/{id}`. Session only: no `Bearer sess_` is
 * `401`. The reads are not behind the release, as in the API.
 *
 * Under any scenario: one waiting alert, one fired, one waiting on a gone
 * card, and two drafts (`trigo-list-fixtures.ts`). Each scenario below opens
 * `trigo` at `staff`:
 *
 *   - `trigo-lists`: that, and nothing else.
 *   - `trigo-lists-none`: no alerts and no drafts.
 *   - `trigo-lists-many`: 50 waiting and 50 fired; one 14-date draft with
 *     cards on 3 days, one day 12 cards long.
 *   - `trigo-lists-down`: both reads are `503 unavailable`.
 *   - `trigo-lists-gone`: a stop or a delete is `404 not_found` with the
 *     API's sentence, and the item is gone from the next read, as when the
 *     phone took it away first.
 *   - `trigo-lists-expired`: every route is `401 unauthorized`.
 *
 * The lists are kept per scenario and session, so a stop or a delete stays
 * done for the next read.
 */

type TrigoDateAlert = components["schemas"]["TrigoDateAlert"];
type TrigoTripDraft = components["schemas"]["TrigoTripDraft"];

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8099/v1";
const url = (p: string) => `${BASE}${p}`;

/** The API's sentences (yuvoy-api `handler/trigo_alerts_drafts.go`). */
export const ALERT_GONE = "We could not find that date alert.";
export const DRAFT_GONE = "We could not find that trip draft.";
export const LISTS_DOWN = "Trigo is not available right now. Try again later.";
const SIGNED_OUT = "Sign in to see this.";

/** Every scenario of this file. See above for each. */
export const TRIGO_LIST_SCENARIOS: readonly string[] = [
  "trigo-lists",
  "trigo-lists-none",
  "trigo-lists-many",
  "trigo-lists-down",
  "trigo-lists-gone",
  "trigo-lists-expired",
];

let requestSeq = 0;
const rid = () =>
  `01J${(++requestSeq).toString(36).toUpperCase().padStart(6, "0")}TLST`;

function envelope(code: string, message: string, status: number) {
  return HttpResponse.json(
    { error: { code, message, requestId: rid() } },
    { status, headers: mockHeaders(rid()) },
  );
}

function scenarioOf(request: Request): string {
  return (
    request.headers.get("x-yuvoy-scenario") ??
    new URL(request.url).searchParams.get("__scenario") ??
    "ok"
  );
}

type Lists = { alerts: TrigoDateAlert[]; drafts: TrigoTripDraft[] };
const states = new Map<string, Lists>();

function listsOf(scenario: string, auth: string): Lists {
  const key = `${scenario}|${auth}`;
  let lists = states.get(key);
  if (!lists) {
    lists =
      scenario === "trigo-lists-none"
        ? { alerts: [], drafts: [] }
        : scenario === "trigo-lists-many"
          ? { alerts: manyAlerts(), drafts: manyDrafts() }
          : { alerts: defaultAlerts(), drafts: defaultDrafts() };
    states.set(key, lists);
  }
  return lists;
}

/** The session, or the answer that refuses it. */
function guard(
  request: Request,
): { scenario: string; lists: Lists } | Response {
  const auth = request.headers.get("authorization");
  const scenario = scenarioOf(request);
  if (!auth || !auth.includes("Bearer sess_")) {
    return envelope("unauthorized", SIGNED_OUT, 401);
  }
  if (scenario === "trigo-lists-expired") {
    return envelope("unauthorized", SIGNED_OUT, 401);
  }
  return { scenario, lists: listsOf(scenario, auth) };
}

function idOf(params: Record<string, string | readonly string[] | undefined>) {
  return String(params.id ?? "").toLowerCase();
}

export const trigoListHandlers = [
  http.get(url("/me/date-alerts"), ({ request }) => {
    const g = guard(request);
    if (g instanceof Response) return g;
    if (g.scenario === "trigo-lists-down") {
      return envelope("unavailable", LISTS_DOWN, 503);
    }
    return HttpResponse.json(
      { alerts: g.lists.alerts },
      { headers: mockHeaders(rid()) },
    );
  }),

  http.delete(url("/me/date-alerts/:id"), ({ request, params }) => {
    const g = guard(request);
    if (g instanceof Response) return g;
    const id = idOf(params);
    const at = g.lists.alerts.findIndex((a) => a.id.toLowerCase() === id);
    if (at === -1 || g.scenario === "trigo-lists-gone") {
      if (at !== -1) g.lists.alerts.splice(at, 1);
      return envelope("not_found", ALERT_GONE, 404);
    }
    g.lists.alerts.splice(at, 1);
    return new HttpResponse(null, { status: 204, headers: mockHeaders(rid()) });
  }),

  http.get(url("/me/trip-drafts"), ({ request }) => {
    const g = guard(request);
    if (g instanceof Response) return g;
    if (g.scenario === "trigo-lists-down") {
      return envelope("unavailable", LISTS_DOWN, 503);
    }
    return HttpResponse.json(
      { drafts: g.lists.drafts },
      { headers: mockHeaders(rid()) },
    );
  }),

  http.delete(url("/me/trip-drafts/:id"), ({ request, params }) => {
    const g = guard(request);
    if (g instanceof Response) return g;
    const id = idOf(params);
    const at = g.lists.drafts.findIndex((d) => d.id.toLowerCase() === id);
    if (at === -1 || g.scenario === "trigo-lists-gone") {
      if (at !== -1) g.lists.drafts.splice(at, 1);
      return envelope("not_found", DRAFT_GONE, 404);
    }
    g.lists.drafts.splice(at, 1);
    return new HttpResponse(null, { status: 204, headers: mockHeaders(rid()) });
  }),
];

/** Test-only: forget every stop and delete between cases. */
export function __resetTrigoListMocks(): void {
  states.clear();
}
