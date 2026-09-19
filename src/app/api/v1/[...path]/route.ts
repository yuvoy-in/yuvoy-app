import { NextResponse } from "next/server";
import {
  readSessionCookie,
  clearSessionCookie,
  touchSessionCookie,
} from "@/lib/auth/session-cookie";
import { allowedProxyPath } from "@/lib/auth/proxied-paths";
import { callUpstream, sessionExpiryOf } from "@/lib/auth/upstream";

/**
 * The traveller's authenticated calls, made by this app's own server
 * (yuvoy-app#57 item 3).
 *
 * The browser calls `/api/v1/me/bookings`; this reads the HttpOnly cookie,
 * signs the call, and hands the API's answer back untouched. No browser code
 * holds a session token any more, which is the whole point: script cannot read
 * the cookie, so script cannot lift the session.
 *
 * The path mirrors the contract's exactly, so `/api/v1/<x>` is `<x>` in
 * `contracts/openapi.yaml` and a reader never has to hold a mapping in their
 * head. yuvoy-app#57 suggested `/api/me/...`; the set to cover spans four path
 * families (`/me`, `/me/invited-trips`, `/bookings/invites`, `/reservations`),
 * so a name from one of them would have been wrong for the other three.
 *
 * ## Three refusals, and each is load-bearing
 *
 *   - **Not on the allowlist: 404.** Not 403. The proxy attaches a credential,
 *     so an unlisted path must look like nothing rather than like a door that
 *     exists and is shut. See `proxied-paths.ts`.
 *   - **No cookie: 401**, without calling the API. There is nothing to sign
 *     with, and asking the API to say so is a round trip to learn what is
 *     already known.
 *   - **API answers 401: clear the cookie, pass the 401 on.** The session is
 *     finished, from here or from another device. Keeping the cookie would
 *     make every later call fail the same way and never recover.
 *
 * ## Rolling fourteen days
 *
 * Every successful proxied call re-sets the cookie. The contract is explicit
 * that a session extends on use and that `GET /me` answers the current end in
 * `session.expiresAt`, so a `GET /me` answer sets the cookie from that value
 * and every other call falls back to a flat fourteen days. Keeping a stored
 * expiry in step with the server's, rather than with the value sign-in
 * returned, is the API document's own instruction.
 */

export const dynamic = "force-dynamic";

async function proxy(
  request: Request,
  context: { params: Promise<{ path: string[] }> },
): Promise<NextResponse> {
  const { path: segments } = await context.params;
  const path = `/${(segments ?? []).join("/")}`;
  const method = request.method.toUpperCase();

  if (!allowedProxyPath(method, path)) {
    return NextResponse.json(
      { error: { code: "not_found", message: "No such route." } },
      { status: 404 },
    );
  }

  const token = await readSessionCookie();
  if (!token) {
    return NextResponse.json(
      { error: { code: "unauthorized", message: "Sign in first." } },
      { status: 401 },
    );
  }

  let body: unknown = undefined;
  if (method !== "GET" && method !== "DELETE") {
    const raw = await request.text();
    if (raw) {
      try {
        body = JSON.parse(raw);
      } catch {
        return NextResponse.json(
          {
            error: { code: "invalid_input", message: "Expected a JSON body." },
          },
          { status: 400 },
        );
      }
    }
  }

  const answer = await callUpstream({
    method,
    path,
    search: new URL(request.url).search,
    token,
    body,
    from: request,
    signal: request.signal,
  });

  if (answer.status === 401) {
    await clearSessionCookie(request);
  } else if (answer.status >= 200 && answer.status < 300) {
    await touchSessionCookie(request, sessionExpiryOf(answer.body));
  }

  const headers = new Headers();
  /*
    The request id is carried on. It is what `describeError` shows, small and
    grey, and it is the difference between finding somebody's exact request in
    the logs and guessing. Dropping it at the proxy would put a blank where
    every error screen expects one.
  */
  if (answer.requestId) headers.set("x-request-id", answer.requestId);
  /*
    And the replay marker. A retry with the same `Idempotency-Key` answers
    `201` with the stored response, "so a client that retried after a dropped
    connection cannot tell its request was a repeat" — except by this header.
    Swallowing it here left the browser unable to make that distinction at all
    on a signed-in checkout (yuvoy-app#75).
  */
  if (answer.idempotentReplay) headers.set("Idempotent-Replay", "true");

  if (answer.status === 204 || !answer.text) {
    return new NextResponse(null, { status: answer.status, headers });
  }
  if (answer.body !== undefined) {
    return NextResponse.json(answer.body, { status: answer.status, headers });
  }
  headers.set("Content-Type", "text/plain");
  return new NextResponse(answer.text, { status: answer.status, headers });
}

export const GET = proxy;
export const POST = proxy;
export const PATCH = proxy;
export const DELETE = proxy;
