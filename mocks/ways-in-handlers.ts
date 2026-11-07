import { http, HttpResponse } from "msw";

/**
 * Adding a way in (yuvoy-app#229, yuvoy-api#304, MD-110): `POST
 * /me/sign-in/verify` WITH a session as the bearer, which links the number or
 * address to that account instead of signing in. Without a bearer this
 * handler steps aside and the sign-in's own (in `booking-handlers-auth.ts`)
 * answers.
 *
 * The words are the API's, byte for byte (`linkIdentity` and the door's
 * `signInUnavailable` in yuvoy-api `internal/handler/traveller.go`).
 *
 * No scenario reaches this: `/api/session/link` is called without one, as
 * `/api/session` is. So the answer is chosen by what is being added:
 *
 *   an address starting "taken", or TAKEN_NUMBER    `409 identity_taken`
 *   an address starting "kind", or a second of a kind `409 identity_kind_taken`
 *   an address starting "stale"                      `401 fresh_sign_in_required`
 *   an address starting "shut", or SHUT_NUMBER       `503 sign_in_unavailable`
 *   no code, no number or address, or a number
 *   that is not E.164                                 `400 invalid_input`
 *   a number and an address together                  `400 invalid_input`
 *   an address that does not look like one             `400 invalid_input`
 *   a code other than 123456                          `401 unauthorized`
 *   anything else                                     `201 { linked: true }`
 *
 * What was linked is kept per session (the `Authorization` header), and
 * `GET /me` names it from then on (`linkedWaysFor`), so two e2e projects
 * signed in as different numbers never see each other's. Unit tests clear
 * it with `__resetWaysInMocks`; the e2e spec signs in with a number of its
 * own run, so a mock server kept from a run before holds nothing for it.
 *
 * Not modelled: what an account held before this mock saw it. The
 * `email-door` account's `GET /me` names asha@example.com, but nothing is
 * kept for it here, so a second email on it answers 201 where the API
 * answers `409 identity_kind_taken`. The unit tests cover that answer.
 */

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8099/v1";
const url = (p: string) => `${BASE}${p}`;

const CODE = "123456";
export const TAKEN_NUMBER = "+919811100409";
export const SHUT_NUMBER = "+919811100503";

const E164 = /^\+[1-9][0-9]{7,14}$/;
const NEED = "we need your number and the code we sent";

const linked = new Map<string, { email?: string; phone?: string }>();

export function __resetWaysInMocks() {
  linked.clear();
}

/** The ways this session has added, for `GET /me`. */
export function linkedWaysFor(auth: string | null): {
  email?: string;
  phone?: string;
} {
  return (auth && linked.get(auth)) || {};
}

let seq = 0;
function refuse(
  code: string,
  message: string,
  status: number,
  details?: Record<string, string>,
): Response {
  const requestId = `01JWAYS${(++seq).toString(36).toUpperCase().padStart(5, "0")}`;
  return HttpResponse.json(
    { error: { code, message, details, requestId } },
    { status, headers: { "X-Request-Id": requestId } },
  );
}

export const waysInHandlers = [
  http.post(url("/me/sign-in/verify"), async ({ request }) => {
    const auth = request.headers.get("authorization");
    // No session: a sign-in, which booking-handlers answers.
    if (!auth) return undefined;

    // In the API's order (SignInVerify, yuvoy-api master): with a session the
    // email door is checked first, before the body is read, for a number as
    // much as an address; then the body's 400s; then the session and the code.
    let body: Record<string, unknown> | null = null;
    try {
      body = (await request.json()) as Record<string, unknown> | null;
    } catch {
      body = null;
    }
    const text = (v: unknown) => (typeof v === "string" ? v.trim() : "");
    const phone = text(body?.phone);
    const email = text(body?.email).toLowerCase();
    const code = text(body?.code);

    if (email.startsWith("shut") || phone === SHUT_NUMBER) {
      return refuse(
        "sign_in_unavailable",
        "Signing in this way is not open yet. Sign in with your WhatsApp number.",
        503,
      );
    }
    if (!body || !code || (!phone && !email)) {
      return refuse("invalid_input", NEED, 400);
    }
    if (phone && email) {
      return refuse(
        "invalid_input",
        "send your number or your email, not both",
        400,
      );
    }
    if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      return refuse(
        "invalid_input",
        "that email address does not look right",
        400,
        { email: "Enter an email address, like name@example.com." },
      );
    }
    if (!email && !E164.test(phone)) {
      return refuse("invalid_input", NEED, 400);
    }
    if (!/^Bearer sess_\S+$/.test(auth)) {
      return refuse("unauthorized", "Sign in again to add a way in.", 401);
    }
    if (code !== CODE) {
      return refuse(
        "unauthorized",
        "That code did not work. Ask for a new one.",
        401,
      );
    }
    if (email.startsWith("stale")) {
      return refuse(
        "fresh_sign_in_required",
        "Sign in again, then add this.",
        401,
      );
    }
    if (email.startsWith("taken") || phone === TAKEN_NUMBER) {
      return refuse(
        "identity_taken",
        "That already signs in to another account. Sign in with it there instead.",
        409,
      );
    }
    const ways = linked.get(auth) ?? {};
    if (
      email.startsWith("kind") ||
      (email && ways.email) ||
      (phone && ways.phone)
    ) {
      return refuse(
        "identity_kind_taken",
        "This account already has one. An account holds one number and one email.",
        409,
      );
    }

    linked.set(auth, email ? { ...ways, email } : { ...ways, phone });
    return HttpResponse.json({ linked: true }, { status: 201 });
  }),
];
