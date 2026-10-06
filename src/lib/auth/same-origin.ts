import { NextResponse } from "next/server";

/**
 * Refuses a request to this app's own session and proxy routes that this
 * app's own pages did not send (production readiness, 6 Oct 2026).
 *
 * The session cookie is SameSite=Lax, and until this file Lax was the only
 * thing standing between another page and these routes. It is not enough:
 *
 *   - Login CSRF. `POST /api/session` and `/api/session/adopt` SET the cookie
 *     rather than read it, so Lax has nothing to withhold. Both parsed any
 *     body as JSON whatever it was declared as, so a page on another site
 *     could auto-submit a `<form enctype="text/plain">` whose body reads as
 *     `{"sessionToken": "<the attacker's>"}`, and the answer to that
 *     top-level navigation could set the cookie. The visitor would then book,
 *     message and save inside the attacker's account, where the attacker
 *     reads all of it.
 *   - Same-site is not same-origin. Every `*.yuvoy.in` host counts as the
 *     same site, so the cookie rides on a no-cors POST from any of them, and
 *     a script on any sibling could write through the proxy as the traveller.
 *
 * Two independent checks, either of which stops both:
 *
 *   1. A body must be declared JSON. A form can send only three content
 *      types, and a no-cors fetch only the same three; `application/json`
 *      from another origin needs a CORS preflight, which nothing here answers.
 *   2. Fetch Metadata, falling back to Origin. A write's `Sec-Fetch-Site` must
 *      be `same-origin` where the browser sends one (every current engine);
 *      where it does not, an `Origin` that is present must be this host.
 *
 * And a document load of these routes is refused whatever its method: nothing
 * in the app navigates to one, and a navigation is how a link on another site
 * gets the Lax cookie attached to a GET, whose JSON the service worker's page
 * cache would then keep on the device.
 */
export function foreignRequest(request: Request): NextResponse | null {
  const headers = request.headers;

  if (headers.get("sec-fetch-mode") === "navigate") return refuse();

  const method = request.method.toUpperCase();
  if (method === "GET" || method === "HEAD") return null;

  const site = headers.get("sec-fetch-site");
  if (site !== null) {
    if (site !== "same-origin") return refuse();
  } else {
    const origin = headers.get("origin");
    if (origin !== null && !isOwnOrigin(origin, request)) return refuse();
  }

  if (carriesBody(request) && !declaresJson(headers.get("content-type"))) {
    return NextResponse.json(
      { error: { code: "invalid_input", message: "Expected a JSON body." } },
      { status: 415 },
    );
  }
  return null;
}

/**
 * Whether a request has a body, read from its headers so that checking does
 * not consume it. A browser sends a length with any body it can measure, and
 * `Transfer-Encoding` with one it streams.
 */
function carriesBody(request: Request): boolean {
  if (request.headers.has("transfer-encoding")) return true;
  return Number(request.headers.get("content-length") ?? 0) > 0;
}

/** `application/json`, with or without parameters such as a charset. */
export function declaresJson(contentType: string | null): boolean {
  if (!contentType) return false;
  return contentType.split(";")[0].trim().toLowerCase() === "application/json";
}

/**
 * Whether an `Origin` header names the host this request was sent to.
 *
 * Every name the platform gives that host is accepted: Vercel sets `Host` and
 * `X-Forwarded-Host` to the public domain, and a browser cannot forge either
 * on a cross-origin request.
 */
function isOwnOrigin(origin: string, request: Request): boolean {
  let host: string;
  try {
    host = new URL(origin).host;
  } catch {
    // "null" and anything else that is not an origin.
    return false;
  }
  const own = [
    request.headers.get("x-forwarded-host"),
    request.headers.get("host"),
    new URL(request.url).host,
  ];
  return own.includes(host);
}

function refuse(): NextResponse {
  return NextResponse.json(
    {
      error: {
        code: "invalid_input",
        message: "This request did not come from this site.",
      },
    },
    { status: 403 },
  );
}

/**
 * A route handler that answers only this app's own pages, and whose every
 * answer is `private, no-store`.
 *
 * These routes carry a traveller's own data, or set and clear their session,
 * so neither the browser's disk cache nor a shared cache may keep an answer.
 * Without a header of our own the platform sends `public, max-age=0`.
 */
export function sameOriginOnly<Rest extends unknown[]>(
  handler: (request: Request, ...rest: Rest) => Promise<Response>,
): (request: Request, ...rest: Rest) => Promise<Response> {
  return async (request, ...rest) => {
    const response =
      foreignRequest(request) ?? (await handler(request, ...rest));
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  };
}
