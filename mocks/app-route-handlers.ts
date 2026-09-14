import { http, HttpResponse, passthrough } from "msw";

/**
 * Mocks for THIS APP'S OWN route handlers, not for the API (yuvoy-app#57).
 *
 * ## Why they exist at all
 *
 * `/api/session` and `/api/v1/...` are Next route handlers. They run on a Next
 * server, and vitest has none: a component that calls `/api/session` under
 * jsdom reaches nothing, and `onUnhandledRequest: "error"` turns that into a
 * failure in every screen test.
 *
 * ## Why they are NOT in the shared handler list
 *
 * They are registered in `server.ts` only, so they exist under vitest and are
 * absent from the browser worker. That is deliberate. In `pnpm dev` and in
 * e2e the REAL route handlers must run, cookie and all, because the cookie
 * mechanics are the thing #57 changed and a mock of them would prove nothing.
 * MSW inside the Next server never sees these either: nothing on the server
 * fetches the server's own routes.
 *
 * ## The rule they are held to
 *
 * A mock must never be kinder than the thing it stands for. Two consequences:
 *
 *   - **`/api/v1/*` forwards rather than answers.** It rewrites the path onto
 *     the API base and lets the real contract-shaped handlers reply, so the
 *     status, the envelope and the shape are the API's own. It is a genuine
 *     pass-through, not a second implementation that can drift.
 *   - **`/api/session` keeps a flag where the route keeps a cookie.** jsdom
 *     and MSW do not round-trip `Set-Cookie` reliably, so the flag stands in
 *     for it. Everything else, including calling the API's real verify handler
 *     and passing its error envelope through untouched, is what the route
 *     does.
 *
 * The cookie's own behaviour (HttpOnly, Secure, SameSite, the rolling
 * fourteen days) is asserted in `e2e/session-cookie.spec.ts`, against the real
 * server. Nothing here can stand in for that.
 */

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8099/v1";

/**
 * The signed-in flag, standing in for the HttpOnly cookie.
 *
 * Module state, so `__resetAppRouteMocks()` has to be called between tests or
 * one test's sign-in becomes the next one's starting state. Wired into
 * `vitest.setup.ts` beside the other resets.
 */
let sessionToken: string | null = null;

export function __resetAppRouteMocks(): void {
  sessionToken = null;
}

/** Lets a test start signed in without driving the whole sign-in form. */
export function __signInAppRouteMock(token = "sess_919000000000"): void {
  sessionToken = token;
}

/** Anything under the app's own origin. jsdom serves tests from localhost. */
const appRoute = (path: string) => `*${path}`;

export const appRouteHandlers = [
  /* ------------------------------------------------------------- session */

  http.get(appRoute("/api/session"), async () => {
    if (!sessionToken) return HttpResponse.json({ signedIn: false });

    // The route proves the cookie against `GET /me` rather than trusting it.
    const check = await fetch(`${API_BASE}/me`, {
      headers: { Authorization: `Bearer ${sessionToken}` },
    });
    if (check.status === 401) {
      sessionToken = null;
      return HttpResponse.json({ signedIn: false });
    }
    return HttpResponse.json({ signedIn: true });
  }),

  http.post(appRoute("/api/session"), async ({ request }) => {
    const body = (await request.json()) as { phone?: string; code?: string };

    const answer = await fetch(`${API_BASE}/me/sign-in/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: body?.phone, code: body?.code }),
    });

    if (!answer.ok) {
      /*
        The envelope, exactly as the API wrote it. The sign-in form branches on
        `error.code` for every sentence it shows, so a re-encoded failure here
        would make the test pass against copy the real route cannot produce.
      */
      const text = await answer.text();
      return new HttpResponse(text, {
        status: answer.status,
        headers: { "Content-Type": "application/json" },
      });
    }

    const session = (await answer.json()) as { sessionToken?: string };
    if (!session?.sessionToken) {
      return HttpResponse.json(
        {
          error: {
            code: "internal_error",
            message: "Signing in did not complete. Try again in a moment.",
          },
        },
        { status: 502 },
      );
    }

    sessionToken = session.sessionToken;
    // Never the token. That is the invariant the whole change rests on.
    return HttpResponse.json({ signedIn: true });
  }),

  http.delete(appRoute("/api/session"), async () => {
    if (sessionToken) {
      try {
        await fetch(`${API_BASE}/me/session`, {
          method: "DELETE",
          headers: { Authorization: `Bearer ${sessionToken}` },
        });
      } catch {
        // The route ignores this too: the device forgets either way.
      }
    }
    sessionToken = null;
    return new HttpResponse(null, { status: 204 });
  }),

  http.post(appRoute("/api/session/adopt"), async ({ request }) => {
    const body = (await request.json()) as { sessionToken?: string };
    const candidate = body?.sessionToken;
    if (!candidate)
      return HttpResponse.json({ adopted: false }, { status: 400 });

    const check = await fetch(`${API_BASE}/me`, {
      headers: { Authorization: `Bearer ${candidate}` },
    });
    if (!check.ok) return HttpResponse.json({ adopted: false });

    sessionToken = candidate;
    return HttpResponse.json({ adopted: true });
  }),

  /* --------------------------------------------------------------- proxy */

  /**
   * Forwards to the API with the session attached, exactly as the route does.
   *
   * Not an answer of its own. Whatever `/api/v1/me/bookings` gets here is what
   * `GET /me/bookings` gives, envelope and status included, so a screen test
   * cannot pass against a shape the contract does not have.
   */
  http.all(appRoute("/api/v1/*"), async ({ request }) => {
    const url = new URL(request.url);
    const path = url.pathname.replace(/^\/api\/v1/, "");

    /*
      A request that is not for this app's own origin is somebody else's.
      Without this, the `*` prefix would also swallow a same-shaped path on the
      API base and the forward below would loop.
    */
    if (url.origin === API_BASE.replace(/\/v1$/, "")) return passthrough();

    if (!sessionToken) {
      return HttpResponse.json(
        { error: { code: "unauthorized", message: "Sign in first." } },
        { status: 401 },
      );
    }

    const forwarded = await fetch(`${API_BASE}${path}${url.search}`, {
      method: request.method,
      headers: {
        Authorization: `Bearer ${sessionToken}`,
        ...(request.headers.get("content-type")
          ? { "Content-Type": request.headers.get("content-type")! }
          : {}),
      },
      body:
        request.method === "GET" || request.method === "DELETE"
          ? undefined
          : await request.text(),
    });

    if (forwarded.status === 401) sessionToken = null;

    const text = await forwarded.text();
    return new HttpResponse(text || null, {
      status: forwarded.status,
      headers: forwarded.headers.get("content-type")
        ? { "Content-Type": forwarded.headers.get("content-type")! }
        : undefined,
    });
  }),
];
