import { NextResponse } from "next/server";
import { sameOriginOnly } from "@/lib/auth/same-origin";
import { readSessionCookie } from "@/lib/auth/session-cookie";
import {
  callUpstream,
  unreachable,
  type UpstreamResult,
} from "@/lib/auth/upstream";

/**
 * Adding a way in: a number or an email to the traveller signed in on this
 * browser (yuvoy-app#229, the web half of yuvoy-mobile#340; yuvoy-api#304,
 * owner decision MD-110).
 *
 * The API does it on `POST /me/sign-in/verify` with the session as
 * `Authorization: Bearer`, which this route sends from the HttpOnly cookie.
 * Verify stays off the `/api/v1` allowlist: without a bearer it MINTS a
 * session, so it only ever runs here or at `/api/session`.
 *
 * What comes back is `{ linked: true }` with `201`, or the API's error
 * envelope rebuilt from its `code`, `message` and `details`. Never the API's
 * body as it came, and never a token: a `2xx` that is not `{ linked: true }`
 * (a session minted because the bearer was dropped somewhere) is a `502`, and
 * the token in it goes nowhere. The cookie is not touched: a `401` here is as
 * often a wrong code as a stale session, and the screen says which.
 */

export const dynamic = "force-dynamic";

const SIGN_IN_AGAIN = "Sign in again to add a way in.";

function refusal(
  status: number,
  code: string,
  message: string,
  details?: Record<string, unknown>,
): NextResponse {
  return NextResponse.json(
    { error: { code, message, ...(details ? { details } : {}) } },
    { status },
  );
}

async function link(request: Request) {
  const token = await readSessionCookie();
  if (!token) return refusal(401, "unauthorized", SIGN_IN_AGAIN);

  let input: { phone?: unknown; email?: unknown; code?: unknown };
  try {
    input = await request.json();
  } catch {
    return refusal(400, "invalid_input", "Expected a JSON body.");
  }
  const phone = typeof input.phone === "string" ? input.phone.trim() : "";
  const email = typeof input.email === "string" ? input.email.trim() : "";
  const code = typeof input.code === "string" ? input.code.trim() : "";
  if ((!phone && !email) || (phone && email) || !code) {
    return refusal(
      400,
      "invalid_input",
      email
        ? "An email and a code are both needed."
        : "A number and a code are both needed.",
    );
  }

  let answer: UpstreamResult;
  try {
    answer = await callUpstream({
      method: "POST",
      path: "/me/sign-in/verify",
      token,
      body: { ...(email ? { email } : { phone }), code },
      from: request,
    });
  } catch (cause) {
    return unreachable({
      where: "[session/link] POST /me/sign-in/verify",
      cause,
      request,
      message: "That was not added. Try again in a moment.",
    });
  }

  const body =
    typeof answer.body === "object" && answer.body !== null
      ? (answer.body as Record<string, unknown>)
      : {};

  if (answer.status >= 200 && answer.status < 300) {
    if (answer.status === 201 && body.linked === true) {
      return NextResponse.json({ linked: true }, { status: 201 });
    }
    return refusal(
      502,
      "internal_error",
      "That was not added. Try again in a moment.",
    );
  }

  return envelope(answer.status, body.error);
}

/** The API's refusal, rebuilt from the three fields a screen reads. */
function envelope(status: number, error: unknown): NextResponse {
  const e =
    typeof error === "object" && error !== null
      ? (error as Record<string, unknown>)
      : {};
  const code = typeof e.code === "string" ? e.code : "unclassified_error";
  const message = typeof e.message === "string" ? e.message : "";
  const details =
    typeof e.details === "object" &&
    e.details !== null &&
    !Array.isArray(e.details)
      ? (e.details as Record<string, unknown>)
      : undefined;
  return refusal(status, code, message, details);
}

/* Only this app's own pages may add a way in; see lib/auth/same-origin. */
export const POST = sameOriginOnly(link);
