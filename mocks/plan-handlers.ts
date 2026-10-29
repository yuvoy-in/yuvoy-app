import { http, HttpResponse } from "msw";
import type { components } from "../src/lib/api/schema.gen";
import { mockHeaders } from "./fixtures";
import {
  PLAN_IDS,
  decidedPlanView,
  memberMe,
  openPlanView,
  payLinkTamperedView,
  plannerPlanView,
  withReply,
} from "./plan-fixtures";

type PlanView = components["schemas"]["PlanView"];
type PlanReply = components["schemas"]["PlanReply"];

/**
 * A member's plan calls (yuvoy-app#193): read, reply, leave, report, with a
 * session. The guest page's calls by link live in `plan-link-handlers.ts`.
 *
 * ## Stateless, on purpose
 *
 * Every answer is computed from the plan the scenario names and the request
 * in hand: a reply answers that plan with the reply applied (`withReply`),
 * and nothing is kept for the next read. The reply's answer IS the plan, so
 * the page never reads again after one and has nothing to notice; and with
 * nothing kept, one test's reply cannot leak into the next test or the next
 * e2e spec on the same server.
 *
 * ## Scenarios
 *
 *   - `plan-member` (and no scenario): Ravi, a signed-in member, on either
 *     plan in `PLAN_IDS`. The decided one has two costs split, a payee and a
 *     pay link on each share.
 *   - `plan-planner`: Asha's own view. No pay link (she paid), and leaving is
 *     refused with `409 conflict` `planner_leaves`, as the API does.
 *   - `plan-404`: the API's 404, which is also plans closed to this reader.
 *   - `plan-unavailable`: `503 plans_unavailable`, plans paused.
 *   - `plan-paylink-bad`: the decided plan with a pay link that pays another
 *     UPI ID than the one shown, which the page must not turn into a button.
 *
 * Any id not in `PLAN_IDS` is a 404, as an unknown plan is.
 */

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8099/v1";
const url = (p: string) => `${BASE}${p}`;

let seq = 0;
const rid = () => `01JPLN${(++seq).toString(36).toUpperCase().padStart(5, "0")}`;

function envelope(
  status: number,
  code: string,
  message: string,
  details?: Record<string, unknown>,
) {
  const requestId = rid();
  return HttpResponse.json(
    { error: { code, message, requestId, ...(details ? { details } : {}) } },
    { status, headers: mockHeaders(requestId) },
  );
}

function scenarioOf(request: Request): string {
  return (
    request.headers.get("x-yuvoy-scenario") ??
    new URL(request.url).searchParams.get("__scenario") ??
    "plan-member"
  );
}

function hasSession(request: Request): boolean {
  const header = request.headers.get("authorization") ?? "";
  return header.startsWith("Bearer sess_");
}

/** The plan this reader sees under this scenario, or null for a 404. */
function planFor(id: string, scenario: string): PlanView | null {
  if (scenario === "plan-404") return null;
  if (id === PLAN_IDS.decided) {
    if (scenario === "plan-planner") return plannerPlanView();
    if (scenario === "plan-paylink-bad") return payLinkTamperedView();
    return decidedPlanView("member", memberMe());
  }
  if (id === PLAN_IDS.open) {
    if (scenario === "plan-planner") return openPlanView("planner", null);
    return openPlanView("member", memberMe());
  }
  return null;
}

/**
 * The refusals every call shares, in the API's order: no session, plans
 * paused, then the plan itself. Either the refusal to answer with, or the
 * plan the call may go ahead on.
 */
function gate(
  request: Request,
  id: string,
): { refusal: Response } | { plan: PlanView } {
  if (!hasSession(request)) {
    return { refusal: envelope(401, "unauthorized", "Sign in again.") };
  }
  const scenario = scenarioOf(request);
  if (scenario === "plan-unavailable") {
    return {
      refusal: envelope(503, "plans_unavailable", "Plans are paused for a moment."),
    };
  }
  const plan = planFor(id, scenario);
  if (!plan) return { refusal: envelope(404, "not_found", "We could not find that.") };
  return { plan };
}

const REPLY_KEYS = new Set(["name", "adult", "answers", "claims", "paid"]);
const isStrings = (v: unknown): v is string[] =>
  Array.isArray(v) && v.every((x) => typeof x === "string");

/** The API's field checks on a reply, by field, or null when it is sound. */
function replyProblem(plan: PlanView, body: unknown): Record<string, string> | null {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return { body: "Send a reply." };
  }
  const reply = body as Record<string, unknown>;
  for (const key of Object.keys(reply)) {
    if (!REPLY_KEYS.has(key)) return { [key]: "This field is not part of a reply." };
  }
  const options = new Set([
    ...plan.times.map((t) => t.id),
    ...plan.ideas.map((i) => i.id),
  ]);
  if (reply.answers !== undefined) {
    if (
      !Array.isArray(reply.answers) ||
      !reply.answers.every(
        (a) =>
          typeof a === "object" &&
          a !== null &&
          options.has((a as { optionId?: unknown }).optionId as string) &&
          ["can", "maybe", "cant", "vote"].includes((a as { answer?: unknown }).answer as string),
      )
    ) {
      return { answers: "An answer names an option this plan does not have." };
    }
  }
  const items = new Set(plan.items.map((i) => i.id));
  if (reply.claims !== undefined && !(isStrings(reply.claims) && reply.claims.every((c) => items.has(c)))) {
    return { claims: "A claim names an item this plan does not have." };
  }
  const costs = new Set(plan.costs.map((c) => c.id));
  if (reply.paid !== undefined && !(isStrings(reply.paid) && reply.paid.every((c) => costs.has(c)))) {
    return { paid: "A paid mark names a cost this plan does not have." };
  }
  if (plan.me && !plan.me.adultConfirmed && plan.canReply && reply.adult !== true) {
    return { adult: "Tick to say you are 18 or over." };
  }
  return null;
}

const REASONS = new Set(["unsafe", "harassment", "spam", "impersonation", "other"]);

export const planHandlers = [
  http.get(url("/plans/:id"), ({ request, params }) => {
    const gated = gate(request, String(params.id));
    if ("refusal" in gated) return gated.refusal;
    return HttpResponse.json(gated.plan, { headers: mockHeaders(rid()) });
  }),

  http.put(url("/plans/:id/reply"), async ({ request, params }) => {
    const gated = gate(request, String(params.id));
    if ("refusal" in gated) return gated.refusal;
    const { plan } = gated;
    const body: unknown = await request.json().catch(() => null);
    const problem = replyProblem(plan, body);
    if (problem) {
      return envelope(400, "invalid_input", Object.values(problem)[0] ?? "", problem);
    }
    const reply = body as PlanReply;
    const paidOnly =
      reply.name === undefined &&
      reply.adult === undefined &&
      reply.answers === undefined &&
      reply.claims === undefined;
    if (!plan.canReply && !paidOnly) {
      return envelope(409, "plan_closed", "Replies are closed.", { reason: "started" });
    }
    return HttpResponse.json(withReply(plan, reply), { headers: mockHeaders(rid()) });
  }),

  http.delete(url("/plans/:id/reply"), ({ request, params }) => {
    const gated = gate(request, String(params.id));
    if ("refusal" in gated) return gated.refusal;
    const { plan } = gated;
    if (plan.role === "planner") {
      return envelope(409, "conflict", "The planner cannot leave.", {
        reason: "planner_leaves",
      });
    }
    return new HttpResponse(null, { status: 204, headers: mockHeaders(rid()) });
  }),

  http.post(url("/plans/:id/reports"), async ({ request, params }) => {
    const gated = gate(request, String(params.id));
    if ("refusal" in gated) return gated.refusal;
    const { plan } = gated;
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body || typeof body.reason !== "string" || !REASONS.has(body.reason)) {
      return envelope(400, "invalid_input", "Pick a reason.");
    }
    if (body.note !== undefined && (typeof body.note !== "string" || body.note.length > 300)) {
      return envelope(400, "invalid_input", "Keep the note to 300 characters.", {
        note: "Keep the note to 300 characters.",
      });
    }
    if (
      body.personName !== undefined &&
      !plan.people.some((p) => p.name === body.personName)
    ) {
      return envelope(400, "invalid_input", "That name is not on this plan.", {
        personName: "That name is not on this plan.",
      });
    }
    return new HttpResponse(null, { status: 202, headers: mockHeaders(rid()) });
  }),
];
