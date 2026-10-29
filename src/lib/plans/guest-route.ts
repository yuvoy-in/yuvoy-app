import { NextResponse } from "next/server";
import { declaresJson, isOwnOrigin } from "@/lib/auth/same-origin";
import {
  callUpstream,
  unreachable,
  type UpstreamResult,
} from "@/lib/auth/upstream";
import {
  clearSessionCookie,
  isSecureRequest,
  readSessionCookie,
  touchSessionCookie,
} from "@/lib/auth/session-cookie";
import { StalledError } from "@/lib/api/deadline";
import { isGuestKey, isGuestToken } from "./guest-token";

/**
 * What the five plan guest routes under `/p/api/` share (yuvoy-mobile#373).
 *
 * A friend opens `/p/#<token>` from a WhatsApp link and reads, answers,
 * changes or removes a reply, links it to an account, or reports the plan.
 * The page talks to these routes and never to the API, for two reasons that
 * each decide the design on their own:
 *
 *   - **The guest key must never reach page script.** A first reply answers
 *     `201` with `guestKey`, and whoever holds that key IS the guest on that
 *     plan. The API says in the contract that a web client keeps it on the
 *     server. So the handler takes it out of the answer, keeps it in an
 *     httpOnly cookie, and sends it as `X-Yuvoy-Plan-Key` from then on. An
 *     injected script can read anything the page can, and the page cannot
 *     read this.
 *   - **The API counts guests per address.** Called from here, every guest
 *     would be Vercel's address and share one limit, so each call carries the
 *     visitor's own (`visitorAddressHeaders`, by way of `callUpstream`).
 *
 * ## The refusals, before anything is sent
 *
 *   - Not `Sec-Fetch-Site: same-origin`, or without that header an `Origin`
 *     that is not this host, or no `Origin` at all: **403**. Stricter than
 *     `lib/auth/same-origin`, which lets a request with neither header
 *     through: every browser that can run this page sends one of them on a
 *     POST, so a request with neither is not this page.
 *   - Not declared `application/json`: **403** as well. A form or a no-cors
 *     fetch from another site can only send three content types, and none of
 *     them is this one.
 *   - Not JSON, or not an object: **400** `invalid_input`.
 *   - A token of the wrong shape: **404** `not_found`, which is what the API
 *     answers for one, with no call: there is no plan to ask about.
 *
 * ## The token and the key stay out of every log and every answer
 *
 * The token is in the API path, because that is where the contract puts it,
 * and that is a call between two servers. It is never in this route's own
 * path or query, never in a log line (a failed call logs the route's name and
 * the kind of failure, never the error object, whose text could carry the
 * URL), and never in an answer. Every JSON answer loses `guestKey` and `link`
 * (the planner's own copy of the link) before it goes out, and a last check
 * refuses to send one that still holds either secret.
 */

type Json = Record<string, unknown>;

/** 90 days from the last visit (yuvoy-mobile#373, decider T2-Q3). */
export const GUEST_KEY_MAX_AGE = 90 * 24 * 60 * 60;

/** The guest routes and the page sit under it, and nothing else does. */
export const GUEST_KEY_PATH = "/p/";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Any guest key, anywhere in a serialised answer. */
const ANY_GUEST_KEY = /ypk_[A-Za-z0-9_-]{43}/;

/**
 * `ypk_<seriesId>`: one cookie per weekly series, so next week's plan, which
 * keeps its series and its members, still knows this phone's reply.
 */
export function guestKeyCookie(seriesId: string): string {
  return `ypk_${seriesId.toLowerCase()}`;
}

/** A guest key this browser holds, and the series it was kept for. */
export interface HeldKey {
  seriesId: string;
  key: string;
}

/** One guest call, once every refusal above has passed. */
export interface GuestCall {
  request: Request;
  token: string;
  /** `PlanView.seriesId` as the page sent it back, when it has one and it is a uuid. */
  seriesId: string | null;
  body: Json;
  /** The traveller's session, when signed in. Read, never required, except to link. */
  session: string | null;
  /** Every guest key cookie this browser sent, of the right shape. */
  held: HeldKey[];
}

/** `callUpstream` threw: the API went quiet, or could not be reached. */
class Unreached extends Error {
  constructor(readonly reason: unknown) {
    super("The API did not answer.");
  }
}

/**
 * Wraps one guest route: the refusals, the body, the session, and
 * `private, no-store` on every answer, since each one is somebody's view of a
 * private plan.
 */
export function guestRoute(
  where: string,
  handler: (call: GuestCall) => Promise<NextResponse>,
): (request: Request) => Promise<NextResponse> {
  return async (request) => {
    const response = foreignCall(request) ?? (await serve(request));
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  };

  async function serve(request: Request): Promise<NextResponse> {
    const call = await readCall(request);
    if (call instanceof NextResponse) return call;

    let response: NextResponse;
    try {
      response = await handler(call);
    } catch (cause) {
      if (!(cause instanceof Unreached)) throw cause;
      return quiet(where, cause.reason, request);
    }

    /*
      The session, as the signed-in proxy treats it: a call the API took
      extends it, and the one route that requires it clears it on a 401,
      since keeping a finished session would fail every later call the same
      way. The by-link routes read an expired session as nobody rather than
      answering 401, so only link-account can get here with one.
    */
    if (call.session) {
      if (response.status === 401) await clearSessionCookie(request);
      else if (response.status >= 200 && response.status < 300) {
        await touchSessionCookie(request);
      }
    }
    return response;
  }
}

/** 403 for anything this site's own page did not send. See the header. */
export function foreignCall(request: Request): NextResponse | null {
  const headers = request.headers;
  if (headers.get("sec-fetch-mode") === "navigate") return notFromHere();

  const site = headers.get("sec-fetch-site");
  if (site !== null) {
    if (site !== "same-origin") return notFromHere();
  } else {
    const origin = headers.get("origin");
    if (origin === null || !isOwnOrigin(origin, request)) return notFromHere();
  }

  if (!declaresJson(headers.get("content-type"))) return notFromHere();
  return null;
}

function notFromHere(): NextResponse {
  return refusal(403, "invalid_input", "This request did not come from this site.");
}

/** The API's envelope, for an answer this server gives itself. */
export function refusal(
  status: number,
  code: string,
  message: string,
  details?: Json,
): NextResponse {
  return NextResponse.json(
    { error: { code, message, ...(details ? { details } : {}) } },
    { status },
  );
}

/** The API's words for a link that leads nowhere, so the page reads one 404. */
export function linkNotWorking(): NextResponse {
  return refusal(404, "not_found", "This plan link is not working.");
}

function isJson(value: unknown): value is Json {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function readCall(request: Request): Promise<GuestCall | NextResponse> {
  let body: unknown;
  try {
    body = JSON.parse(await request.text());
  } catch {
    body = undefined;
  }
  if (!isJson(body)) {
    return refusal(400, "invalid_input", "Expected a JSON body.");
  }
  if (!isGuestToken(body.token)) return linkNotWorking();

  const hint = body.seriesId;
  return {
    request,
    token: body.token,
    seriesId:
      typeof hint === "string" && UUID.test(hint) ? hint.toLowerCase() : null,
    body,
    session: await readSessionCookie(),
    held: heldKeys(request),
  };
}

/**
 * The guest keys in the request's cookies, read off the header rather than
 * `next/headers`, so a route can be tested with a plain `Request`. A cookie
 * whose name is not `ypk_<uuid>`, or whose value is not a key, is not one of
 * ours and is left alone.
 */
function heldKeys(request: Request): HeldKey[] {
  const held: HeldKey[] = [];
  for (const pair of (request.headers.get("cookie") ?? "").split(";")) {
    const at = pair.indexOf("=");
    if (at < 0) continue;
    const name = pair.slice(0, at).trim();
    const value = pair.slice(at + 1).trim();
    if (!name.startsWith("ypk_")) continue;
    const seriesId = name.slice(4).toLowerCase();
    if (!UUID.test(seriesId) || !isGuestKey(value)) continue;
    if (held.some((h) => h.seriesId === seriesId)) continue;
    held.push({ seriesId, key: value });
  }
  return held;
}

/** The key kept for one series, if this browser holds one. */
export function heldFor(call: GuestCall, seriesId: string): HeldKey | null {
  return call.held.find((h) => h.seriesId === seriesId) ?? null;
}

/**
 * The key a write sends: the one for the series the page named, and only
 * that one when it named one. With no series named, the only key this
 * browser holds, if it holds exactly one: sending a key from another plan is
 * harmless (the API finds nobody on this plan by it and reads the caller as a
 * visitor), and it is what lets a removed guest's report from the 404 page,
 * which never learned the series, still say who sent it.
 */
export function keyFor(call: GuestCall): HeldKey | null {
  if (call.seriesId !== null) return heldFor(call, call.seriesId);
  return call.held.length === 1 ? call.held[0] : null;
}

/**
 * One call to a by-link route of the API: `/plans/by-token/<token><rest>`,
 * with the key, the nonce and the session when there are any, and the
 * visitor's address. `from` is deliberately not passed: it would forward any
 * `Idempotency-Key` the page put in its own headers, and the nonce comes from
 * the body, checked, or not at all.
 */
export async function sendToPlan(
  call: GuestCall,
  options: {
    method: "GET" | "PUT" | "DELETE" | "POST";
    rest?: "" | "/reply" | "/link-account" | "/reports";
    key?: HeldKey | null;
    body?: unknown;
    nonce?: string;
  },
): Promise<UpstreamResult> {
  const headers: Record<string, string> = {};
  if (options.key) headers["X-Yuvoy-Plan-Key"] = options.key.key;
  if (options.nonce) headers["Idempotency-Key"] = options.nonce;
  try {
    return await callUpstream({
      method: options.method,
      path: `/plans/by-token/${call.token}${options.rest ?? ""}`,
      token: call.session,
      body: options.body,
      headers,
      visitor: call.request.headers,
      scenario: call.request.headers.get("x-yuvoy-scenario") ?? undefined,
      signal: call.request.signal,
    });
  } catch (cause) {
    throw new Unreached(cause);
  }
}

/**
 * Who a plan answer says the reader is: the series it belongs to, the role,
 * and a `guestKey` if the API sent one. Null for anything but a plan.
 */
export function planIdentity(
  result: UpstreamResult,
): { seriesId: string; role: unknown; guestKey: unknown } | null {
  if (result.status < 200 || result.status >= 300) return null;
  const body = result.body;
  if (!isJson(body)) return null;
  const seriesId = body.seriesId;
  if (typeof seriesId !== "string" || !UUID.test(seriesId)) return null;
  return {
    seriesId: seriesId.toLowerCase(),
    role: body.role,
    guestKey: body.guestKey,
  };
}

/**
 * Whether the key that was sent is the one the API knew: the answer is the
 * plan of the series the key was kept for, and the reader is somebody on it
 * rather than a visitor. Only then is its cookie refreshed, so a key sent
 * to the wrong plan never gets that plan's cookie name.
 */
export function keyWasKnown(
  result: UpstreamResult,
  key: HeldKey | null,
): key is HeldKey {
  const plan = planIdentity(result);
  return (
    key !== null &&
    plan !== null &&
    plan.seriesId === key.seriesId &&
    plan.role !== "visitor"
  );
}

/** Keeps, or refreshes, a guest key: 90 days from now, httpOnly, under `/p/`. */
export function keepKey(
  response: NextResponse,
  request: Request,
  held: HeldKey,
): void {
  response.cookies.set(guestKeyCookie(held.seriesId), held.key, {
    httpOnly: true,
    secure: isSecureRequest(request),
    sameSite: "lax",
    path: GUEST_KEY_PATH,
    maxAge: GUEST_KEY_MAX_AGE,
  });
}

/** Forgets a guest key whose reply is gone. */
export function dropKey(
  response: NextResponse,
  request: Request,
  seriesId: string,
): void {
  response.cookies.set(guestKeyCookie(seriesId), "", {
    httpOnly: true,
    secure: isSecureRequest(request),
    sameSite: "lax",
    path: GUEST_KEY_PATH,
    maxAge: 0,
  });
}

/**
 * The API's answer, for the page: its status, its body less the two secrets,
 * its request id and replay marker. A `204` or a `202` goes out empty, an
 * error envelope exactly as the API wrote it, since the page branches on
 * `error.code` and `details`.
 */
export function planAnswer(call: GuestCall, result: UpstreamResult): NextResponse {
  const headers = new Headers();
  if (result.requestId) headers.set("x-request-id", result.requestId);
  if (result.idempotentReplay) headers.set("Idempotent-Replay", "true");

  if (result.status === 204 || result.status === 202 || !result.text) {
    return new NextResponse(null, { status: result.status, headers });
  }
  if (result.body === undefined) {
    // Not JSON: a gateway's page, never a plan. Passed on as text, as the
    // signed-in proxy does, so the status still means what it says.
    headers.set("Content-Type", "text/plain");
    return guarded(call, result.text, () =>
      new NextResponse(result.text, { status: result.status, headers }),
    );
  }

  let body = result.body;
  if (isJson(body)) {
    const rest = { ...body };
    delete rest.guestKey;
    delete rest.link;
    body = rest;
  }
  return guarded(call, JSON.stringify(body), () =>
    NextResponse.json(body, { status: result.status, headers }),
  );
}

/**
 * The last check: an answer that still carries a guest key or this call's
 * token is not sent. Nothing above can produce one today; this is what keeps
 * "never" true when the API grows a field.
 */
function guarded(
  call: GuestCall,
  text: string,
  send: () => NextResponse,
): NextResponse {
  if (!ANY_GUEST_KEY.test(text) && !text.includes(call.token)) return send();
  console.error(
    "[plan link] an answer from the API held a plan secret, so it was not passed on.",
  );
  return refusal(
    502,
    "internal_error",
    "We could not read Yuvoy's answer just now. Try again in a moment.",
  );
}

/**
 * This server's answer when the API did not give one: 504 for silence, 502
 * for no connection, as everywhere else in this app. What is logged is the
 * kind of failure only. The error itself is not passed on: a connection
 * error's text can name the URL it was for, and that URL holds the token.
 */
function quiet(where: string, reason: unknown, request: Request): NextResponse {
  const cause =
    reason instanceof StalledError
      ? reason
      : new Error(reason instanceof Error ? reason.name : "Unknown failure");
  return unreachable({ where: `[plan link] ${where}`, cause, request });
}
