import { http } from "msw";
import type { components } from "../src/lib/api/schema.gen";
import { json, refusal, scenarioOf, sessionOf, url } from "./follow-state";

type PlanSummary = components["schemas"]["PlanSummary"];

/**
 * The traveller's own plans, `GET /me/plans` (yuvoy-mobile#392): what
 * Invite to a plan picks from. Refused in the API's order (yuvoy-api
 * handler/plans.go `gate` and `List`): no session 401, plans closed to the
 * caller 404, plans paused 503, then a bad `when`, `limit` or `cursor` 400.
 *
 * The plans release is `off` unless a `crew-invite-*` scenario opens it at
 * `all` (all but `crew-invite-plans-off`), so with no scenario this answers
 * 404, as the API does today.
 *
 *   - upcoming: two plans the traveller made (one open, one decided) and one
 *     they are a member of. `crew-invite-none` has only the member one.
 *   - past: one done plan they made.
 *   - `crew-invite-paused`: 503 `plans_unavailable`.
 */

export const PLANS_SAY = {
  signIn: "Sign in to make plans with friends.",
  notFound: "We could not find that plan.",
  paused: "Plans are paused for a moment. Try again soon.",
  badCursor: "That page of your plans is not valid. Start again from the top.",
} as const;

/** `releases.plans` on `GET /app-config` under the scenario, or null for off. */
export function plansStageOf(scenario: string): "all" | null {
  return scenario.startsWith("crew-invite-") &&
    scenario !== "crew-invite-plans-off"
    ? "all"
    : null;
}

/**
 * The plans gate the invite shares, after People's: plans closed is 404,
 * plans paused 503.
 */
export function plansGate(scenario: string): Response | null {
  if (!plansStageOf(scenario)) {
    return refusal(404, "not_found", PLANS_SAY.notFound);
  }
  if (scenario === "crew-invite-paused") {
    return refusal(503, "plans_unavailable", PLANS_SAY.paused);
  }
  return null;
}

/** Fixed ids, so a test can pick a plan by name. */
export const MY_PLAN_IDS = {
  open: "9e3a7b20-4d5c-4f60-9b0a-1c2d3e4f5a61",
  decided: "9e3a7b20-4d5c-4f60-9b0a-1c2d3e4f5a62",
  member: "9e3a7b20-4d5c-4f60-9b0a-1c2d3e4f5a63",
  done: "9e3a7b20-4d5c-4f60-9b0a-1c2d3e4f5a64",
} as const;

const OPEN: PlanSummary = {
  id: MY_PLAN_IDS.open,
  title: "Dinner at the beach shack",
  templateKey: "dinner",
  role: "planner",
  state: "open",
  startsAt: "2026-08-22T13:30:00.000Z",
  timeZone: "Asia/Kolkata",
  placeText: "Full Moon Cafe, Havelock",
  going: 3,
  myReply: "answered",
};

const DECIDED: PlanSummary = {
  id: MY_PLAN_IDS.decided,
  title: "Trek to Elephant Beach",
  templateKey: "trek",
  role: "planner",
  state: "decided",
  startsAt: "2026-08-24T01:30:00.000Z",
  timeZone: "Asia/Kolkata",
  placeText: "Elephant Beach trailhead",
  going: 5,
  myReply: "going",
};

const MEMBER: PlanSummary = {
  id: MY_PLAN_IDS.member,
  title: "Karaoke night",
  templateKey: "karaoke",
  role: "member",
  state: "open",
  startsAt: "2026-08-23T14:30:00.000Z",
  timeZone: "Asia/Kolkata",
  going: 6,
  myReply: "maybe",
};

const DONE: PlanSummary = {
  id: MY_PLAN_IDS.done,
  title: "Potluck at Ravi's",
  templateKey: "potluck",
  role: "planner",
  state: "done",
  startsAt: "2026-08-08T13:00:00.000Z",
  timeZone: "Asia/Kolkata",
  placeText: "Ravi's flat",
  going: 7,
  myReply: "going",
};

/** The plans `GET /me/plans` lists under the scenario. */
export function myPlans(
  scenario: string,
  when: "upcoming" | "past",
): PlanSummary[] {
  if (when === "past") return [{ ...DONE }];
  if (scenario === "crew-invite-none") return [{ ...MEMBER }];
  return [{ ...OPEN }, { ...DECIDED }, { ...MEMBER }];
}

/** A plan this traveller made and can still invite to, or undefined. */
export function myPlanToInvite(
  scenario: string,
  planId: string,
): PlanSummary | undefined {
  return [...myPlans(scenario, "upcoming"), ...myPlans(scenario, "past")].find(
    (p) => p.id === planId && p.role === "planner",
  );
}

export const myPlansHandlers = [
  http.get(url("/me/plans"), ({ request }) => {
    const scenario = scenarioOf(request);
    if (!sessionOf(request)) {
      return refusal(401, "unauthorized", PLANS_SAY.signIn);
    }
    const shut = plansGate(scenario);
    if (shut) return shut;

    const q = new URL(request.url).searchParams;
    const when = q.get("when") || "upcoming";
    if (when !== "upcoming" && when !== "past") {
      return refusal(400, "invalid_input", "when must be upcoming or past", {
        when: "upcoming or past",
      });
    }
    let limit = 20;
    const rawLimit = q.get("limit");
    if (rawLimit) {
      limit = /^\d+$/.test(rawLimit) ? Number(rawLimit) : 0;
      if (limit < 1 || limit > 50) {
        return refusal(400, "invalid_input", "limit must be between 1 and 50", {
          limit: "1 to 50",
        });
      }
    }
    // The cursor is the place to start, as `p<n>`; anything else is refused.
    const cursor = q.get("cursor") ?? "";
    let from = 0;
    if (cursor) {
      const m = /^p(\d+)$/.exec(cursor);
      if (!m) {
        return refusal(400, "invalid_input", PLANS_SAY.badCursor, {
          cursor: "Start again from the top.",
        });
      }
      from = Number(m[1]);
    }
    const all = myPlans(scenario, when);
    const items = all.slice(from, from + limit);
    const next = from + limit;
    return json(
      next < all.length
        ? { items, complete: false, nextCursor: `p${next}` }
        : { items, complete: true },
    );
  }),
];
