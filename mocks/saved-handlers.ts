import { http, HttpResponse } from "msw";
import { EXPERIENCES, EXPERIENCE_DETAIL, mockHeaders } from "./fixtures";
import type { components } from "../src/lib/api/schema.gen";

type SavedExperience = components["schemas"]["SavedExperience"];

/**
 * A traveller's saves on the account (yuvoy-api#192), in memory.
 *
 * Written against the API's own handler (`internal/handler/traveller_saved.go`
 * at 6caa728) rather than only against the contract's prose, because the
 * behaviour the client depends on lives in the details:
 *
 *   - **Session only.** A booking's status token is refused with the same 401
 *     as no credential at all. The mock tells the two apart by the prefix the
 *     sign-in handler mints (`sess_`), as the `/me` handler already does.
 *   - **Adoption is all or nothing.** One unknown id refuses the whole batch
 *     with a `404` that names no id, and one malformed id refuses it with a
 *     `400`. That is exactly why the client falls back to one id at a time,
 *     so a mock that adopted the good ids and skipped the bad would let that
 *     fallback go untested.
 *   - **Idempotent both ways**, and a repeated save keeps its position.
 *
 * ## One deliberate difference
 *
 * The API refuses any id that is not a UUID. Every experience id in these
 * fixtures is a readable string (`exp_kayak`), so the mock accepts a fixture
 * id as it is and applies the API's two refusals to everything else: a
 * UUID-shaped id it does not know is a `404`, anything else is a `400`. Both
 * refusals stay reachable, which is what matters to the client.
 */

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8099/v1";
const url = (p: string) => `${BASE}${p}`;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The contract's ceiling on one adoption. */
const MAX_ADOPT = 200;

let seq = 0;
const rid = () =>
  `01JSAV${(++seq).toString(36).toUpperCase().padStart(5, "0")}`;

function envelope(code: string, message: string, status: number) {
  return HttpResponse.json(
    { error: { code, message, requestId: rid() } },
    { status, headers: mockHeaders(rid()) },
  );
}

/** Saves by session token: experience id to the order it was saved in. */
const accounts = new Map<string, Map<string, number>>();
/** Monotonic, so "newest first" is exact even within one millisecond. */
let savedSeq = 0;

/** Test-only: every account forgets its saves between cases. */
export function __resetSavedMocks(): void {
  accounts.clear();
  savedSeq = 0;
}

/** Test-only: start an account with these saves, oldest first. */
export function __seedSavedMock(token: string, ids: string[]): void {
  const saves = new Map<string, number>();
  for (const id of ids) saves.set(id, ++savedSeq);
  accounts.set(token, saves);
}

/** The session this request carries, or null for none or a status token. */
function sessionOf(request: Request): string | null {
  const header = request.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  return token.startsWith("sess_") ? token : null;
}

function savesOf(token: string): Map<string, number> {
  let saves = accounts.get(token);
  if (!saves) {
    saves = new Map();
    accounts.set(token, saves);
  }
  return saves;
}

const KNOWN = new Map(EXPERIENCES.map((e) => [e.id, e]));

/** `ok`, or the refusal the API gives this id. */
function checkId(id: unknown): "ok" | "unknown" | "invalid" {
  if (typeof id !== "string" || !id) return "invalid";
  if (KNOWN.has(id)) return "ok";
  return UUID.test(id) ? "unknown" : "invalid";
}

function refusal(outcome: "unknown" | "invalid") {
  return outcome === "unknown"
    ? envelope("not_found", "That experience is not available to save.", 404)
    : envelope(
        "invalid_input",
        "Send valid experience ids, at most 200 at a time.",
        400,
      );
}

const UNAUTHORIZED = () =>
  envelope("unauthorized", "Sign in to see your saved experiences.", 401);

/** A saved card: the public summary, plus whether it can be booked now. */
function card(id: string): SavedExperience {
  const summary = KNOWN.get(id)!;
  const detail = EXPERIENCE_DETAIL[summary.slug];
  return { ...summary, bookable: detail?.bookable ?? true };
}

/** The whole set, ordered the way the API orders it: by id. */
function allIds(saves: Map<string, number>): string[] {
  return [...saves.keys()].sort();
}

async function jsonBody(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return undefined;
  }
}

export const savedHandlers = [
  http.get(url("/me/saved/ids"), ({ request }) => {
    const token = sessionOf(request);
    if (!token) return UNAUTHORIZED();
    return HttpResponse.json(
      { ids: allIds(savesOf(token)) },
      { headers: mockHeaders(rid()) },
    );
  }),

  http.get(url("/me/saved"), ({ request }) => {
    const token = sessionOf(request);
    if (!token) return UNAUTHORIZED();

    const params = new URL(request.url).searchParams;
    const limit = Number(params.get("limit") ?? 20);
    if (!Number.isInteger(limit) || limit < 1 || limit > 50) {
      return envelope("invalid_input", "limit must be between 1 and 50", 400);
    }
    /*
      Opaque to the client, as the contract requires. It is an offset here
      because the mock's set does not change under a test between pages; the
      API's is a keyset on (saved_at, id), which is why a save made on another
      device never shifts a page the client already holds.
    */
    const cursor = params.get("cursor");
    const offset = cursor ? Number(cursor.replace(/^c/, "")) : 0;
    if (!Number.isInteger(offset) || offset < 0) {
      return envelope(
        "invalid_input",
        "That saved page is not valid. Start again from the top.",
        400,
      );
    }

    const newestFirst = [...savesOf(token).entries()]
      .sort(([, a], [, b]) => b - a)
      .map(([id]) => id);
    const page = newestFirst.slice(offset, offset + limit);
    const complete = offset + limit >= newestFirst.length;

    return HttpResponse.json(
      {
        items: page.map(card),
        nextCursor: complete ? null : `c${offset + limit}`,
        complete,
      },
      { headers: mockHeaders(rid()) },
    );
  }),

  http.post(url("/me/saved"), async ({ request }) => {
    const token = sessionOf(request);
    if (!token) return UNAUTHORIZED();

    const body = (await jsonBody(request)) as
      { experienceId?: unknown } | undefined;
    const extra = body
      ? Object.keys(body).some((k) => k !== "experienceId")
      : true;
    if (!body || extra || !body.experienceId) {
      return envelope("invalid_input", "Send an experienceId.", 400);
    }
    const outcome = checkId(body.experienceId);
    if (outcome !== "ok") return refusal(outcome);

    const saves = savesOf(token);
    const id = body.experienceId as string;
    // Idempotent, and a repeat keeps its place in the list.
    if (!saves.has(id)) saves.set(id, ++savedSeq);
    return new HttpResponse(null, { status: 204 });
  }),

  http.post(url("/me/saved/adopt"), async ({ request }) => {
    const token = sessionOf(request);
    if (!token) return UNAUTHORIZED();

    const body = (await jsonBody(request)) as
      { experienceIds?: unknown } | undefined;
    const ids = body?.experienceIds;
    if (!Array.isArray(ids)) {
      return envelope("invalid_input", "Send an experienceIds array.", 400);
    }
    if (ids.length > MAX_ADOPT) return refusal("invalid");

    /*
      All or nothing, and the malformed check first: the API validates every
      id's shape before it reads anything, then refuses the batch at the first
      id it cannot find.
    */
    if (ids.some((id) => checkId(id) === "invalid")) return refusal("invalid");
    if (ids.some((id) => checkId(id) === "unknown")) return refusal("unknown");

    const saves = savesOf(token);
    for (const id of ids as string[]) {
      if (!saves.has(id)) saves.set(id, ++savedSeq);
    }
    return HttpResponse.json(
      { ids: allIds(saves) },
      { headers: mockHeaders(rid()) },
    );
  }),

  http.delete(url("/me/saved/:experienceId"), ({ request, params }) => {
    const token = sessionOf(request);
    if (!token) return UNAUTHORIZED();

    const id = String(params.experienceId);
    if (checkId(id) === "invalid") return refusal("invalid");
    // Idempotent: removing something absent is a 204 too.
    savesOf(token).delete(id);
    return new HttpResponse(null, { status: 204 });
  }),
];
