import { HttpResponse } from "msw";
import { mockHeaders } from "./fixtures";

/**
 * What the follow, crew invite and my plans mocks share (yuvoy-mobile#392):
 * the scenario, the session, the API's error shape, the groups a follow can
 * name and the follows each session holds.
 *
 * ## Scenarios that open People here
 *
 *   - `club-follows-none`, `-one`, `-full`, `-gone`, `-down`: People at
 *     `all`. Nothing followed, Havelock Reef Runners followed, or 200
 *     followed so the next follow is `409 follow_limit_reached`. `-gone`
 *     answers every follow `404` "We couldn't find that group." (a group
 *     hidden between the read and the tap). `-down` fails the follows read
 *     with a 500; the writes still work.
 *   - `club-follows-closed`: app-config still says People is open (it can
 *     lag by minutes), but all three follow routes answer `404` "People
 *     isn't open to your account yet.".
 *   - every `crew-invite-*` scenario opens People too, so a follows read
 *     works there; `crew-invite-people-closed` answers it `404` instead.
 *   - yuvoy-app#386's `clubs`, `clubs-all`, `clubs-no-age`, `clubs-no-name`,
 *     `clubs-paused`, `clubs-ended` and `clubs-hidden-meanwhile` answer a
 *     follow as the API does (age, name, paused, gone); `clubs-unavailable`
 *     answers 503. #386's mock sets their release stage, not this file.
 */

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8099/v1";
export const url = (p: string) => `${BASE}${p}`;

let seq = 0;
const rid = () =>
  `01JFLW${(++seq).toString(36).toUpperCase().padStart(5, "0")}`;

export function scenarioOf(request: Request): string {
  return (
    request.headers.get("x-yuvoy-scenario") ??
    new URL(request.url).searchParams.get("__scenario") ??
    "ok"
  );
}

/** The session header, or null without a sign-in session. */
export function sessionOf(request: Request): string | null {
  const auth = request.headers.get("authorization") ?? "";
  return /^Bearer sess_/.test(auth) ? auth : null;
}

/** An answer in the API's error shape. */
export function refusal(
  status: number,
  code: string,
  message: string,
  details?: Record<string, unknown>,
): Response {
  const requestId = rid();
  return HttpResponse.json(
    { error: { code, message, requestId, ...(details ? { details } : {}) } },
    { status, headers: mockHeaders(requestId) },
  );
}

export function json(body: unknown): Response {
  return HttpResponse.json(body, {
    headers: { ...mockHeaders(rid()), "cache-control": "private, no-store" },
  });
}

export function noContent(): Response {
  return new HttpResponse(null, { status: 204, headers: mockHeaders(rid()) });
}

/** A uuid as the API checks one (`reelViewUUID`). */
export const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The API's sentences (yuvoy-api handler clubs.go, people.go, people_blocks.go). */
export const PEOPLE_SAYS = {
  signIn: "Sign in to do that.",
  notOpen: "People isn't open to your account yet.",
  down: "People is not available right now. Try again later.",
  gone: "We couldn't find that group.",
  adultsOnly: "People is for adults. Tell us your birth year first.",
  needsName: "Add your first name before you use People.",
  paused: "Your use of People is paused for now.",
  ended: "Your use of People has ended.",
  limit: "You follow 200 groups already. Stop following one to follow another.",
  fault: "internal server error",
} as const;

/** When a paused person's pause ends, fixed so no test reads the clock. */
const PAUSED_UNTIL = "2026-08-26T00:00:00.000Z";

export const FOLLOW_LIMIT = 200;

export const FOLLOW_SCENARIOS: ReadonlySet<string> = new Set([
  "club-follows-none",
  "club-follows-one",
  "club-follows-full",
  "club-follows-gone",
  "club-follows-closed",
  "club-follows-down",
]);

/** #386's scenarios that open People, so a follow answers under them. */
const CLUB_OPEN = new Set([
  "clubs",
  "clubs-all",
  "clubs-no-age",
  "clubs-no-name",
  "clubs-paused",
  "clubs-ended",
  "clubs-hidden-meanwhile",
  "clubs-unavailable",
]);

/** `releases.people` on `GET /app-config` for this issue's scenarios. */
export function followPeopleStageOf(scenario: string): "all" | null {
  return FOLLOW_SCENARIOS.has(scenario) || scenario.startsWith("crew-invite-")
    ? "all"
    : null;
}

/** Whether the API lets this caller into People under the scenario. */
export function peopleOpenTo(scenario: string): boolean {
  if (scenario === "club-follows-closed") return false;
  if (scenario === "crew-invite-people-closed") return false;
  return followPeopleStageOf(scenario) !== null || CLUB_OPEN.has(scenario);
}

/** The People gate every route here starts with: session, store, release. */
export function peopleGate(
  request: Request,
  scenario: string,
  signIn: string = PEOPLE_SAYS.signIn,
): Response | null {
  if (!sessionOf(request)) return refusal(401, "unauthorized", signIn);
  if (scenario === "clubs-unavailable") {
    return refusal(503, "internal_error", PEOPLE_SAYS.down);
  }
  if (!peopleOpenTo(scenario)) {
    return refusal(404, "not_found", PEOPLE_SAYS.notOpen);
  }
  return null;
}

/** `mayWrite`: the adult answer, the standing, then the first name. */
export function mayWrite(scenario: string): Response | null {
  if (scenario === "clubs-no-age") {
    return refusal(403, "adult_confirmation_required", PEOPLE_SAYS.adultsOnly);
  }
  if (scenario === "clubs-paused" || scenario === "clubs-ended") {
    const removed = scenario === "clubs-ended";
    return refusal(
      403,
      "people_paused",
      removed ? PEOPLE_SAYS.ended : PEOPLE_SAYS.paused,
      { standing: removed ? "removed" : "restricted", until: PAUSED_UNTIL },
    );
  }
  if (scenario === "clubs-no-name") {
    return refusal(409, "name_required", PEOPLE_SAYS.needsName);
  }
  return null;
}

export interface FollowedClub {
  clubId: string;
  slug: string;
  name: string;
}

/**
 * The Havelock groups, with the ids and slugs of #386's `CLUB_IDS` and
 * `CLUB_SLUGS`, so a follow made on its directory names a known group.
 * Swap for those once #386 merges.
 */
export const FOLLOW_CLUBS: readonly FollowedClub[] = [
  {
    clubId: "c10b0000-0000-4000-8000-000000000001",
    slug: "havelock-book-club",
    name: "Havelock Book Club",
  },
  {
    clubId: "c10b0000-0000-4000-8000-000000000002",
    slug: "havelock-reef-runners",
    name: "Havelock Reef Runners",
  },
  {
    clubId: "c10b0000-0000-4000-8000-000000000003",
    slug: "havelock-trek-group",
    name: "Havelock Trek Group",
  },
  {
    clubId: "c10b0000-0000-4000-8000-000000000004",
    slug: "havelock-long-names",
    name: "Havelock Island Early Morning Sea Swimmers, Snorkellers and Beach Clean-up Volunteers Collective",
  },
  {
    clubId: "c10b0000-0000-4000-8000-000000000005",
    slug: "havelock-walking-circle",
    name: "Havelock Walking Circle",
  },
];

/** Reef Runners, the group `club-follows-one` starts with. */
export const FOLLOWED_FIRST = FOLLOW_CLUBS[1];

/** 200 groups in other places, for `club-follows-full`. */
const FAR_CLUBS: readonly FollowedClub[] = Array.from(
  { length: FOLLOW_LIMIT },
  (_, i) => {
    const n = String(i + 1);
    return {
      clubId: `f0110000-0000-4000-8000-${n.padStart(12, "0")}`,
      slug: `far-group-${n}`,
      name: `Far group ${n}`,
    };
  },
);

const SHOWN = new Map(
  [...FOLLOW_CLUBS, ...FAR_CLUBS].map((c) => [c.clubId, c]),
);

/** A group the directory shows, by id; undefined for none. */
export function shownClub(clubId: string): FollowedClub | undefined {
  return SHOWN.get(clubId.toLowerCase());
}

function startingFollows(scenario: string): string[] {
  if (scenario === "club-follows-one") return [FOLLOWED_FIRST.clubId];
  if (scenario === "club-follows-full") return FAR_CLUBS.map((c) => c.clubId);
  return [];
}

/** Follows per scenario and session, newest first. */
const follows = new Map<string, string[]>();

/** The ids this session follows under the scenario, newest first. */
export function followsOf(scenario: string, session: string): string[] {
  const key = `${scenario}|${session}`;
  let ids = follows.get(key);
  if (!ids) {
    ids = startingFollows(scenario);
    follows.set(key, ids);
  }
  return ids;
}

export function setFollows(
  scenario: string,
  session: string,
  ids: string[],
): void {
  follows.set(`${scenario}|${session}`, ids);
}

/** For tests: every session back to its scenario's start. */
export function __resetFollowMocks(): void {
  follows.clear();
}
