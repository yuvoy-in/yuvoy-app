import {
  guestRoute,
  keepKey,
  keyFor,
  keyWasKnown,
  planAnswer,
  planIdentity,
  refusal,
  sendToPlan,
  takeGuestKey,
  type GuestCall,
} from "@/lib/plans/guest-route";
import { isReplyNonce } from "@/lib/plans/guest-token";

/**
 * A first reply, or a change to one: `replyByLink` (yuvoy-mobile#373).
 * Body `{ token, seriesId?, nonce?, reply }`, where `reply` is the contract's
 * `PlanReply` as it is (complete sets; anything left out is cleared) and
 * `nonce` is the form's first-reply nonce.
 *
 * ## The guest key is born here
 *
 * A first reply with no key and no session answers `201` with `guestKey`.
 * That key is taken out of the answer and kept in the httpOnly cookie
 * `ypk_<seriesId>`; the page gets the plan without it, and from the next call
 * on this server sends it for them. A repeat of the same nonce and name
 * within ten minutes gives back the same key, so keeping it again is a
 * no-op, which is what makes a double tap one guest.
 *
 * ## The nonce
 *
 * Sent as `Idempotency-Key` exactly as the page made it, and only from the
 * body: a header the page set is not forwarded. One of the wrong shape is
 * refused here with the API's own `400` and `details.idempotencyKey`, rather
 * than sent: a header value is not a place for whatever a body held.
 */

export const dynamic = "force-dynamic";

function isJson(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function reply(call: GuestCall) {
  const { reply: body, nonce: sentNonce } = call.body;
  if (!isJson(body)) {
    return refusal(400, "invalid_input", "Send the reply.", {
      reply: "Send the reply.",
    });
  }
  let nonce: string | undefined;
  if (sentNonce !== undefined) {
    if (!isReplyNonce(sentNonce)) {
      return refusal(400, "invalid_input", "Send again.", {
        idempotencyKey: "Send again.",
      });
    }
    nonce = sentNonce;
  }

  const key = keyFor(call);
  const sent = await sendToPlan(call, {
    method: "PUT",
    rest: "/reply",
    key,
    body,
    nonce,
  });

  // The key comes out first, before the answer is read for anything else.
  const { result, guestKey } = takeGuestKey(sent);
  const response = planAnswer(call, result);
  const plan = planIdentity(result);
  if (result.status === 201 && plan && guestKey) {
    keepKey(response, call.request, { seriesId: plan.seriesId, key: guestKey });
  } else if (keyWasKnown(result, key)) {
    keepKey(response, call.request, key);
  }
  return response;
}

export const POST = guestRoute("reply", reply);
