import { http, HttpResponse } from "msw";

/**
 * Adding a way in (yuvoy-app#229, yuvoy-api#304, MD-110): `POST
 * /me/sign-in/verify` WITH a session as the bearer, which links the number or
 * address to that account instead of signing in. Without a bearer this
 * handler steps aside and the sign-in's own (in `booking-handlers.ts`)
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
 *   a code other than 123456                          `401 unauthorized`
 *   anything else                                     `201 { linked: true }`
 *
 * What was linked is kept per session (the `Authorization` header), and
 * `GET /me` names it from then on (`linkedWaysFor`), so two e2e projects
 * signed in as different numbers never see each other's.
 */

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8099/v1";
const url = (p: string) => `${BASE}${p}`;

const CODE = "123456";
export const TAKEN_NUMBER = "+919811100409";
export const SHUT_NUMBER = "+919811100503";

const linked = new Map<string, { email?: string; phone?: string }>();

/** The ways this session has added, for `GET /me`. */
export function linkedWaysFor(auth: string | null): {
  email?: string;
  phone?: string;
} {
  return (auth && linked.get(auth)) || {};
}

let seq = 0;
function refuse(code: string, message: string, status: number): Response {
  const requestId = `01JWAYS${(++seq).toString(36).toUpperCase().padStart(5, "0")}`;
  return HttpResponse.json(
    { error: { code, message, requestId } },
    { status, headers: { "X-Request-Id": requestId } },
  );
}

export const waysInHandlers = [
  http.post(url("/me/sign-in/verify"), async ({ request }) => {
    const auth = request.headers.get("authorization");
    // No session: a sign-in, which booking-handlers answers.
    if (!auth) return undefined;

    if (!/^Bearer sess_\S+$/.test(auth)) {
      return refuse("unauthorized", "Sign in again to add a way in.", 401);
    }
    const body = (await request.json()) as {
      phone?: string;
      email?: string;
      code?: string;
    };
    const phone = body.phone?.trim() ?? "";
    const email = body.email?.trim().toLowerCase() ?? "";
    if (!phone && !email) {
      return refuse("invalid_input", "That is not a phone number.", 400);
    }

    if (email.startsWith("shut") || phone === SHUT_NUMBER) {
      return refuse(
        "sign_in_unavailable",
        "Signing in this way is not open yet. Sign in with your WhatsApp number.",
        503,
      );
    }
    if (body.code?.trim() !== CODE) {
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
