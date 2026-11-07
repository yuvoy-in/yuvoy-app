import { HttpResponse } from "msw";
import type { components } from "../src/lib/api/schema.gen";
import { mockHeaders } from "./fixtures";
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

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8099/v1";
export const url = (p: string) => `${BASE}${p}`;

/** A signed-in session that is the plan's planner, here and only here. */
export const PLAN_PLANNER_SESSION = "sess_919000000001";

const LINK_TOKEN = /^yp_[A-Za-z0-9_-]{43}$/;
const GUEST_KEY = /^ypk_[A-Za-z0-9_-]{43}$/;
export const NONCE = /^[A-Za-z0-9_-]{22,64}$/;

/** The contract's ten minutes for repeating a first-reply nonce. */
export const NONCE_WINDOW_MS = 10 * 60 * 1000;

export const REPORT_REASONS = new Set([
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

export function scenarioOf(request: Request): PlanLinkScenario | string {
  const fromHeader = request.headers.get("x-yuvoy-scenario");
  if (fromHeader) return fromHeader;
  return (
    new URL(request.url).searchParams.get("__scenario") ?? "plan-guest-first"
  );
}

let seq = 0;
export const rid = () =>
  `01JPLN${(++seq).toString(36).toUpperCase().padStart(5, "0")}`;

export function envelope(
  code: string,
  message: string,
  status: number,
  details?: Record<string, unknown>,
) {
  return HttpResponse.json(
    {
      error: {
        code,
        message,
        ...(details ? { details } : {}),
        requestId: rid(),
      },
    },
    { status, headers: mockHeaders(rid()) },
  );
}

export const NOT_FOUND = () =>
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
export const guestsByKey = new Map<string, PlanMe>();
/** Last week's paid marks, by key: a complete set for that week. */
export const earlierPaidByKey = new Map<string, Set<string>>();
/** Replies that belong to an account, by session token. */
export const membersBySession = new Map<string, PlanMe>();
/** First-reply nonces: the name sent with each, the key it made, and when. */
export const nonces = new Map<
  string,
  { name: string; key: string; at: number }
>();
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
export function mintKey(): string {
  return `ypk_${`mockguest${++minted}`.padEnd(43, "Q")}`;
}

/** A first name as the API takes one: 1 to 30 characters, no digits or spaces. */
export function isFirstName(name: string): boolean {
  return name.length >= 1 && name.length <= 30 && !/[\d\s@]/.test(name);
}

export function sessionOf(request: Request): string | null {
  const header = request.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  return token.startsWith("sess_") ? token : null;
}

/**
 * The gate every by-link route passes first, in the API's order: the
 * release, the kill switch, then the shapes of the token and any key. A
 * response to send, or null to go on.
 */
export function gate(
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
export function readerOf(request: Request, scenario: string): Reader {
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
export function viewFor(scenario: string, reader: Reader): PlanView {
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
      ...(key
        ? {
            earlierShares: earlierShares(
              earlierPaidByKey.get(key) ?? new Set(),
            ),
          }
        : {}),
    };
  }
  return view;
}

export function ok(view: PlanView, status = 200) {
  return HttpResponse.json(view, { status, headers: mockHeaders(rid()) });
}

export async function jsonBody(
  request: Request,
): Promise<Record<string, unknown> | null> {
  try {
    const body: unknown = await request.json();
    return typeof body === "object" && body !== null && !Array.isArray(body)
      ? (body as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

export const strings = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.filter((v): v is string => typeof v === "string")
    : [];

/**
 * A reply applied to what this person had: complete sets, so anything left
 * out is cleared. An item somebody else already brings is not claimed and is
 * named in `notClaimed`, which is not an error.
 */
export function applyReply(
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
    answers.some(
      (a) => a.optionId === PLAN_IDS.times[0] && a.answer === "cant",
    );
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
export function paidOnly(body: Record<string, unknown>): boolean {
  return (
    !("answers" in body) &&
    !("claims" in body) &&
    !("name" in body) &&
    !("adult" in body)
  );
}
