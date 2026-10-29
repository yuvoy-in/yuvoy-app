import { http, HttpResponse } from "msw";
import { server } from "../../mocks/server";
import { PLAN_IDS, openPlanView } from "../../mocks/plan-fixtures";

/**
 * What the plan guest route tests share (yuvoy-mobile#373): a request as the
 * guest page sends one, and a stand-in for one by-link API route that keeps
 * what it was sent, so a test can say exactly which headers and body reached
 * the API, and that nothing did.
 *
 * The session cookie is `next/headers`, which needs a request scope only a
 * running server has, so each test file stands in for it with `vi.mock`, as
 * `app/api/session/route.test.ts` does. The guest key cookie needs no stand-in:
 * the handlers read it off the request's own `Cookie` header and set it on
 * the answer, both of which a plain `Request` and `NextResponse` carry.
 */

export const API =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8099/v1";
export const APP = "https://app.yuvoy.in";

export const TOKEN = `yp_${"T".repeat(40)}a-_`;
export const SERIES = PLAN_IDS.series;
export const OTHER_SERIES = "0c0c0c0c-1d1d-4e4e-8f8f-202020202020";
export const KEY = `ypk_${"K".repeat(40)}b-_`;
export const OTHER_KEY = `ypk_${"O".repeat(40)}c-_`;

export const KEY_COOKIE = `ypk_${SERIES}`;
export const OTHER_KEY_COOKIE = `ypk_${OTHER_SERIES}`;

/** A cookie header holding these guest keys, by series. */
export function keys(held: Record<string, string>): string {
  return Object.entries(held)
    .map(([series, key]) => `ypk_${series}=${key}`)
    .join("; ");
}

/**
 * A POST to `/p/api/<route>` as this site's own page sends it: same-origin,
 * JSON. `headers` adds or replaces, and `omit` takes a default away, so each
 * refusal can be built by changing exactly one thing.
 */
export function guestRequest(
  route: string,
  body: unknown,
  options: {
    headers?: Record<string, string>;
    omit?: string[];
    cookie?: string;
    url?: string;
  } = {},
): Request {
  const headers: Record<string, string> = {
    "sec-fetch-site": "same-origin",
    "sec-fetch-mode": "cors",
    "content-type": "application/json",
    ...(options.cookie ? { cookie: options.cookie } : {}),
    ...options.headers,
  };
  for (const name of options.omit ?? []) delete headers[name];
  return new Request(options.url ?? `${APP}/p/api/${route}`, {
    method: "POST",
    headers,
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

export interface SeenCall {
  method: string;
  path: string;
  headers: Headers;
  body: string;
}

/**
 * Stands in for every by-link route of the API at once, answering with
 * `answer`, and keeps each call it was sent. One stand-in for all of them, so
 * a test that expects no call at all catches a call to any route.
 */
export function watchApi(
  answer: (call: SeenCall) => Response | Promise<Response> = () =>
    HttpResponse.json(openPlanView("visitor")),
): SeenCall[] {
  const seen: SeenCall[] = [];
  server.use(
    http.all(`${API}/plans/by-token/*`, async ({ request }) => {
      const call: SeenCall = {
        method: request.method,
        path: new URL(request.url).pathname,
        headers: request.headers,
        body: await request.text(),
      };
      seen.push(call);
      return answer(call);
    }),
  );
  return seen;
}

/** The API's error envelope, as it writes one. */
export function apiError(
  status: number,
  code: string,
  details?: Record<string, unknown>,
): Response {
  return HttpResponse.json(
    {
      error: {
        code,
        message: "From the API.",
        ...(details ? { details } : {}),
        requestId: "01JAPIREQUEST",
      },
    },
    { status, headers: { "x-request-id": "01JAPIREQUEST" } },
  );
}
