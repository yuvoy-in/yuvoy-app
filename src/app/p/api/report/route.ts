import {
  guestRoute,
  keyFor,
  planAnswer,
  refusal,
  sendToPlan,
  type GuestCall,
} from "@/lib/plans/guest-route";

/**
 * "Report this plan": `reportPlanByLink` (yuvoy-mobile#373, the R7-T4
 * comment). Body `{ token, seriesId?, report }`, where `report` is the
 * contract's `PlanReport` as it is: `reason`, and `personName` and `note`
 * when given. Anybody holding the link may report, a visitor who never
 * replied included, so neither the key nor the session is required; each is
 * sent when there is one, and the API decides who the reporter is from them.
 *
 * Answers `202` with no body ("sent"), or the API's refusal as it wrote it:
 * `400 invalid_input` (with `details.personName` for a name not on the plan,
 * or a note over 300 characters), `404` for a gone link, `429`, `503`.
 *
 * A removed guest's key is accepted here and on no other by-link route, so
 * the 404 page can still offer this. That page never learned the series,
 * which is why `keyFor` falls back to the only key held (see there).
 */

export const dynamic = "force-dynamic";

function isJson(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function report(call: GuestCall) {
  const body = call.body.report;
  if (!isJson(body)) {
    return refusal(400, "invalid_input", "Say what is wrong.", {
      reason: "Say what is wrong.",
    });
  }
  const result = await sendToPlan(call, {
    method: "POST",
    rest: "/reports",
    key: keyFor(call),
    body,
  });
  return planAnswer(call, result);
}

export const POST = guestRoute("report", report);
