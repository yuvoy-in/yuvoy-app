import { http, HttpResponse } from "msw";
import type { components } from "../src/lib/api/schema.gen";
import { mockHeaders, mockNow } from "./fixtures";
import {
  ME_DID_YOU_GO,
  ME_DID_YOU_GO_PLACE,
  longEntries,
  meBadges,
  meEntries,
  meSettings,
  refOf,
} from "./me-fixtures";

/**
 * Me on the Account screen (yuvoy-mobile#444, R10-M1): the caller's life
 * list and who may see one entry, the Did you go question, the badges and
 * marking new ones seen, and the two settings, judged as yuvoy-api
 * `handler/me_life.go`, `me_badges.go`, `went_visibility.go` and
 * `traveller_settings.go` judge them. Ported from yuvoy-mobile's
 * `packages/mocks/src/me-handlers.ts`, less a friend's list and cheers, which
 * the web does not build yet.
 *
 * With no scenario `me` is `off`, as in production, and every life list and
 * badge route answers `404`, as the API does outside the release. Each
 * scenario below opens `me` and `going` at `staff`, with this number in the
 * staff group:
 *
 *   - `me-life-list`: six entries (one of each kind and proof), one Did you go
 *     question, two badges earned and two on the way, `languages` ["en"].
 *   - `me-life-list-long`: the same with 45 entries (pages of 20, 20 and 5).
 *   - `me-empty`: nothing yet: no entries, no question, nothing earned.
 *   - `me-badges-new`: `me-life-list` with both earned badges not seen yet.
 *   - `me-life-list-error`: the life list and the badges answer `503`.
 *   - `me-writes-fail`: `me-life-list`, with every write answering `503`, for
 *     the two failure lines.
 *   - `me-tables`: `me-life-list` with `tables` at `staff` too, so Women-only
 *     tables shows.
 *
 * `me-off` names the closed release on purpose; it answers as no scenario.
 * `/me/settings` is not behind `me`, so it answers under every scenario.
 *
 * What a session changes is kept per scenario and session (the
 * `Authorization` header), so two e2e projects never see each other's.
 */

type LifeEntry = components["schemas"]["LifeEntry"];
type Badge = components["schemas"]["Badge"];
type BadgeProgress = components["schemas"]["BadgeProgress"];
type MySettings = components["schemas"]["MySettings"];
type DidYouGo = { eventId: string; title: string; startsAt: string };

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8099/v1";
const url = (p: string) => `${BASE}${p}`;

let seq = 0;
const rid = () =>
  `01J${(++seq).toString(36).toUpperCase().padStart(6, "0")}MEMK`;

function envelope(
  code: string,
  message: string,
  status: number,
  details?: Record<string, unknown>,
) {
  return HttpResponse.json(
    { error: { code, message, requestId: rid(), ...(details && { details }) } },
    { status, headers: mockHeaders(rid()) },
  );
}

/* Never cached: a photo link in the list lasts five minutes. */
function json(body: Record<string, unknown>) {
  return HttpResponse.json(body, {
    headers: { ...mockHeaders(rid()), "cache-control": "no-store" },
  });
}

function scenarioOf(request: Request): string {
  return (
    request.headers.get("x-yuvoy-scenario") ??
    new URL(request.url).searchParams.get("__scenario") ??
    "ok"
  );
}

/** The scenarios that open `me` at `staff`. See above for each. */
export const ME_SCENARIOS: ReadonlySet<string> = new Set([
  "me-life-list",
  "me-life-list-long",
  "me-empty",
  "me-badges-new",
  "me-life-list-error",
  "me-writes-fail",
  "me-tables",
]);

/** The stage a scenario gives `me` (and `going` with it); null is `off`. */
export function meStageOf(scenario: string): "staff" | null {
  return ME_SCENARIOS.has(scenario) ? "staff" : null;
}

/** Whether `GET /me` answers `cohort: staff` under the scenario. */
export function meStaffCohort(scenario: string): boolean {
  return meStageOf(scenario) !== null;
}

/** The stage the Me scenarios give `tables`: `staff` under `me-tables` only. */
export function meTablesStageOf(scenario: string): "staff" | null {
  return scenario === "me-tables" ? "staff" : null;
}

/* The routes' sentences, as the API sends them. */
const SIGN_IN = "Sign in to see your life list.";
const NOT_OPEN = "The life list isn't open to your account yet.";
const NOT_FOUND = "We couldn't find that entry.";
const PLAN_ONLY_ME = "A plan is only ever seen by you.";
const WENT_OWN_ROUTE = "Change who sees a went answer from its event.";
const BAD_CURSOR =
  "That page of the life list is not valid. Start again from the top.";
const BAD_LIMIT = "limit must be between 1 and 50";
const VISIBILITY_WORDS = "Send visibility: only_me or friends.";
const BADGE_KEYS = "Send keys: 1 to 20 badge keys.";
const WENT_NO_ANSWER = "You have not answered for that one.";
const BAD_ANSWER =
  "Send went, and a rating from 1 to 5 and tags only if you went.";
const BAD_SETTINGS = "Send a JSON object with only the settings that change.";
const BAD_LANGUAGES =
  "Choose up to four languages from the ones offered, each once.";
const DOWN = "This part of Yuvoy is not answering.";

const BADGE_KEY = /^[a-z][a-z0-9_]{2,40}$/;
const VIA = new Set(["trips_card", "event_page", "email_link", "push"]);
const LANGUAGE_CODES = ["en", "hi", "te", "kn"] as const;
const SETTINGS_KEYS = new Set([
  "analyticsConsent",
  "analyticsNotice",
  "surface",
  "reminderEmails",
  "didYouGoEmails",
  "goesWith",
  "daySpend",
  "cityTime",
  "languages",
  "showWomenOnlyTables",
]);

interface MeState {
  entries: LifeEntry[];
  didYouGo: DidYouGo[];
  earned: Badge[];
  inProgress: BadgeProgress[];
}

const states = new Map<string, MeState>();
const settings = new Map<string, MySettings>();

/** What a scenario starts a session with. */
function seed(scenario: string): MeState {
  const badges = meBadges();
  if (scenario === "me-empty") {
    // Nothing done yet: nothing earned, every badge on the way from nothing.
    const inProgress = badges.inProgress.map((p) => ({ ...p, have: 0 }));
    return { entries: [], didYouGo: [], earned: [], inProgress };
  }
  const entries = meEntries();
  if (scenario === "me-life-list-long") entries.push(...longEntries());
  if (scenario === "me-badges-new") {
    for (const b of badges.earned) b.seen = false;
  }
  return {
    entries,
    didYouGo: [{ ...ME_DID_YOU_GO }],
    earned: badges.earned,
    inProgress: badges.inProgress,
  };
}

function stateOf(scenario: string, auth: string): MeState {
  const key = `${scenario}|${auth}`;
  let state = states.get(key);
  if (!state) {
    state = seed(scenario);
    states.set(key, state);
  }
  return state;
}

/** Newest first, then by id, as the API's keyset reads them. */
function newestFirst(entries: readonly LifeEntry[]): LifeEntry[] {
  return [...entries].sort(
    (a, b) =>
      Date.parse(b.happenedAt) - Date.parse(a.happenedAt) ||
      (a.entryId < b.entryId ? 1 : -1),
  );
}

/**
 * The refusals every Me route shares: no session, a session that is not a
 * full sign-in, and the release closed to the caller. Null lets it through.
 */
function refused(request: Request, scenario: string): Response | null {
  const auth = request.headers.get("authorization");
  if (!auth || !auth.includes("Bearer sess_")) {
    return envelope("unauthorized", SIGN_IN, 401);
  }
  if (!meStaffCohort(scenario)) return envelope("not_found", NOT_OPEN, 404);
  return null;
}

/** A JSON object body, or null for anything else. */
async function bodyOf(
  request: Request,
): Promise<Record<string, unknown> | null> {
  try {
    const body = (await request.json()) as unknown;
    if (!body || typeof body !== "object" || Array.isArray(body)) return null;
    return body as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** The visibility of a body that holds only that, or the 400. */
async function visibilityOf(
  request: Request,
): Promise<"only_me" | "friends" | Response> {
  const body = await bodyOf(request);
  const only = body && Object.keys(body).every((k) => k === "visibility");
  const v = only ? body.visibility : undefined;
  if (v === "only_me" || v === "friends") return v;
  return envelope("invalid_input", VISIBILITY_WORDS, 400, {
    visibility: "only_me or friends",
  });
}

const writesFail = (scenario: string) => scenario === "me-writes-fail";

export const meHandlers = [
  /* getMyLifeList: the question and the counts on the first page only. */
  http.get(url("/me/life-list"), ({ request }) => {
    const scenario = scenarioOf(request);
    const no = refused(request, scenario);
    if (no) return no;
    if (scenario === "me-life-list-error") {
      return envelope("unavailable", DOWN, 503);
    }
    const params = new URL(request.url).searchParams;
    const rawLimit = params.get("limit") ?? "";
    const limit = rawLimit === "" ? 20 : Number(rawLimit);
    if (!/^\d*$/.test(rawLimit) || !(limit >= 1 && limit <= 50)) {
      return envelope("invalid_input", BAD_LIMIT, 400);
    }
    const cursor = params.get("cursor");
    let offset = 0;
    if (cursor !== null) {
      const match = /^ll\.(\d+)$/.exec(cursor);
      if (!match) return envelope("invalid_input", BAD_CURSOR, 400);
      offset = Number(match[1]);
    }
    const state = stateOf(scenario, request.headers.get("authorization")!);
    const all = newestFirst(state.entries);
    const first = cursor === null;
    return json({
      entries: all.slice(offset, offset + limit),
      didYouGo: first ? state.didYouGo.map((d) => ({ ...d })) : [],
      counts: first
        ? { done: all.length, checked: all.filter((e) => e.checked).length }
        : { done: 0, checked: 0 },
      nextCursor: offset + limit < all.length ? `ll.${offset + limit}` : null,
    });
  }),

  /* updateMyLifeEntry: trips and tables; a plan and a went entry are 409s. */
  http.patch(url("/me/life-list/:entryId"), async ({ request, params }) => {
    const scenario = scenarioOf(request);
    const no = refused(request, scenario);
    if (no) return no;
    const id = String(params.entryId);
    const visibility = await visibilityOf(request);
    if (visibility instanceof Response) return visibility;
    if (id.startsWith("plan:")) return envelope("conflict", PLAN_ONLY_ME, 409);
    if (id.startsWith("went:")) {
      return envelope("conflict", WENT_OWN_ROUTE, 409, {
        use: `/v1/me/went/${refOf(id)}`,
      });
    }
    if (writesFail(scenario)) return envelope("unavailable", DOWN, 503);
    const state = stateOf(scenario, request.headers.get("authorization")!);
    const entry = state.entries.find((e) => e.entryId === id);
    if (!entry) return envelope("not_found", NOT_FOUND, 404);
    entry.visibility = visibility;
    return json(entry);
  }),

  /*
    answerDidYouGo for the question: a yes adds a went entry (said you went),
    a no adds none, and either takes the question off. Changing the answer on
    a went entry kept here replaces its rating, or a no takes it off.
  */
  http.post(url("/me/went/:eventId"), async ({ request, params }) => {
    const scenario = scenarioOf(request);
    const no = refused(request, scenario);
    if (no) return no;
    const id = String(params.eventId).toLowerCase();
    const body = await bodyOf(request);
    const bad = () => envelope("invalid_input", BAD_ANSWER, 400);
    if (!body || typeof body.went !== "boolean") return bad();
    const went = body.went;
    if (body.via !== undefined && !VIA.has(String(body.via))) return bad();
    const rating = body.rating;
    const stars = typeof rating === "number" ? rating : null;
    if (rating !== undefined) {
      if (!went || stars === null || !Number.isInteger(stars)) return bad();
      if (stars < 1 || stars > 5) return bad();
    }
    if (writesFail(scenario)) return envelope("unavailable", DOWN, 503);
    const state = stateOf(scenario, request.headers.get("authorization")!);
    const asked = state.didYouGo.find((d) => d.eventId === id);
    const entry = state.entries.find(
      (e) => e.kind === "went" && e.eventId === id,
    );
    if (!asked && !entry) {
      return envelope("not_found", "You are not going to that one.", 404);
    }
    const sent = body.visibility;
    if (sent !== undefined && sent !== "only_me" && sent !== "friends") {
      return envelope("invalid_input", VISIBILITY_WORDS, 400);
    }
    // Omitted: only me on a first answer (no People sharing here), else as it was.
    let visibility: "only_me" | "friends" =
      sent === "only_me" || sent === "friends"
        ? sent
        : (entry?.visibility ?? "only_me");
    if (asked) {
      state.didYouGo = state.didYouGo.filter((d) => d.eventId !== id);
      if (went) {
        const known = id === ME_DID_YOU_GO.eventId;
        state.entries.push({
          entryId: `went:${id}`,
          kind: "went",
          title: asked.title,
          happenedAt: asked.startsAt,
          photoUrl: null,
          destinationKey: known ? ME_DID_YOU_GO_PLACE.destinationKey : null,
          category: known ? ME_DID_YOU_GO_PLACE.category : null,
          eventId: id,
          proof: "said_you_went",
          checked: false,
          rating: stars,
          visibility,
          cheers: 0,
          cheeredBy: [],
        });
      }
    } else if (entry && went) {
      entry.rating = stars;
      entry.visibility = visibility;
    } else if (entry) {
      visibility = entry.visibility;
      state.entries = state.entries.filter((e) => e !== entry);
    }
    return json({
      went,
      rating: stars,
      tags: Array.isArray(body.tags) ? body.tags : [],
      proof: "self",
      answeredAt: new Date(mockNow()).toISOString(),
      visibility,
    });
  }),

  /* updateMyWentVisibility: the one writer of a went entry's visibility. */
  http.patch(url("/me/went/:eventId"), async ({ request, params }) => {
    const scenario = scenarioOf(request);
    const no = refused(request, scenario);
    if (no) return no;
    const id = String(params.eventId).toLowerCase();
    const visibility = await visibilityOf(request);
    if (visibility instanceof Response) return visibility;
    if (writesFail(scenario)) return envelope("unavailable", DOWN, 503);
    const state = stateOf(scenario, request.headers.get("authorization")!);
    const entry = state.entries.find(
      (e) => e.kind === "went" && e.eventId === id,
    );
    if (!entry) return envelope("not_found", WENT_NO_ANSWER, 404);
    entry.visibility = visibility;
    return json({ eventId: id, visibility });
  }),

  /* getMyBadges. */
  http.get(url("/me/badges"), ({ request }) => {
    const scenario = scenarioOf(request);
    const no = refused(request, scenario);
    if (no) return no;
    if (scenario === "me-life-list-error") {
      return envelope("unavailable", DOWN, 503);
    }
    const state = stateOf(scenario, request.headers.get("authorization")!);
    return json(
      structuredClone({ earned: state.earned, inProgress: state.inProgress }),
    );
  }),

  /* markBadgesSeen: 1 to 20 keys; a key not earned is ignored. */
  http.post(url("/me/badges/seen"), async ({ request }) => {
    const scenario = scenarioOf(request);
    const no = refused(request, scenario);
    if (no) return no;
    const keys = (await bodyOf(request))?.keys;
    const ok =
      Array.isArray(keys) &&
      keys.length >= 1 &&
      keys.length <= 20 &&
      keys.every((k) => typeof k === "string" && BADGE_KEY.test(k));
    if (!ok) {
      return envelope("invalid_input", BADGE_KEYS, 400, {
        keys: "1 to 20 badge keys",
      });
    }
    const state = stateOf(scenario, request.headers.get("authorization")!);
    for (const badge of state.earned) {
      if ((keys as string[]).includes(badge.key)) badge.seen = true;
    }
    return new HttpResponse(null, { status: 204, headers: mockHeaders(rid()) });
  }),

  /*
    getMySettings and updateMySettings: every key on every answer; a PATCH
    changes only what it sends, and a key the contract does not name is a
    400. Not behind `me`, so any signed-in session reads them.
  */
  http.get(url("/me/settings"), ({ request }) => {
    const auth = request.headers.get("authorization");
    if (!auth || !auth.includes("Bearer sess_")) {
      return envelope("unauthorized", "Sign in to change your settings.", 401);
    }
    return json(settingsOf(scenarioOf(request), auth));
  }),

  http.patch(url("/me/settings"), async ({ request }) => {
    const auth = request.headers.get("authorization");
    if (!auth || !auth.includes("Bearer sess_")) {
      return envelope("unauthorized", "Sign in to change your settings.", 401);
    }
    const scenario = scenarioOf(request);
    const body = await bodyOf(request);
    if (!body || Object.keys(body).some((k) => !SETTINGS_KEYS.has(k))) {
      return envelope("invalid_input", BAD_SETTINGS, 400);
    }
    const next = { ...settingsOf(scenario, auth) };
    for (const key of [
      "reminderEmails",
      "didYouGoEmails",
      "showWomenOnlyTables",
    ] as const) {
      const value = body[key];
      if (value === undefined || value === null) continue;
      if (typeof value !== "boolean") {
        return envelope("invalid_input", BAD_SETTINGS, 400);
      }
      next[key] = value;
    }
    if ("languages" in body) {
      const chosen = body.languages;
      const ok =
        Array.isArray(chosen) &&
        chosen.length <= LANGUAGE_CODES.length &&
        new Set(chosen).size === chosen.length &&
        chosen.every((c) => LANGUAGE_CODES.some((l) => l === c));
      if (!ok) {
        return envelope("invalid_input", BAD_LANGUAGES, 400, {
          languages: "An array of distinct codes from en, hi, te and kn.",
        });
      }
      // Kept and read back in the API's order, not the order sent.
      next.languages = LANGUAGE_CODES.filter((l) =>
        (chosen as unknown[]).includes(l),
      );
    }
    if (writesFail(scenario)) return envelope("unavailable", DOWN, 503);
    settings.set(`${scenario}|${auth}`, next);
    return json(next);
  }),
];

/** The session's settings: English under Me's scenarios but `me-empty`. */
function settingsOf(scenario: string, auth: string): MySettings {
  const kept = settings.get(`${scenario}|${auth}`);
  if (kept) return { ...kept, languages: [...kept.languages] };
  const english = ME_SCENARIOS.has(scenario) && scenario !== "me-empty";
  return meSettings(english ? ["en"] : []);
}

/** Test-only: forget every life list, question, badge and setting. */
export function __resetMeMocks(): void {
  states.clear();
  settings.clear();
}
