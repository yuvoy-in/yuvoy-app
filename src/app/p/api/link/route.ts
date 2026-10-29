import {
  guestRoute,
  keepKey,
  keyFor,
  keyWasKnown,
  linkNotWorking,
  planAnswer,
  refusal,
  sendToPlan,
  type GuestCall,
} from "@/lib/plans/guest-route";

/**
 * "Link my reply to my account": `linkPlanReplyToAccount`
 * (yuvoy-mobile#373). Body `{ token, seriesId? }`. The reply this browser's
 * key made gains the signed-in traveller, so reminders can reach them.
 * Answers the `PlanView`, or `409 conflict` with `details.reason`
 * `already_answered` when that account already answered this plan.
 *
 * Both halves are required, and each is refused here without a call when it
 * is missing, as the signed-in proxy refuses a call with no cookie: no
 * session is the API's own `401` (and the page offers sign-in), and no key is
 * the API's own `404`, because with no key there is no reply here to link.
 *
 * The key stays after linking. The reply keeps it, and it is still what
 * finds the reply on this phone when the session has ended.
 */

export const dynamic = "force-dynamic";

async function link(call: GuestCall) {
  if (!call.session) {
    return refusal(
      401,
      "unauthorized",
      "Sign in to link your reply to your account.",
    );
  }
  const key = keyFor(call);
  if (!key) return linkNotWorking();

  const result = await sendToPlan(call, {
    method: "POST",
    rest: "/link-account",
    key,
  });
  const response = planAnswer(call, result);
  if (keyWasKnown(result, key)) keepKey(response, call.request, key);
  return response;
}

export const POST = guestRoute("link", link);
