import { fetchWithin } from "@/lib/api/deadline";
import { BROWSER_READ_STALL_MS, WRITE_STALL_MS } from "@/lib/api/client";
import type { components } from "@/lib/api/schema.gen";

/**
 * What the guest page sends to its own route handlers, `/p/api/<route>`
 * (yuvoy-mobile#373), and the one function that sends it.
 *
 * Its own module, with no server import, because the page is a client
 * component: the handlers' helper (`guest-route.ts`) reaches `next/headers`
 * and `node:net`, and a client graph that reaches either fails to build
 * (`scripts/qa.mjs` rule 7, which follows `import type` as well).
 *
 * ## Why every call is a POST with the token in the body
 *
 * The link token is the plan's front door. A path or a query lands in the
 * platform's request log, the browser's history and any error report's URL;
 * a JSON body lands in none of them. So even the read is a POST, and nothing
 * about the plan or the reply ever goes into a URL. The handlers refuse
 * anything that is not a same-origin `application/json` POST.
 *
 * ## `seriesId`, and why the page sends it
 *
 * The guest key lives in an httpOnly cookie named after the plan's series
 * (`ypk_<seriesId>`), and the server cannot tell which series a token belongs
 * to without asking the API. The page can: `seriesId` is in every `PlanView`
 * it reads. So once it has one, it sends that id back on every call, and the
 * handler picks the matching cookie. It is not a secret and choosing a wrong
 * one only reads the plan as a visitor would. A first load has none, and the
 * view handler works it out (see `app/p/api/view/route.ts`).
 */

type PlanReply = components["schemas"]["PlanReply"];
type PlanReport = components["schemas"]["PlanReport"];

export type GuestRoute = "view" | "reply" | "leave" | "link" | "report";

export interface GuestCallBody {
  /** The link token from `location.hash`, already checked with `isGuestToken`. */
  token: string;
  /** `PlanView.seriesId` once the page has read the plan. */
  seriesId?: string;
}

export interface GuestReplyBody extends GuestCallBody {
  /**
   * The form's first-reply nonce (`newReplyNonce`), sent as `Idempotency-Key`.
   * Made once per form and kept across every send of it.
   */
  nonce?: string;
  /** The whole reply, as `replyByLink` takes it: complete sets, as ever. */
  reply: PlanReply;
}

export interface GuestReportBody extends GuestCallBody {
  report: PlanReport;
}

export interface GuestBodies {
  view: GuestCallBody;
  reply: GuestReplyBody;
  leave: GuestCallBody;
  link: GuestCallBody;
  report: GuestReportBody;
}

/**
 * The handler's answer as it came: the API's status and body, a `PlanView`
 * (never with `guestKey`), the API's error envelope, or nothing for a `204`
 * or `202`. `body` is `undefined` when there was none or it was not JSON.
 */
export interface GuestAnswer {
  status: number;
  body: unknown;
}

/**
 * Calls one guest route. Throws only when no answer arrived at all: a
 * `NetworkError`-like failure or `StalledError` from `fetchWithin`, which the
 * page shows as "check your connection", keeping what was typed.
 */
export async function callGuestRoute<R extends GuestRoute>(
  route: R,
  body: GuestBodies[R],
  signal?: AbortSignal,
): Promise<GuestAnswer> {
  const response = await fetchWithin(
    `/p/api/${route}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        ...scenarioHeaders(),
      },
      body: JSON.stringify(body),
      credentials: "same-origin",
      cache: "no-store",
      signal,
    },
    route === "view" ? BROWSER_READ_STALL_MS : WRITE_STALL_MS,
  );
  const text = await response.text();
  let parsed: unknown = undefined;
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      // Not JSON: the status is all there is to go on.
    }
  }
  return { status: response.status, body: parsed };
}

/**
 * The page's `?__scenario=`, carried to the handler so it reaches the mocks.
 * The same switch `lib/api/client.ts` carries on every API call, and like it,
 * compiled out of any build that does not enable mocking.
 */
function scenarioHeaders(): Record<string, string> {
  if (process.env.NEXT_PUBLIC_API_MOCKING !== "enabled") return {};
  if (typeof window === "undefined") return {};
  const scenario = new URLSearchParams(window.location.search).get(
    "__scenario",
  );
  return scenario ? { "x-yuvoy-scenario": scenario } : {};
}
