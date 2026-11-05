import { http, HttpResponse } from "msw";
import { mockHeaders, mockNow } from "./fixtures";
import { guestMe } from "./plan-fixtures";
import {
  url,
  NONCE,
  NONCE_WINDOW_MS,
  REPORT_REASONS,
  scenarioOf,
  rid,
  envelope,
  NOT_FOUND,
  EARLIER_COST_IDS,
  guestsByKey,
  earlierPaidByKey,
  membersBySession,
  nonces,
  mintKey,
  isFirstName,
  sessionOf,
  gate,
  readerOf,
  viewFor,
  ok,
  jsonBody,
  strings,
  applyReply,
  paidOnly,
} from "./plan-link-support";
export {
  PLAN_PLANNER_SESSION,
  EARLIER_COST_IDS,
  __resetPlanLinkMocks,
} from "./plan-link-support";

/**
 * A plan by its link (yuvoy-mobile#373): `getPlanByLink`, `replyByLink`,
 * `leaveByLink`, `linkPlanReplyToAccount` and `reportPlanByLink`, in memory.
 *
 * Written against the contract at ad4fa894 and the API's own handler
 * (`internal/handler/plans_guest.go`), because the guest page depends on the
 * details: the token and key are checked for shape before anything else, a
 * first reply with no key and no session needs a name, the 18+ tick and a
 * nonce and answers `201` with `guestKey`, the same nonce and name within ten
 * minutes gives the same key back, and a visitor never sees `payee`, `me` or
 * a share of their own.
 *
 * These are only ever reached through the route handlers under `/p/api/`,
 * since the page never calls the API itself. So a key this mock hands out
 * goes into the handler's cookie and comes back as `X-Yuvoy-Plan-Key`,
 * exactly as with the real API.
 *
 * ## Scenarios (`?__scenario=` on the page)
 *
 *   - `plan-guest-first` (and no scenario): an open plan, read as a visitor
 *     until this browser replies.
 *   - `plan-guest-returning`: any well-formed key reads as Ravi, who answered
 *     earlier from this phone. An e2e spec sets the `ypk_<series>` cookie
 *     itself and lands on "Update my reply".
 *   - `plan-guest-decided`: the time is picked, shares are frozen, and a
 *     member's own share carries a pay link. Any key reads as Ravi here too.
 *     A Can't for the picked time keeps no claims, as the API's reply does
 *     (`plans_members.go`: "whose answer to the picked time is cant keeps
 *     none").
 *   - `plan-guest-started`: the same plan once it has started: `canReply`
 *     false, so answers and claims are `409 plan_closed` (`started`) and a
 *     paid-only reply is still taken. A member found by key also has two
 *     unsettled shares on last week's plan (`earlierShares`), which a
 *     paid-only reply naming only their cost ids marks paid there.
 *   - `plan-guest-full`: a first reply is `409 plan_full`.
 *   - `plan-guest-closed`: the planner cancelled. The plan still reads, with
 *     `canReply` false; answers and claims are `409 plan_closed`
 *     (`cancelled`), and a paid-only reply is still taken.
 *   - `plan-guest-404`: an unknown, renewed or expired link, or a removed
 *     guest's key: `404` on every route but the report, which takes a
 *     report on a live link from anybody.
 *   - `plans-off`: the release is off, so every route answers `404`.
 *   - `plans-paused`: the kill switch, `503 plans_unavailable` everywhere.
 *   - `rate-limited`: `429` everywhere, as for every other endpoint.
 *
 * The planner is whoever signs in as `PLAN_PLANNER_SESSION`, so the
 * "Cancel the plan instead." refusal on leave can be reached.
 */

export const planLinkHandlers = [
  http.get(url("/plans/by-token/:token"), ({ request, params }) => {
    const scenario = scenarioOf(request);
    const refused = gate(request, String(params.token), scenario, "read");
    if (refused) return refused;
    return ok(viewFor(scenario, readerOf(request, scenario)));
  }),

  http.put(url("/plans/by-token/:token/reply"), async ({ request, params }) => {
    const scenario = scenarioOf(request);
    const refused = gate(request, String(params.token), scenario, "write");
    if (refused) return refused;
    const body = await jsonBody(request);
    if (!body) return envelope("invalid_input", "Send the reply.", 400);

    if (scenario === "plan-guest-closed" && !paidOnly(body)) {
      return envelope("plan_closed", "The planner cancelled this plan.", 409, {
        reason: "cancelled",
      });
    }
    if (scenario === "plan-guest-started" && !paidOnly(body)) {
      return envelope(
        "plan_closed",
        "Replies are closed because the plan has started.",
        409,
        { reason: "started" },
      );
    }

    const reader = readerOf(request, scenario);
    if (reader.role === "planner") return ok(viewFor(scenario, reader));

    /*
      A paid-only reply naming only last week's costs is for last week's
      plan (the API's `paidElsewhere`): a complete set there, and this
      week's marks stay as they were. Costs from both weeks at once are a
      404, as the API answers them.
    */
    const paid = strings(body.paid);
    const earlierIds = new Set<string>(EARLIER_COST_IDS);
    if (
      paidOnly(body) &&
      paid.length > 0 &&
      paid.some((id) => earlierIds.has(id))
    ) {
      if (!paid.every((id) => earlierIds.has(id))) return NOT_FOUND();
      if (reader.role !== "member" || !reader.key) return NOT_FOUND();
      earlierPaidByKey.set(reader.key, new Set(paid));
      return ok(viewFor(scenario, reader));
    }

    if (reader.role === "member") {
      const { me, notClaimed } = applyReply(reader.me, body, scenario);
      if (reader.key) guestsByKey.set(reader.key, me);
      if (reader.session) membersBySession.set(reader.session, me);
      const view = viewFor(scenario, { ...reader, me });
      return ok(notClaimed.length ? { ...view, notClaimed } : view);
    }

    // A first reply.
    if (scenario === "plan-guest-full") {
      return envelope(
        "plan_full",
        "This plan has as many people as Yuvoy allows.",
        409,
      );
    }
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const session = sessionOf(request);
    if (session) {
      // Belongs to the account: no key, 200.
      const first = applyReply(
        guestMe(name || "Ravi", { linked: true }),
        body,
        scenario,
      );
      membersBySession.set(session, first.me);
      return ok(
        viewFor(scenario, { role: "member", me: first.me, key: null, session }),
      );
    }
    if (!isFirstName(name)) {
      // The API's own sentence, for the message and the field alike
      // (`guestNameSentence`, `plans_guest.go`).
      return envelope(
        "invalid_input",
        "Use your first name, in letters only.",
        400,
        {
          name: "Use your first name, in letters only.",
        },
      );
    }
    if (body.adult !== true) {
      return envelope("invalid_input", "Tick that you are 18 or older.", 400, {
        adult: "Tick that you are 18 or older.",
      });
    }
    const nonce = request.headers.get("idempotency-key") ?? "";
    if (!NONCE.test(nonce)) {
      return envelope("invalid_input", "Send again.", 400, {
        idempotencyKey: "Send again.",
      });
    }

    const earlier = nonces.get(nonce);
    if (earlier) {
      if (earlier.name !== name || mockNow() - earlier.at > NONCE_WINDOW_MS) {
        return envelope("conflict", "Send again.", 409, { reason: "nonce" });
      }
      const me = guestsByKey.get(earlier.key) ?? guestMe(name);
      return ok(
        {
          ...viewFor(scenario, {
            role: "member",
            me,
            key: earlier.key,
            session: null,
          }),
          guestKey: earlier.key,
        },
        201,
      );
    }

    const key = mintKey();
    const { me, notClaimed } = applyReply(guestMe(name), body, scenario);
    guestsByKey.set(key, me);
    nonces.set(nonce, { name, key, at: mockNow() });
    const view = viewFor(scenario, { role: "member", me, key, session: null });
    return ok(
      { ...view, ...(notClaimed.length ? { notClaimed } : {}), guestKey: key },
      201,
    );
  }),

  http.delete(url("/plans/by-token/:token/reply"), ({ request, params }) => {
    const scenario = scenarioOf(request);
    const refused = gate(request, String(params.token), scenario, "write");
    if (refused) return refused;
    const reader = readerOf(request, scenario);
    if (reader.role === "planner") {
      return envelope("conflict", "Cancel the plan instead.", 409, {
        reason: "planner_leaves",
      });
    }
    if (reader.role === "visitor") return NOT_FOUND();
    if (reader.key) guestsByKey.delete(reader.key);
    if (reader.session) membersBySession.delete(reader.session);
    return new HttpResponse(null, { status: 204, headers: mockHeaders(rid()) });
  }),

  http.post(
    url("/plans/by-token/:token/link-account"),
    ({ request, params }) => {
      const scenario = scenarioOf(request);
      const refused = gate(request, String(params.token), scenario, "write");
      if (refused) return refused;
      const session = sessionOf(request);
      if (!session) {
        return envelope(
          "unauthorized",
          "Sign in to link your reply to your account.",
          401,
        );
      }
      const reader = readerOf(request, scenario);
      if (reader.role !== "member" || !reader.key) return NOT_FOUND();
      if (membersBySession.has(session)) {
        return envelope(
          "conflict",
          "This account already answered this plan.",
          409,
          { reason: "already_answered" },
        );
      }
      const me = { ...reader.me, linked: true };
      guestsByKey.set(reader.key, me);
      membersBySession.set(session, me);
      return ok(viewFor(scenario, { ...reader, me }));
    },
  ),

  http.post(
    url("/plans/by-token/:token/reports"),
    async ({ request, params }) => {
      const scenario = scenarioOf(request);
      const refused = gate(request, String(params.token), scenario, "report");
      if (refused) return refused;
      const body = await jsonBody(request);
      if (
        !body ||
        typeof body.reason !== "string" ||
        !REPORT_REASONS.has(body.reason)
      ) {
        return envelope("invalid_input", "Pick what is wrong.", 400, {
          reason: "Pick what is wrong.",
        });
      }
      if (typeof body.note === "string" && body.note.length > 300) {
        return envelope(
          "invalid_input",
          "Keep the note to 300 characters.",
          400,
          {
            note: "Keep the note to 300 characters.",
          },
        );
      }
      if (typeof body.personName === "string") {
        const wanted = body.personName.trim().toLowerCase();
        const names = viewFor(scenario, { role: "visitor" }).people.map((p) =>
          p.name.toLowerCase(),
        );
        if (!names.includes(wanted)) {
          return envelope(
            "invalid_input",
            "That name is not on this plan.",
            400,
            {
              personName: "That name is not on this plan.",
            },
          );
        }
      }
      return new HttpResponse(null, {
        status: 202,
        headers: mockHeaders(rid()),
      });
    },
  ),
];
