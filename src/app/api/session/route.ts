import { NextResponse, after } from "next/server";
import { sameOriginOnly } from "@/lib/auth/same-origin";
import {
  readSessionCookie,
  readSessionToEnd,
  signOutOwed,
  writeSessionCookie,
  clearSessionCookie,
  touchSessionCookie,
} from "@/lib/auth/session-cookie";
import {
  callUpstream,
  sessionExpiryOf,
  unreachable,
  type UpstreamResult,
} from "@/lib/auth/upstream";

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
async function signIn(request: Request) {
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

  let answer: UpstreamResult;
  try {
    answer = await callUpstream({
      method: "POST",
      path: "/me/sign-in/verify",
      body: { phone, code },
      from: request,
    });
  } catch (cause) {
    return unreachable({
      where: "[session] POST /me/sign-in/verify",
      cause,
      request,
      message: "Signing in did not complete. Try again in a moment.",
    });
  }

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

  /*
    Signing in on a phone that signed out with no signal: the session that
    sign-out was for is still live at the API, and the cookie about to be
    written is the last trace of it, so the API is told it ended.
  */
  if (await signOutOwed()) {
    const ended = await readSessionToEnd();
    if (ended && ended !== token) tellTheApi(request, ended);
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
async function check(request: Request) {
  /*
    A sign-out made with no signal is finished by the first check that
    reaches this server, before the cookie it was for is believed. See
    `lib/auth/sign-out-owed.ts`.
  */
  if (await signOutOwed()) {
    await endSession(request);
    return NextResponse.json({ signedIn: false });
  }

  const token = await readSessionCookie();
  if (!token) return NextResponse.json({ signedIn: false });

  let answer: UpstreamResult;
  try {
    answer = await callUpstream({
      method: "GET",
      path: "/me",
      token,
      from: request,
    });
  } catch (cause) {
    /*
      Signed in, for the reason the next branch gives: an API that did not
      answer has not ended anybody's session.
    */
    if (!request.signal.aborted) {
      console.error(
        "[session] GET /me did not answer; still signed in.",
        cause,
      );
    }
    return NextResponse.json({ signedIn: true });
  }

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
 * Forgets on this device at once, tells the API straight after, and never lets
 * the API's answer decide whether the device forgets. `DELETE /me/session`
 * answers 204 whatever the token was, so a failure there means the network
 * rather than the session. A traveller who taps sign out on a jetty with no
 * signal must still be signed out on the phone in front of them.
 *
 * The API is told in `after`, once this answer has gone. The cleared cookie in
 * this answer is what signs the phone out, and it used to wait on the API: a
 * slow or silent API held it, and a browser that gave up first never received
 * it, so the phone stayed signed in (production readiness, 6 Oct 2026). The
 * token is read before the cookie is cleared, so the API is still told which
 * session ended.
 */
async function signOut(request: Request) {
  await endSession(request);
  return new NextResponse(null, { status: 204 });
}

/**
 * Ends this browser's session: the cookie, and any sign-out owed, are cleared
 * in this answer, and the API is told once it has gone.
 *
 * The token is read whatever is owed: a sign-out the server never heard is
 * still a session the API should be told about.
 */
async function endSession(request: Request): Promise<void> {
  const token = await readSessionToEnd();
  if (token) tellTheApi(request, token);
  await clearSessionCookie(request);
}

/** `DELETE /me/session`, after the answer has gone. */
function tellTheApi(request: Request, token: string): void {
  after(async () => {
    try {
      await callUpstream({
        method: "DELETE",
        path: "/me/session",
        token,
        from: request,
      });
    } catch (cause) {
      /*
        Logged, and otherwise ignored, as it always was: the session expires
        on its own, and the only copy of the token has left this phone.
      */
      console.error("[session] DELETE /me/session did not answer.", cause);
    }
  });
}

/*
  Only this app's own pages may sign in, check or sign out, and no answer is
  cached anywhere. See lib/auth/same-origin for the login forgery this closes.
*/
export const POST = sameOriginOnly(signIn);
export const GET = sameOriginOnly(check);
export const DELETE = sameOriginOnly(signOut);

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
