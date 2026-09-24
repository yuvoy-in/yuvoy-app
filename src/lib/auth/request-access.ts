import { cache } from "react";
import {
  INVITE_ONLY,
  accessOfStanding,
  standingOfAccount,
  type Access,
} from "@/lib/site/access";
import { readSessionCookie } from "./session-cookie";
import { callUpstream } from "./upstream";

/**
 * What a gated page shows THIS request, decided on the server
 * (yuvoy-api#195).
 *
 * The feed, search, saves and checkout decide here rather than in the browser
 * for one reason: neither a crawler nor a signed-out visitor may receive the
 * gated content in the HTML. A client-side gate would ship the page and then
 * hide it, which is a gate in name only.
 *
 * ## One call per render
 *
 * Wrapped in React's `cache()`, which lasts one server request: however many
 * components of a page ask, `GET /me` is made once.
 *
 * ## What it costs with the switch off: nothing
 *
 * `INVITE_ONLY` is inlined at build time, so with the switch off this returns
 * `open` before touching the cookie jar. That matters beyond one request: a
 * cookie read is what makes Next render a page per request, and `/saved` is
 * static today and has to stay so.
 *
 * ## Failing open
 *
 * No cookie is `signed-out`, with no call: the absence says it all. A cookie
 * the API refuses (`401`) is `signed-out` too; the cookie itself is cleared by
 * the next proxied call, since a Server Component cannot set one. ANY other
 * failure, a network error, a 5xx, a timeout, opens the page. Browsing is a
 * posture, and a traveller on a jetty should not be locked out of the feed
 * because the API had a slow second; the one thing that must be refused, a
 * booking, is refused by the API itself.
 */

export interface RequestAccess {
  access: Access;
  /**
   * The signed-in number, when `GET /me` said. The code screen names it
   * ("Signed in as +91 ... 3210"), because admission belongs to the number
   * and somebody signed in with the wrong one needs to see that.
   */
  phone: string | null;
}

/**
 * How long a page waits for `GET /me` before opening anyway.
 *
 * This call sits in front of the HTML, on the server-to-API hop, which is
 * normally tens of milliseconds. Three seconds is the point at which waiting
 * longer costs a traveller more than showing them the page would.
 */
export const ACCESS_TIMEOUT_MS = 3_000;

async function readAccess(scenario?: string): Promise<RequestAccess> {
  if (!INVITE_ONLY) return { access: "open", phone: null };

  const token = await readSessionCookie();
  if (!token) return { access: "signed-out", phone: null };

  try {
    const answer = await callUpstream({
      method: "GET",
      path: "/me",
      token,
      scenario,
      signal: AbortSignal.timeout(ACCESS_TIMEOUT_MS),
    });
    if (answer.status === 401) return { access: "signed-out", phone: null };
    if (answer.status < 200 || answer.status >= 300) {
      return { access: "open", phone: null };
    }
    return {
      access: accessOfStanding(standingOfAccount(answer.body)),
      phone: phoneOf(answer.body),
    };
  } catch (cause) {
    /*
      Logged, because the page stays a 200 either way and the only place the
      cause is visible is the function log (the same reasoning as the feed's
      prefetch in app/page.tsx).
    */
    console.error(
      "[access] GET /me failed while deciding a gated page; opening it.",
      cause,
    );
    return { access: "open", phone: null };
  }
}

function phoneOf(body: unknown): string | null {
  if (typeof body !== "object" || body === null) return null;
  const phone = (body as { phone?: unknown }).phone;
  return typeof phone === "string" && phone ? phone : null;
}

/** See the file comment. One `GET /me` per request, however many ask. */
export const accessForRequest = cache(readAccess);
