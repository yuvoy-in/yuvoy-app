import { http, HttpResponse } from "msw";
import { mockHeaders, mockNow } from "./fixtures";
import { adults, asksAge, doorUsed, scenarioOf } from "./organiser-store";

/**
 * The door, `POST /organiser-check-ins` (yuvoy-app#226, the web half of
 * yuvoy-mobile#394, yuvoy-api #483). Checks in the order the API does: the
 * session, `supply`, the age, the kill switch, the body, then the code.
 * Every sentence is the API's (`internal/handler/door_check_in.go`).
 *
 * The answer by code, as sent (case, spaces and hyphens ignored). Every code
 * is from the API's alphabet (`CHECK_IN_CODE_ALPHABET`: no 0, 1, I, L or O),
 * or the page's own button would never send it:
 *
 *   - `ASHA2345`: 200 Asha at "Sample Sunday Run"; the same code again is
 *     `alreadyCheckedIn` with the first time (per scenario and session).
 *   - `NAME2345`: 200 with an empty `firstName`.
 *   - `USED2345`: 200, used before, at 2026-11-01T13:12:00Z.
 *   - `WAKE2345`: 409 `check_in_not_today`, `details.validOn`.
 *   - `MYNE2345`: 409 `own_code`.
 *   - `FAST2345`: 429 `rate_limited` (the 30 misses an hour).
 *   - `BRKE2345`: 500.
 *   - anything else: 404 `not_found`.
 *
 * Scenarios (`organiser-store.ts` gives the door ones one verified organiser):
 *
 *   - `organisers-door`: the codes above.
 *   - `organisers-door-paused`, and `organisers-paused` (the same kill
 *     switch): every check-in is 503 `organisers_paused`.
 *   - `organisers-door-age`, and `organisers-age`: 403
 *     `adult_confirmation_required` until `PUT /me/age` takes an adult answer.
 *   - `organisers-closed-release`: 404, as outside the `supply` release.
 *
 * The door's own limiter (60 a minute per session) is not mocked: its 429
 * reads "Too many door check-ins in a short time. Wait a moment and try
 * again." with no `Retry-After`, as the API's.
 */

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8099/v1";

let seq = 0;
const rid = () =>
  `01J${(++seq).toString(36).toUpperCase().padStart(6, "0")}DOOR`;

const SAID = {
  signIn: "Sign in to check people in at the door.",
  notOpen: "Door check-in is not open to your account yet.",
  adultsOnly:
    "Checking people in is for people 18 or over. Confirm your age in your account, then try again.",
  paused: "Door check-in is paused for a moment. Try again soon.",
  badBody: "We could not read that code.",
  noCode: "This code is not for one of your events.",
  ownCode: "You can't check yourself in. Ask another helper at the door.",
  tooMany: "Too many codes did not match. Try again in an hour.",
} as const;

/** The day `WAKE2345` is for, and the sentence the API writes for it. */
export const DOOR_LATER_ON = "2026-11-08";
const LATER_SAID = "This code is for Sun 8 Nov.";

/** `USED2345`'s first time. */
export const DOOR_USED_AT = "2026-11-01T13:12:00Z";

const PAUSED_SCENARIOS = new Set([
  "organisers-paused",
  "organisers-door-paused",
]);

function envelope(
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
        requestId: rid(),
        ...(details ? { details } : {}),
      },
    },
    { status, headers: mockHeaders(rid()) },
  );
}

function answer(body: Record<string, unknown>) {
  return HttpResponse.json(body, {
    status: 200,
    headers: { ...mockHeaders(rid()), "cache-control": "no-store" },
  });
}

type Read =
  { ok: true; code: string } | { ok: false; details: Record<string, string> };

/** The body as the API reads it: `code` (8 to 12 after cleaning) and `via`, nothing else. */
async function readBody(request: Request): Promise<Read> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return {
      ok: false,
      details: {
        body: "send code, and via when you have it, and nothing else",
      },
    };
  }
  const fields =
    typeof body === "object" && body !== null
      ? (body as Record<string, unknown>)
      : {};
  const details: Record<string, string> = {};
  if (Object.keys(fields).some((k) => k !== "code" && k !== "via")) {
    details.body = "send code, and via when you have it, and nothing else";
  }
  const code =
    typeof fields.code === "string"
      ? fields.code.replace(/[\s-]+/g, "").toUpperCase()
      : "";
  if (code.length < 8 || code.length > 12) {
    details.code = "the eight characters on the Going card, like K7QM-2XPA";
  }
  if (
    fields.via !== undefined &&
    fields.via !== "portal_link" &&
    fields.via !== "typed"
  ) {
    details.via = "portal_link or typed";
  }
  return Object.keys(details).length > 0
    ? { ok: false, details }
    : { ok: true, code };
}

export const doorHandlers = [
  http.post(`${BASE}/organiser-check-ins`, async ({ request }) => {
    const auth = request.headers.get("authorization");
    if (!auth?.includes("Bearer sess_")) {
      return envelope("unauthorized", SAID.signIn, 401);
    }
    const scenario = scenarioOf(request);
    if (scenario === "organisers-closed-release") {
      return envelope("not_found", SAID.notOpen, 404);
    }
    if (asksAge(scenario) && !adults.has(auth)) {
      return envelope("adult_confirmation_required", SAID.adultsOnly, 403);
    }
    if (PAUSED_SCENARIOS.has(scenario)) {
      return envelope("organisers_paused", SAID.paused, 503);
    }
    const read = await readBody(request);
    if (!read.ok) {
      return envelope("invalid_input", SAID.badBody, 400, read.details);
    }

    switch (read.code) {
      case "ASHA2345": {
        const key = `${scenario}|${auth}|${read.code}`;
        const first = doorUsed.get(key);
        const at = first ?? new Date(mockNow()).toISOString();
        if (!first) doorUsed.set(key, at);
        return answer({
          firstName: "Asha",
          eventTitle: "Sample Sunday Run",
          checkedInAt: at,
          alreadyCheckedIn: first !== undefined,
        });
      }
      case "NAME2345":
        return answer({
          firstName: "",
          eventTitle: "Sample Sunday Run",
          checkedInAt: new Date(mockNow()).toISOString(),
          alreadyCheckedIn: false,
        });
      case "USED2345":
        return answer({
          firstName: "Ravi",
          eventTitle: "Sample Sunday Run",
          checkedInAt: DOOR_USED_AT,
          alreadyCheckedIn: true,
        });
      case "WAKE2345":
        return envelope("check_in_not_today", LATER_SAID, 409, {
          validOn: DOOR_LATER_ON,
        });
      case "MYNE2345":
        return envelope("own_code", SAID.ownCode, 409);
      case "FAST2345":
        return envelope("rate_limited", SAID.tooMany, 429);
      case "BRKE2345":
        return HttpResponse.json(
          {
            error: {
              code: "internal_error",
              message: "Something went wrong on our side.",
              requestId: rid(),
            },
          },
          { status: 500, headers: mockHeaders(rid()) },
        );
      default:
        return envelope("not_found", SAID.noCode, 404);
    }
  }),
];
