import { http } from "msw";
import {
  UUID,
  json,
  mayWrite,
  peopleGate,
  refusal,
  scenarioOf,
  sessionOf,
  url,
} from "./follow-state";
import { PLANS_SAY, myPlanToInvite, plansGate } from "./my-plans-handlers";

/**
 * Inviting a crew to a plan, `POST /plans/{planId}/crew-invites`
 * (yuvoy-mobile#392), refused in the order yuvoy-api's InviteToPlan and the
 * store's AddLinkedGuests use:
 *
 *   1. no session 401; People closed to the caller 404 "People isn't open
 *      to your account yet." (`crew-invite-people-closed`);
 *   2. plans closed 404 "We could not find that plan." (`crew-invite-plans-off`),
 *      plans paused 503 `plans_unavailable` (`crew-invite-paused`);
 *   3. a planId that is not a uuid: 404;
 *   4. a body that is not exactly `{ crewId }`: 400 `invalid_input`;
 *   5. the adult answer, the standing, the first name (as a follow);
 *   6. a crewId that is not a uuid: 404 "We couldn't find that crew.";
 *   7. not a plan the caller made (or `crew-invite-gone`): 404; a plan that
 *      started, was cancelled, is done or was closed: 409 `plan_closed`.
 *
 * Note the API checks the crew before the plan, so a bad crew on a closed
 * plan is 404, not 409.
 *
 * Success under the scenario: `crew-invite-3` {3, 0}, `crew-invite-1-3`
 * {1, 3}, `crew-invite-0-4` {0, 4}, any other {2, 0}. Inviting the same crew
 * to the same plan again in a session skips everyone. `crew-invite-closed`
 * answers 409 `started`. Any uuid crewId counts as the caller's crew until
 * the crews mock (yuvoy-app#227) lands.
 */

const SAYS = {
  signIn: "Sign in to see your crews.",
  sendCrew: "Send crewId, the id of one of your crews.",
  noCrew: "We couldn't find that crew.",
} as const;

const CLOSED_WORDS = {
  started: "This plan has started, so its times and answers are fixed.",
  cancelled: "This plan was cancelled.",
  done: "This plan is done.",
  closed: "Yuvoy closed this plan.",
} as const;

export const INVITE_SCENARIOS: ReadonlySet<string> = new Set([
  "crew-invite-3",
  "crew-invite-1-3",
  "crew-invite-0-4",
  "crew-invite-none",
  "crew-invite-closed",
  "crew-invite-gone",
  "crew-invite-people-closed",
  "crew-invite-paused",
  "crew-invite-plans-off",
]);

/** How many each invite adds and skips under the scenario. */
function outcome(scenario: string): { invited: number; skipped: number } {
  if (scenario === "crew-invite-3") return { invited: 3, skipped: 0 };
  if (scenario === "crew-invite-1-3") return { invited: 1, skipped: 3 };
  if (scenario === "crew-invite-0-4") return { invited: 0, skipped: 4 };
  return { invited: 2, skipped: 0 };
}

/** Crew and plan pairs already invited, per scenario and session. */
const invited = new Set<string>();

/** For tests: forget every invite. */
export function __resetInviteMocks(): void {
  invited.clear();
}

/** The crewId in the body, or the 400 the API gives for a bad body. */
async function crewIdOf(request: Request): Promise<string | Response> {
  const bad = (why: string) =>
    refusal(400, "invalid_input", SAYS.sendCrew, { crewId: why });
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return bad("required");
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return bad("required");
  }
  const keys = Object.keys(body);
  if (keys.length === 0) return bad("required");
  if (keys.some((k) => k !== "crewId")) {
    return bad("send crewId and nothing else");
  }
  const crewId = (body as { crewId: unknown }).crewId;
  if (typeof crewId !== "string" || crewId === "") return bad("a crew id");
  return crewId;
}

export const crewInviteHandlers = [
  http.post(url("/plans/:planId/crew-invites"), async ({ request, params }) => {
    const scenario = scenarioOf(request);
    const no =
      peopleGate(request, scenario, SAYS.signIn) ?? plansGate(scenario);
    if (no) return no;
    const planId = String(params.planId).toLowerCase();
    if (!UUID.test(planId)) {
      return refusal(404, "not_found", PLANS_SAY.notFound);
    }
    const crewId = await crewIdOf(request);
    if (crewId instanceof Response) return crewId;
    const cannot = mayWrite(scenario);
    if (cannot) return cannot;
    if (!UUID.test(crewId)) return refusal(404, "not_found", SAYS.noCrew);

    const plan = myPlanToInvite(scenario, planId);
    if (!plan || scenario === "crew-invite-gone") {
      return refusal(404, "not_found", PLANS_SAY.notFound);
    }
    const reason =
      scenario === "crew-invite-closed"
        ? "started"
        : plan.state === "open" || plan.state === "decided"
          ? null
          : plan.state;
    if (reason) {
      return refusal(409, "plan_closed", CLOSED_WORDS[reason], { reason });
    }

    const result = outcome(scenario);
    const key = `${scenario}|${sessionOf(request)}|${planId}|${crewId.toLowerCase()}`;
    if (invited.has(key)) {
      return json({ invited: 0, skipped: result.invited + result.skipped });
    }
    invited.add(key);
    return json(result);
  }),
];
