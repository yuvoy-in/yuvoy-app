import { planActionFromAnswer } from "./action-result";
import {
  callGuestRoute,
  type GuestAnswer,
  type GuestBodies,
  type GuestRoute,
} from "./guest-calls";
import { guestWords } from "./guest-words";
import { newReplyNonce } from "./guest-token";
import type {
  PlanActionResult,
  PlanActions,
  PlanReplyBody,
  PlanReportBody,
  PlanView,
} from "./types";
import { planWords } from "./words";

/**
 * Everything a guest can do on a plan by link, as the `PlanActions` the
 * shared plan view takes, plus the two things only the guest page offers
 * (yuvoy-mobile#373).
 *
 * Every call goes to this app's own route handlers (`/p/api/<route>`), with
 * the token in the JSON body and the plan's `seriesId` once the page knows
 * it, which is how the handler picks the guest key cookie (see
 * `guest-calls.ts`). The key itself never comes this way: the handler keeps
 * it, so nothing here can hold it.
 *
 * ## A first reply
 *
 * A reply from somebody with no reply yet (`me` absent) is a first reply,
 * and adds two things to the body the view built:
 *
 *   - **The first name** from the guest's own box, which the view does not
 *     draw. Asked for here, before any request, when there is no session
 *     and the box is empty: the API would refuse it with `details.name` and
 *     the same sentence. `onNameRefused` puts the line under the box; the
 *     view is told the field was `name`, so it draws no second copy.
 *   - **The nonce**, made when these actions are and kept for every send of
 *     the form, so a double tap or a send after a dropped answer is the same
 *     guest, not a second one (case 4). A new one is made only when the API
 *     says "send again" (`409 conflict`, reason `nonce`, case 5), and it goes
 *     with the next send, not this one.
 *
 * ## The answer
 *
 * The same `planActionFromAnswer` the signed-in page uses, so the view
 * reads one shape. Nothing answering at all (no connection, a stall) is
 * `network`, never a guess that it went: the form then says "check your
 * connection" and keeps every answer filled in.
 */

/** One guest route, as `callGuestRoute` sends it; swappable in tests. */
export type SendGuest = <R extends GuestRoute>(
  route: R,
  body: GuestBodies[R],
) => Promise<GuestAnswer>;

export interface GuestActionsInput {
  /** The link token, already checked with `isGuestToken`. */
  token: string;
  /** The plan as last answered, or null on the not-working page. */
  current: () => PlanView | null;
  /** What is in the first-name box now. */
  firstName: () => string;
  /** Whether this browser has a traveller's session. */
  signedIn: () => boolean;
  /** Each answer that was the plan, so the page draws it. */
  onPlan: (plan: PlanView) => void;
  /** The line under the first-name box, or null to clear it. */
  onNameRefused: (line: string | null) => void;
}

export interface GuestActions extends PlanActions {
  report(body: PlanReportBody): Promise<PlanActionResult>;
  /** "Link my reply to my account": this browser's reply joins the session's account. */
  link(): Promise<PlanActionResult>;
  /**
   * A paid-only reply for an earlier week of a weekly plan: `paid` is that
   * week's complete set, and nothing of this week's goes with it (the API
   * finds the week from the cost ids, and costs from two weeks are a 404).
   */
  payEarlier(paid: string[]): Promise<PlanActionResult>;
}

export function guestActions(
  input: GuestActionsInput,
  send: SendGuest = (route, body) => callGuestRoute(route, body),
  makeNonce: () => string = newReplyNonce,
): GuestActions {
  let nonce = makeNonce();

  /** The token, and the series once the page has read the plan. */
  const address = () => {
    const seriesId = input.current()?.seriesId;
    return seriesId ? { token: input.token, seriesId } : { token: input.token };
  };

  async function answer<R extends GuestRoute>(
    route: R,
    body: GuestBodies[R],
  ): Promise<PlanActionResult> {
    let result: PlanActionResult;
    try {
      const { status, body: answered } = await send(route, body);
      result = planActionFromAnswer(status, answered);
    } catch {
      return { kind: "refused", code: "network", message: planWords.notSent };
    }
    if (result.kind === "ok") input.onPlan(result.plan);
    return result;
  }

  return {
    async reply(body: PlanReplyBody) {
      const first = !input.current()?.me;
      const name = input.firstName().trim();
      if (first && name === "" && !input.signedIn()) {
        input.onNameRefused(guestWords.nameNeeded);
        return {
          kind: "refused",
          code: "invalid_input",
          reason: "name",
          message: guestWords.nameNeeded,
        };
      }
      input.onNameRefused(null);

      const reply: PlanReplyBody = first && name ? { ...body, name } : body;
      const result = await answer("reply", {
        ...address(),
        ...(first ? { nonce } : {}),
        reply,
      });
      if (result.kind === "refused") {
        if (result.code === "conflict" && result.reason === "nonce") {
          nonce = makeNonce();
        }
        if (result.code === "invalid_input" && result.reason === "name") {
          input.onNameRefused(result.message);
        }
      }
      return result;
    },

    leave() {
      return answer("leave", address());
    },

    report(body: PlanReportBody) {
      return answer("report", { ...address(), report: body });
    },

    link() {
      return answer("link", address());
    },

    payEarlier(paid: string[]) {
      return answer("reply", { ...address(), reply: { paid } });
    },
  };
}
