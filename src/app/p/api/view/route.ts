import {
  guestRoute,
  heldFor,
  keepKey,
  keyWasKnown,
  planAnswer,
  planIdentity,
  sendToPlan,
  type GuestCall,
  type HeldKey,
} from "@/lib/plans/guest-route";
import type { UpstreamResult } from "@/lib/auth/upstream";

/**
 * The plan, as the friend holding the link sees it: `getPlanByLink`
 * (yuvoy-mobile#373). Body `{ token, seriesId? }`; answers the `PlanView`
 * without `guestKey`, or the API's error envelope with its status. The
 * refusals and the secrets rules are in `lib/plans/guest-route.ts`.
 *
 * ## Which guest key to send
 *
 * The key cookie is named after the plan's series, and a page loading fresh
 * knows only the token, which says nothing about the series. So:
 *
 *   1. **The page named the series** (it has read this plan before, in this
 *      page's life): that series' key, or none. One call.
 *   2. **This browser holds one key or none:** send it, or none. A key from
 *      another plan finds nobody on this one, so the API reads a visitor,
 *      which is the right answer. One call.
 *   3. **It holds several:** read without one, learn the series from the
 *      answer, and read again with that series' key if there is one and the
 *      first read was a visitor's. Two calls, only for somebody on several
 *      plans.
 *   4. **Several, and the keyless read is a 404:** after the link expires a
 *      visitor gets 404 while a member found by key still reads the plan
 *      (`canReply` false, so they can still mark a share paid). So each key
 *      is tried in turn, at most `MOST_KEYS_TRIED`, until one is not a 404.
 *
 * A key the API recognised has its cookie refreshed, so it lives 90 days
 * from the last visit rather than from the first reply.
 */

export const dynamic = "force-dynamic";

/**
 * A ceiling on the reads one page load can cost, under the API's per-address
 * read limit (60 a minute, burst 30) with plenty to spare. Past it the visitor
 * gets the 404 a visitor gets.
 */
const MOST_KEYS_TRIED = 4;

function read(call: GuestCall, key: HeldKey | null): Promise<UpstreamResult> {
  return sendToPlan(call, { method: "GET", key });
}

async function view(call: GuestCall) {
  let sent: HeldKey | null = null;
  let result: UpstreamResult;

  if (call.seriesId !== null || call.held.length <= 1) {
    sent =
      call.seriesId !== null
        ? heldFor(call, call.seriesId)
        : (call.held[0] ?? null);
    result = await read(call, sent);
  } else {
    result = await read(call, null);
    const plan = planIdentity(result);
    if (plan) {
      const mine = heldFor(call, plan.seriesId);
      if (mine && plan.role === "visitor") {
        sent = mine;
        result = await read(call, mine);
      }
    } else if (result.status === 404) {
      for (const candidate of call.held.slice(0, MOST_KEYS_TRIED)) {
        const tried = await read(call, candidate);
        if (tried.status === 404) continue;
        sent = candidate;
        result = tried;
        break;
      }
    }
  }

  const response = planAnswer(call, result);
  if (keyWasKnown(result, sent)) keepKey(response, call.request, sent);
  return response;
}

export const POST = guestRoute("view", view);
