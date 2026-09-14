import { NextResponse } from "next/server";
import {
  readSessionCookie,
  writeSessionCookie,
  clearSessionCookie,
  touchSessionCookie,
} from "@/lib/auth/session-cookie";
import { callUpstream, sessionExpiryOf } from "@/lib/auth/upstream";

/**
 * The session's whole life: sign in, ask, sign out (yuvoy-app#57).
 *
 * The token never reaches the browser on any of these. `POST` mints it and
 * puts it straight into an HttpOnly cookie; `GET` answers a boolean; `DELETE`
 * ends it. Nothing here returns a `sessionToken`, and that is the invariant
 * the whole change rests on.
 *
 * Not statically analysable as such, so it is asserted:
 * `session-routes.test.ts` reads this file and fails if `sessionToken`
 * appears in anything that is handed to `NextResponse.json`.
 */

/*
  Route handlers that read cookies are dynamic anyway, but saying so keeps a
  future build from trying to cache an answer that is per-traveller by
  definition.
*/
export const dynamic = "force-dynamic";

/**
 * Sign in. `{ phone, code }` in, `{ signedIn: true }` and a cookie out.
 *
 * The API's status and error body are passed through UNCHANGED. The sign-in
 * form branches on `error.code` and renders a different sentence and a
 * different field for each; re-encoding the envelope here would mean the
 * form's copy is only as good as this route's translation of it.
 */
export async function POST(request: Request) {
  let input: { phone?: unknown; code?: unknown };
  try {
    input = await request.json();
  } catch {
    return NextResponse.json(
      { error: { code: "invalid_input", message: "Expected a JSON body." } },
      { status: 400 },
    );
  }

  const phone = typeof input.phone === "string" ? input.phone.trim() : "";
  const code = typeof input.code === "string" ? input.code.trim() : "";
  if (!phone || !code) {
    return NextResponse.json(
      {
        error: {
          code: "invalid_input",
          message: "A number and a code are both needed.",
        },
      },
      { status: 400 },
    );
  }

  const answer = await callUpstream({
    method: "POST",
    path: "/me/sign-in/verify",
    body: { phone, code },
    from: request,
  });

  if (answer.status < 200 || answer.status >= 300) {
    return passthrough(answer);
  }

  const token =
    typeof answer.body === "object" && answer.body !== null
      ? (answer.body as { sessionToken?: unknown }).sessionToken
      : undefined;
  const expiresAt =
    typeof answer.body === "object" && answer.body !== null
      ? (answer.body as { expiresAt?: unknown }).expiresAt
      : undefined;

  if (typeof token !== "string" || !token) {
    /*
      A 2xx with no token. The contract requires one, so this is the API
      breaking its own promise rather than the traveller doing anything wrong,
      and saying "that code did not work" would send them to re-enter a code
      that was correct.
    */
    return NextResponse.json(
      {
        error: {
          code: "internal_error",
          message: "Signing in did not complete. Try again in a moment.",
        },
      },
      { status: 502 },
    );
  }

  await writeSessionCookie(
    request,
    token,
    typeof expiresAt === "string" ? expiresAt : null,
  );
  return NextResponse.json({ signedIn: true });
}

/**
 * Is this device signed in?
 *
 * No cookie means no, with no call to the API: a signed-out traveller is the
 * common case on every page load, and asking the API to confirm what the
 * absence of a cookie already says would put a round trip in front of the feed
 * for everybody.
 *
 * With a cookie, it asks `GET /me`, because a cookie is not proof: the session
 * can be revoked from another device. A `401` clears the cookie so the next
 * load takes the fast path above rather than asking again forever.
 */
export async function GET(request: Request) {
  const token = await readSessionCookie();
  if (!token) return NextResponse.json({ signedIn: false });

  const answer = await callUpstream({
    method: "GET",
    path: "/me",
    token,
    from: request,
  });

  if (answer.status === 401) {
    await clearSessionCookie(request);
    return NextResponse.json({ signedIn: false });
  }

  /*
    Anything else that is not a success, including a 503 while the booking
    store is unwired, leaves the cookie alone and reports signed in. The
    session has not ended; the API is having a moment. Signing somebody out
    over a transient fault is the more expensive mistake, and the screens
    behind this each render their own failure state.
  */
  if (answer.status < 200 || answer.status >= 300) {
    return NextResponse.json({ signedIn: true });
  }

  await touchSessionCookie(request, sessionExpiryOf(answer.body));
  return NextResponse.json({ signedIn: true });
}

/**
 * Sign out.
 *
 * Tells the API first, then forgets locally, and never lets the API's answer
 * decide whether the device forgets. `DELETE /me/session` answers 204 whatever
 * the token was, so a failure here means the network rather than the session.
 * A traveller who taps sign out on a jetty with no signal must still be signed
 * out on the phone in front of them.
 */
export async function DELETE(request: Request) {
  const token = await readSessionCookie();
  if (token) {
    try {
      await callUpstream({
        method: "DELETE",
        path: "/me/session",
        token,
        from: request,
      });
    } catch {
      // Deliberately ignored. See above.
    }
  }
  await clearSessionCookie(request);
  return new NextResponse(null, { status: 204 });
}

/** The API's answer, as it came, so a form's own error copy still works. */
function passthrough(answer: {
  status: number;
  body: unknown;
  text: string;
}): NextResponse {
  if (answer.body !== undefined) {
    return NextResponse.json(answer.body, { status: answer.status });
  }
  return new NextResponse(answer.text || null, {
    status: answer.status,
    headers: answer.text ? { "Content-Type": "text/plain" } : undefined,
  });
}
