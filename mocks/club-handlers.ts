import { http, HttpResponse } from "msw";
import type { components } from "../src/lib/api/schema.gen";
import { PLACES, mockHeaders } from "./fixtures";
import {
  CLUB_MESSAGES as M,
  CLUB_REMOVAL_REASON_KEYS,
  CLUB_REPORT_REASON_KEYS,
  HAVELOCK_CLUBS,
} from "./club-fixtures";

/**
 * The groups directory's seven routes (yuvoy-mobile#386, web backfill):
 * `listMyClubs`, `getMyClub`, `listClubs`, `getClub`, `claimClub`,
 * `requestClubRemoval` and `reportClub`. Ported from mobile's
 * `packages/mocks/src/club-handlers.ts`, judged in the order yuvoy-api's
 * `internal/handler/clubs.go` judges them, without Follow. Every answer is
 * `Cache-Control: no-store`.
 *
 * ## Who
 *
 * The release is `people`. Under the default scenario it is `off`, as on dev
 * and production today, so every route answers 404. The `/me/` pair, claims
 * and reports need a session (401 without one) and are open to a staff
 * cohort at `staff`; the public pair is open only at `all`. A removal needs
 * no session; with one, the cohort applies. Closed answers 404 `not_found`,
 * the same code as an unknown group.
 *
 * ## Scenarios
 *
 *   - `clubs`: `people` at `staff`, `GET /me` cohort `staff`.
 *   - `clubs-all`: `people` at `all`, so the public pair answers too.
 *   - `clubs-outside`: `people` at `staff`, cohort null: all 404.
 *   - `clubs-unavailable`: 503 `internal_error` on all seven.
 *   - `clubs-no-age`: a claim is 403 `adult_confirmation_required`.
 *   - `clubs-no-name`: a claim is 409 `name_required`.
 *   - `clubs-paused`, `clubs-ended`: a claim is 403 `people_paused`
 *     (`restricted`, `removed`). A report still goes.
 *   - `clubs-claim-waiting`: a claim is 409 `conflict` `claim_waiting`.
 *   - `clubs-claim-limit`, `clubs-report-limit`, `clubs-removal-limit`: that
 *     form is 429 `rate_limited`.
 *   - `clubs-hidden-meanwhile`: the reads show every group, and each form
 *     answers 404, as when a group is hidden between the read and the tap.
 *   - `offline`: no answer at all.
 *
 * Every one but `clubs-all` and `clubs-outside` opens at `staff` with a
 * staff cohort.
 *
 * ## What is kept
 *
 * A removal with `we_run_it_and_want_off` hides the group, and a claim stays
 * waiting, for the rest of the process, each under its own scenario so one
 * scenario's spec does not change another's. `__resetClubMocks` forgets both.
 */

type Club = components["schemas"]["Club"];
type ClubList = components["schemas"]["ClubList"];
type ClubClaimReceipt = components["schemas"]["ClubClaimReceipt"];
type ClubRemovalReceipt = components["schemas"]["ClubRemovalReceipt"];
type ClubReportReceipt = components["schemas"]["ClubReportReceipt"];

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8099/v1";
const url = (p: string) => `${BASE}${p}`;

/** The scenarios this file answers. */
export const CLUB_SCENARIOS: ReadonlySet<string> = new Set([
  "clubs",
  "clubs-all",
  "clubs-outside",
  "clubs-unavailable",
  "clubs-no-age",
  "clubs-no-name",
  "clubs-paused",
  "clubs-ended",
  "clubs-claim-waiting",
  "clubs-claim-limit",
  "clubs-report-limit",
  "clubs-removal-limit",
  "clubs-hidden-meanwhile",
]);

/** `releases.people` on `GET /app-config` under the scenario, or null for this file's none. */
export function clubPeopleStageOf(scenario: string): "staff" | "all" | null {
  if (!CLUB_SCENARIOS.has(scenario)) return null;
  return scenario === "clubs-all" ? "all" : "staff";
}

/** Whether `GET /me` answers `cohort: staff` under the scenario. */
export function clubStaffCohort(scenario: string): boolean {
  return clubPeopleStageOf(scenario) === "staff" && scenario !== "clubs-outside";
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** A slug as staff write it; anything else is no group. */
const SLUG = /^[a-z0-9][a-z0-9-]{1,59}$/;
const TEXT_MOST = 500;
/** When a paused person's pause ends, fixed so no test reads the real clock. */
const PAUSED_UNTIL = "2026-08-26T00:00:00.000Z";

/** Every place the fixtures' places list holds. */
const KNOWN_PLACES: ReadonlySet<string> = new Set(
  PLACES.markets.flatMap((m) => m.destinations.map((d) => d.key)),
);

let seq = 0;
const rid = () =>
  `01JCLB${(++seq).toString(36).toUpperCase().padStart(5, "0")}`;

const headers = () => ({ ...mockHeaders(rid()), "Cache-Control": "no-store" });

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
    { status, headers: headers() },
  );
}

const json = (body: object, status = 200) =>
  HttpResponse.json(body, { status, headers: headers() });
const signIn = () => envelope("unauthorized", M.signIn, 401);
const notOpen = () => envelope("not_found", M.notOpen, 404);
const notFound = () => envelope("not_found", M.notFound, 404);
const unavailable = () => envelope("internal_error", M.unavailable, 503);
const badInput = (message: string, details?: Record<string, unknown>) =>
  envelope("invalid_input", message, 400, details);
const tooMany = (message: string) => envelope("rate_limited", message, 429);

/** Hidden groups and waiting claims, each under its scenario. */
const hidden = new Set<string>();
const waiting = new Set<string>();
let claimSeq = 0;

/** Test only: every hidden group back, every waiting claim forgotten. */
export function __resetClubMocks(): void {
  hidden.clear();
  waiting.clear();
  claimSeq = 0;
}

function scenarioOf(request: Request): string {
  return (
    request.headers.get("x-yuvoy-scenario") ??
    new URL(request.url).searchParams.get("__scenario") ??
    "ok"
  );
}

const sessionOf = (request: Request): string | null => {
  const auth = request.headers.get("authorization") ?? "";
  return /^Bearer sess_/.test(auth) ? auth : null;
};

/** Whether the release is open to this caller under the scenario. */
function openFor(request: Request, scenario: string): boolean {
  const stage = clubPeopleStageOf(scenario);
  if (stage === "all") return true;
  return stage === "staff" && sessionOf(request) !== null
    ? clubStaffCohort(scenario)
    : false;
}

/** A group the directory shows under the scenario, by slug or id. */
function shownClub(scenario: string, key: string): Club | undefined {
  const club = HAVELOCK_CLUBS.find((c) => c.slug === key || c.clubId === key);
  return club && !hidden.has(`${scenario}:${club.clubId}`) ? club : undefined;
}

/**
 * A body as the API reads it: one JSON object with only `fields`, each a
 * string or null. Empty when there is none; "invalid" for anything else.
 */
async function bodyOf(
  request: Request,
  fields: readonly string[],
): Promise<Record<string, string | undefined> | "invalid"> {
  const text = await request.text();
  if (text.trim() === "") return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return "invalid";
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed))
    return "invalid";
  const out: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(parsed)) {
    if (!fields.includes(key)) return "invalid";
    if (value !== null && typeof value !== "string") return "invalid";
    out[key] = value ?? undefined;
  }
  return out;
}

const runes = (s: string) => [...s].length;
const bytes = (s: string) => new TextEncoder().encode(s).length;

/** An address alone, at most 254 characters. */
function emailOk(raw: string): boolean {
  const s = raw.trim().toLowerCase();
  if (s === "" || bytes(s) > 254) return false;
  return /^[^\s@<>()[\]\\,;:"]+@[^\s@<>()[\]\\,;:"]+$/.test(s);
}

/** An absolute https address with a host and no user, at most 500 bytes. */
function httpsOk(raw: string): boolean {
  const s = raw.trim();
  if (s === "" || bytes(s) > TEXT_MOST) return false;
  try {
    const u = new URL(s);
    return (
      u.protocol === "https:" && u.hostname !== "" && !u.username && !u.password
    );
  } catch {
    return false;
  }
}

/** The age, the standing and the name, as `peopleGate` asks them before a claim. */
function mayClaim(scenario: string): Response | null {
  if (scenario === "clubs-no-age") {
    return envelope("adult_confirmation_required", M.adultsOnly, 403);
  }
  if (scenario === "clubs-paused" || scenario === "clubs-ended") {
    const standing = scenario === "clubs-ended" ? "removed" : "restricted";
    return envelope(
      "people_paused",
      standing === "removed" ? M.ended : M.paused,
      403,
      { standing, until: PAUSED_UNTIL },
    );
  }
  if (scenario === "clubs-no-name") {
    return envelope("name_required", M.needsName, 409);
  }
  return null;
}

/** The directory for one place, once the release is open. */
function listFor(request: Request, scenario: string): Response {
  const key = (
    new URL(request.url).searchParams.get("destinationKey") ?? ""
  ).trim();
  if (key === "" || key.length > 100)
    return badInput(M.noPlace, { destinationKey: "required" });
  if (!KNOWN_PLACES.has(key))
    return badInput(M.noPlace, { destinationKey: "no such place" });
  const clubs = HAVELOCK_CLUBS.filter(
    (c) => c.destinationKey === key && shownClub(scenario, c.clubId),
  );
  return json({ clubs } satisfies ClubList);
}

/** One group, once the release is open: `{slug}` takes a slug or the group's id. */
function oneFor(scenario: string, slug: string): Response {
  let key = slug;
  if (UUID.test(key)) key = key.toLowerCase();
  else if (!SLUG.test(key)) return notFound();
  const club = shownClub(scenario, key);
  return club ? json(club) : notFound();
}

/** The group a form names, or null when it is not shown now. */
function formTarget(scenario: string, id: string): Club | null {
  if (scenario === "clubs-hidden-meanwhile") return null;
  return shownClub(scenario, id.toLowerCase()) ?? null;
}

/** The public pair: open only at `all`, signed in or not. */
function publicGate(scenario: string): Response | null {
  if (scenario === "clubs-unavailable") return unavailable();
  return clubPeopleStageOf(scenario) === "all" ? null : notOpen();
}

/** The `/me/` pair, a claim and a report: a session, then the release for its cohort. */
function sessionGate(request: Request, scenario: string): Response | null {
  if (!sessionOf(request)) return signIn();
  if (scenario === "clubs-unavailable") return unavailable();
  return openFor(request, scenario) ? null : notOpen();
}

const offline = (scenario: string) => scenario === "offline";

export const clubHandlers = [
  /* listMyClubs */
  http.get(url("/me/clubs"), ({ request }) => {
    const scenario = scenarioOf(request);
    if (offline(scenario)) return HttpResponse.error();
    return sessionGate(request, scenario) ?? listFor(request, scenario);
  }),

  /* getMyClub */
  http.get(url("/me/clubs/:slug"), ({ request, params }) => {
    const scenario = scenarioOf(request);
    if (offline(scenario)) return HttpResponse.error();
    return (
      sessionGate(request, scenario) ?? oneFor(scenario, String(params.slug))
    );
  }),

  /* listClubs */
  http.get(url("/clubs"), ({ request }) => {
    const scenario = scenarioOf(request);
    if (offline(scenario)) return HttpResponse.error();
    return publicGate(scenario) ?? listFor(request, scenario);
  }),

  /* getClub */
  http.get(url("/clubs/:slug"), ({ request, params }) => {
    const scenario = scenarioOf(request);
    if (offline(scenario)) return HttpResponse.error();
    return publicGate(scenario) ?? oneFor(scenario, String(params.slug));
  }),

  /* claimClub: a person on the team checks the claim with the group first. */
  http.post(url("/clubs/:clubId/claims"), async ({ request, params }) => {
    const scenario = scenarioOf(request);
    if (offline(scenario)) return HttpResponse.error();
    const gated = sessionGate(request, scenario);
    if (gated) return gated;
    const id = String(params.clubId);
    if (!UUID.test(id)) return notFound();
    const body = await bodyOf(request, [
      "roleText",
      "contactEmail",
      "proofUrl",
      "note",
    ]);
    if (body === "invalid") return badInput(M.claimWords);
    const problems: Record<string, string> = {};
    const role = runes((body.roleText ?? "").trim());
    if (role < 2 || role > 80) problems.roleText = "2 to 80 characters";
    if (!emailOk(body.contactEmail ?? "")) {
      problems.contactEmail = "an email address alone, at most 254 characters";
    }
    if (body.proofUrl !== undefined && !httpsOk(body.proofUrl)) {
      problems.proofUrl = "an https address, at most 500 characters";
    }
    if (body.note !== undefined && runes(body.note.trim()) > TEXT_MOST) {
      problems.note = "at most 500 characters";
    }
    if (Object.keys(problems).length > 0)
      return badInput(M.claimWords, problems);
    const refused = mayClaim(scenario);
    if (refused) return refused;
    // Counted before the group is read, so trying ids costs the same as claiming.
    if (scenario === "clubs-claim-limit") return tooMany(M.claimTooMany);
    const club = formTarget(scenario, id);
    if (!club) return notFound();
    if (!club.claimable) {
      return envelope("conflict", M.claimed, 409, {
        reason: "already_claimed",
      });
    }
    const mine = `${scenario}:${sessionOf(request)}:${club.clubId}`;
    if (scenario === "clubs-claim-waiting" || waiting.has(mine)) {
      return envelope("conflict", M.claimWaiting, 409, {
        reason: "claim_waiting",
      });
    }
    waiting.add(mine);
    const claimId = `c1a10000-0000-4000-8000-${(++claimSeq).toString(16).padStart(12, "0")}`;
    return json(
      { claimId, message: M.claimReceived } satisfies ClubClaimReceipt,
      202,
    );
  }),

  /* requestClubRemoval: no session needed; with one, its cohort applies. */
  http.post(
    url("/clubs/:clubId/removal-requests"),
    async ({ request, params }) => {
      const scenario = scenarioOf(request);
      if (offline(scenario)) return HttpResponse.error();
      if (scenario === "clubs-unavailable") return unavailable();
      if (!openFor(request, scenario)) return notOpen();
      const id = String(params.clubId);
      if (!UUID.test(id)) return notFound();
      const body = await bodyOf(request, ["reason", "note"]);
      if (body === "invalid") return badInput(M.removalWords);
      const reason = body.reason ?? "";
      if (!(CLUB_REMOVAL_REASON_KEYS as readonly string[]).includes(reason)) {
        return badInput(M.removalWords, {
          reason,
          allowed: CLUB_REMOVAL_REASON_KEYS,
        });
      }
      if (body.note !== undefined && runes(body.note.trim()) > TEXT_MOST) {
        return badInput(M.removalWords, { note: "at most 500 characters" });
      }
      if (scenario === "clubs-removal-limit") return tooMany(M.removalBusy);
      const club = formTarget(scenario, id);
      if (!club) return notFound();
      const removed = reason === CLUB_REMOVAL_REASON_KEYS[0];
      if (removed) hidden.add(`${scenario}:${club.clubId}`);
      const message = removed ? M.removedNow : M.removalQueued;
      return json({ removed, message } satisfies ClubRemovalReceipt, 202);
    },
  ),

  /* reportClub: the listing stays as it is until a person looks. */
  http.post(url("/clubs/:clubId/reports"), async ({ request, params }) => {
    const scenario = scenarioOf(request);
    if (offline(scenario)) return HttpResponse.error();
    const gated = sessionGate(request, scenario);
    if (gated) return gated;
    const id = String(params.clubId);
    if (!UUID.test(id)) return notFound();
    const body = await bodyOf(request, ["reason", "note"]);
    if (body === "invalid") return badInput(M.reportWords);
    const reason = body.reason ?? "";
    if (!(CLUB_REPORT_REASON_KEYS as readonly string[]).includes(reason)) {
      return badInput(M.reportWords, {
        reason,
        allowed: CLUB_REPORT_REASON_KEYS,
      });
    }
    if (body.note !== undefined || reason === "other") {
      const note = runes((body.note ?? "").trim());
      if (note < 1 || note > TEXT_MOST) {
        return badInput(M.reportWords, {
          note: "1 to 500 characters, required for other",
        });
      }
    }
    if (scenario === "clubs-report-limit") return tooMany(M.reportTooMany);
    if (!formTarget(scenario, id)) return notFound();
    return json({ message: M.reportThanks } satisfies ClubReportReceipt, 202);
  }),
];
