import { NextResponse } from "next/server";
import { writeSessionCookie } from "@/lib/auth/session-cookie";
import { callUpstream, sessionExpiryOf } from "@/lib/auth/upstream";

/**
 * Moves a traveller who was already signed in, once (yuvoy-app#57 item 8).
 *
 * Before this change the session token lived in IndexedDB. Deleting that code
 * without a bridge would sign out everybody who was signed in when it shipped,
 * for no reason they could see: their session is perfectly good, it is only
 * stored somewhere the app has stopped looking.
 *
 * So the browser hands the stored token over exactly once, this checks it is
 * real, and the cookie takes over. The IndexedDB record is then deleted by the
 * caller whatever the answer here was, because a token that does not
 * authenticate is not worth keeping and a token that does is now in the
 * cookie.
 *
 * ## Why it verifies rather than trusting
 *
 * The body of this request is attacker-controlled in the ordinary sense: it is
 * whatever the page sends. Setting an HttpOnly cookie from an unverified
 * string would let any script hand this route a token of its choosing and have
 * the server sign every subsequent proxied call with it. `GET /me` is the
 * cheapest proof that the token is a real session, and its answer carries the
 * true `session.expiresAt` to set the cookie's life from.
 *
 * A `401` sets nothing and says so plainly. That is not an error state on the
 * screen: it means a session that had already ended was sitting in storage,
 * and the honest outcome is the signed-out one.
 */

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let input: { sessionToken?: unknown };
  try {
    input = await request.json();
  } catch {
    return NextResponse.json({ adopted: false }, { status: 400 });
  }

  const token =
    typeof input.sessionToken === "string" ? input.sessionToken.trim() : "";
  /*
    A length ceiling, not validation. There is no format to check against: the
    contract calls it opaque. This only stops a multi-megabyte body being
    forwarded to the API on the word of a page.
  */
  if (!token || token.length > 512) {
    return NextResponse.json({ adopted: false }, { status: 400 });
  }

  const answer = await callUpstream({
    method: "GET",
    path: "/me",
    token,
    from: request,
  });

  if (answer.status < 200 || answer.status >= 300) {
    /*
      200 with `adopted: false`, not the API's status.

      The caller's next move is the same for every failure: delete the stored
      record and carry on signed out. Passing a 401 or a 503 through would
      make this look like a request the page should handle or retry, and it is
      neither. Nothing is wrong; there was simply nothing worth keeping.
    */
    return NextResponse.json({ adopted: false });
  }

  await writeSessionCookie(request, token, sessionExpiryOf(answer.body));
  return NextResponse.json({ adopted: true });
}
