import { http, HttpResponse } from "msw";
import type { components } from "../src/lib/api/schema.gen";
import { mockHeaders, mockNow } from "./fixtures";
import {
  PLAN_IDS,
  decidedPlanView,
  guestMe,
  openPlanView,
  upiPayLink,
  withReply,
} from "./plan-fixtures";

type PlanView = components["schemas"]["PlanView"];
type PlanMe = components["schemas"]["PlanMe"];
type PlanEarlierShare = components["schemas"]["PlanEarlierShare"];

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

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8099/v1";
const url = (p: string) => `${BASE}${p}`;

/** A signed-in session that is the plan's planner, here and only here. */
export const PLAN_PLANNER_SESSION = "sess_919000000001";

const LINK_TOKEN = /^yp_[A-Za-z0-9_-]{43}$/;
const GUEST_KEY = /^ypk_[A-Za-z0-9_-]{43}$/;
const NONCE = /^[A-Za-z0-9_-]{22,64}$/;

/** The contract's ten minutes for repeating a first-reply nonce. */
const NONCE_WINDOW_MS = 10 * 60 * 1000;

const REPORT_REASONS = new Set([
  "unsafe",
  "harassment",
  "spam",
  "impersonation",
  "other",
]);

type PlanLinkScenario =
  | "plan-guest-first"
  | "plan-guest-returning"
  | "plan-guest-decided"
  | "plan-guest-started"
  | "plan-guest-full"
  | "plan-guest-closed"
  | "plan-guest-404"
  | "plans-off"
  | "plans-paused"
  | "rate-limited";

function scenarioOf(request: Request): PlanLinkScenario | string {
  const fromHeader = request.headers.get("x-yuvoy-scenario");
  if (fromHeader) return fromHeader;
  return new URL(request.url).searchParams.get("__scenario") ?? "plan-guest-first";
}

let seq = 0;
const rid = () =>
  `01JPLN${(++seq).toString(36).toUpperCase().padStart(5, "0")}`;

function envelope(
  code: string,
  message: string,
  status: number,
  details?: Record<string, unknown>,
) {
  return HttpResponse.json(
    {
      error: { code, message, ...(details ? { details } : {}), requestId: rid() },
    },
    { status, headers: mockHeaders(rid()) },
  );
}

const NOT_FOUND = () =>
  envelope("not_found", "This plan link is not working.", 404);

/**
 * Last week's plan in the started scenario: its two costs, so a paid-only
 * reply can tell its ids from this week's, and the shares a member has
 * there. Each share's `payLink` is the API's, built from that week's payee,
 * which the contract does not send beside it.
 */
export const EARLIER_COST_IDS = [
  "4a4b4c4d-0004-4a00-8a00-0000000000e1",
  "4a4b4c4d-0004-4a00-8a00-0000000000e2",
] as const;

function earlierShares(paid: ReadonlySet<string>): PlanEarlierShare[] {
  const week = "2026-08-15T13:30:00.000Z";
  const share = (costId: string, label: string, amountMinor: number) => ({
    costId,
    label,
    startsAt: week,
    amountMinor,
    paidBy: "Asha",
    paidMarked: paid.has(costId),
    payLink: upiPayLink(amountMinor, `Dinner at the beach shack: ${label}`),
  });
  return [
    share(EARLIER_COST_IDS[0], "Fish for the grill", 40000),
    share(EARLIER_COST_IDS[1], "Boat to the beach", 15000),
  ];
}

/** Guests this mock has made, by key: what they answered. */
const guestsByKey = new Map<string, PlanMe>();
/** Last week's paid marks, by key: a complete set for that week. */
const earlierPaidByKey = new Map<string, Set<string>>();
/** Replies that belong to an account, by session token. */
const membersBySession = new Map<string, PlanMe>();
/** First-reply nonces: the name sent with each, the key it made, and when. */
const nonces = new Map<string, { name: string; key: string; at: number }>();
/** Keys handed out so far, so each is new. */
let minted = 0;

/** Test-only: every reply and nonce is forgotten between cases. */
export function __resetPlanLinkMocks(): void {
  guestsByKey.clear();
  earlierPaidByKey.clear();
  membersBySession.clear();
  nonces.clear();
  minted = 0;
}

/** A key of the contract's shape, different each time. */
function mintKey(): string {
  return `ypk_${`mockguest${++minted}`.padEnd(43, "Q")}`;
}

/** A first name as the API takes one: 1 to 30 characters, no digits or spaces. */
function isFirstName(name: string): boolean {
  return name.length >= 1 && name.length <= 30 && !/[\d\s@]/.test(name);
}

function sessionOf(request: Request): string | null {
  const header = request.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  return token.startsWith("sess_") ? token : null;
}

/**
 * The gate every by-link route passes first, in the API's order: the
 * release, the kill switch, then the shapes of the token and any key. A
 * response to send, or null to go on.
 */
function gate(
  request: Request,
  token: string,
  scenario: string,
  route: "read" | "write" | "report",
) {
  if (scenario === "plans-off") return NOT_FOUND();
  if (scenario === "plans-paused") {
    return envelope(
      "plans_unavailable",
      "Plans are paused for a moment. Try again later.",
      503,
    );
  }
  if (scenario === "rate-limited") {
    return envelope(
      "rate_limited",
      "Lots of replies at once. Wait a minute and send again.",
      429,
    );
  }
  if (!LINK_TOKEN.test(token)) return NOT_FOUND();
  const key = request.headers.get("x-yuvoy-plan-key");
  if (key !== null && !GUEST_KEY.test(key)) return NOT_FOUND();
  /*
    A dead link, or a removed guest's key: 404 everywhere. Except that the
    report route takes a removed guest's key while the link is live, which
    is what lets the 404 page still offer "Report this plan". With a key, the
    mock reads this as that removed guest; with none, as a dead link.
  */
  if (scenario === "plan-guest-404") {
    if (route === "report" && key !== null) return null;
    return NOT_FOUND();
  }
  return null;
}

type Reader =
  | { role: "visitor" }
  | { role: "planner" }
  | { role: "member"; me: PlanMe; key: string | null; session: string | null };

/** Who is reading: the key first, else the session, else a visitor. */
function readerOf(request: Request, scenario: string): Reader {
  const session = sessionOf(request);
  if (session === PLAN_PLANNER_SESSION) return { role: "planner" };
  const key = request.headers.get("x-yuvoy-plan-key");
  if (key) {
    const me = guestsByKey.get(key);
    if (me) return { role: "member", me, key, session: null };
    if (
      scenario === "plan-guest-returning" ||
      scenario === "plan-guest-decided" ||
      scenario === "plan-guest-started"
    ) {
      const earlier = guestMe("Ravi");
      guestsByKey.set(key, earlier);
      return { role: "member", me: earlier, key, session: null };
    }
  }
  if (session) {
    const me = membersBySession.get(session);
    if (me) return { role: "member", me, key: null, session };
  }
  return { role: "visitor" };
}

function isDecided(scenario: string): boolean {
  return scenario === "plan-guest-decided" || scenario === "plan-guest-started";
}

/**
 * The plan as this reader sees it, in this scenario.
 *
 * A member's view is the fixture's, with what they last sent laid over it
 * by `withReply`, so their answers, the items they hold and their paid marks
 * are what this browser sent, not the fixture's own Ravi. That is what lets
 * a spec change a claim and see it freed on the next read.
 */
function viewFor(scenario: string, reader: Reader): PlanView {
  const me = reader.role === "member" ? reader.me : null;
  const base = isDecided(scenario)
    ? decidedPlanView(reader.role, me)
    : openPlanView(reader.role, me);
  const view = me
    ? withReply(base, { answers: me.answers, claims: me.claims, paid: me.paid })
    : base;
  if (scenario === "plan-guest-closed") {
    return { ...view, state: "cancelled", canReply: false };
  }
  if (scenario === "plan-guest-started") {
    const key = reader.role === "member" ? reader.key : null;
    return {
      ...view,
      canReply: false,
      ...(key ? { earlierShares: earlierShares(earlierPaidByKey.get(key) ?? new Set()) } : {}),
    };
  }
  return view;
}

function ok(view: PlanView, status = 200) {
  return HttpResponse.json(view, { status, headers: mockHeaders(rid()) });
}

async function jsonBody(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const body: unknown = await request.json();
    return typeof body === "object" && body !== null && !Array.isArray(body)
      ? (body as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

const strings = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];

/**
 * A reply applied to what this person had: complete sets, so anything left
 * out is cleared. An item somebody else already brings is not claimed and is
 * named in `notClaimed`, which is not an error.
 */
function applyReply(
  me: PlanMe,
  body: Record<string, unknown>,
  scenario: string,
): { me: PlanMe; notClaimed: string[] } {
  const taken = new Set<string>([PLAN_IDS.items[0]]);
  const answers = Array.isArray(body.answers)
    ? (body.answers as PlanMe["answers"])
    : [];
  const cantGo =
    isDecided(scenario) &&
    answers.some((a) => a.optionId === PLAN_IDS.times[0] && a.answer === "cant");
  const claims = cantGo ? [] : strings(body.claims);
  // A paid-only reply moves the paid marks and nothing else.
  if (paidOnly(body)) {
    return { me: { ...me, paid: strings(body.paid) }, notClaimed: [] };
  }
  return {
    me: {
      ...me,
      answers,
      claims: claims.filter((id) => !taken.has(id)),
      paid: strings(body.paid),
    },
    notClaimed: claims.filter((id) => taken.has(id)),
  };
}

/**
 * Only `paid`: what a closed plan still takes. Read as the API reads it,
 * by which fields were sent at all: a reply that sends empty answers and
 * claims is a reply that clears them, not a paid-only one.
 */
function paidOnly(body: Record<string, unknown>): boolean {
  return !("answers" in body) && !("claims" in body) && !("name" in body) && !("adult" in body);
}

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
    const earlier = new Set<string>(EARLIER_COST_IDS);
    if (paidOnly(body) && paid.length > 0 && paid.some((id) => earlier.has(id))) {
      if (!paid.every((id) => earlier.has(id))) return NOT_FOUND();
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
      const first = applyReply(guestMe(name || "Ravi", { linked: true }), body, scenario);
      membersBySession.set(session, first.me);
      return ok(
        viewFor(scenario, { role: "member", me: first.me, key: null, session }),
      );
    }
    if (!isFirstName(name)) {
      // The API's own sentence, for the message and the field alike
      // (`guestNameSentence`, `plans_guest.go`).
      return envelope("invalid_input", "Use your first name, in letters only.", 400, {
        name: "Use your first name, in letters only.",
      });
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
          ...viewFor(scenario, { role: "member", me, key: earlier.key, session: null }),
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

  http.post(url("/plans/by-token/:token/link-account"), ({ request, params }) => {
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
  }),

  http.post(url("/plans/by-token/:token/reports"), async ({ request, params }) => {
    const scenario = scenarioOf(request);
    const refused = gate(request, String(params.token), scenario, "report");
    if (refused) return refused;
    const body = await jsonBody(request);
    if (!body || typeof body.reason !== "string" || !REPORT_REASONS.has(body.reason)) {
      return envelope("invalid_input", "Pick what is wrong.", 400, {
        reason: "Pick what is wrong.",
      });
    }
    if (typeof body.note === "string" && body.note.length > 300) {
      return envelope("invalid_input", "Keep the note to 300 characters.", 400, {
        note: "Keep the note to 300 characters.",
      });
    }
    if (typeof body.personName === "string") {
      const wanted = body.personName.trim().toLowerCase();
      const names = viewFor(scenario, { role: "visitor" }).people.map((p) =>
        p.name.toLowerCase(),
      );
      if (!names.includes(wanted)) {
        return envelope("invalid_input", "That name is not on this plan.", 400, {
          personName: "That name is not on this plan.",
        });
      }
    }
    return new HttpResponse(null, { status: 202, headers: mockHeaders(rid()) });
  }),
];
