import {
  dropKey,
  guestRoute,
  keyFor,
  planAnswer,
  sendToPlan,
  type GuestCall,
} from "@/lib/plans/guest-route";

/**
 * "Remove my reply": `leaveByLink` (yuvoy-mobile#373). Body
 * `{ token, seriesId? }`. The guest's name and answers are deleted and their
 * items freed; `204` and an empty answer. The planner cannot leave, which is
 * `409 conflict` with `details.reason` `planner_leaves` ("Cancel the plan
 * instead."), passed on as the API wrote it.
 *
 * After a `204` the key names a reply that no longer exists, so its cookie
 * goes too, and the next reply from this phone is a first reply with a new
 * key. Only when the page named the series: a key guessed without one might
 * belong to another plan, and a session may have been what the API found.
 */

export const dynamic = "force-dynamic";

async function leave(call: GuestCall) {
  const key = keyFor(call);
  const result = await sendToPlan(call, {
    method: "DELETE",
    rest: "/reply",
    key,
  });
  const response = planAnswer(call, result);
  if (result.status === 204 && key && call.seriesId === key.seriesId) {
    dropKey(response, call.request, key.seriesId);
  }
  return response;
}

export const POST = guestRoute("leave", leave);
