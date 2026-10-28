import { createApiClient, serverScenarioHeaders } from "@/lib/api/client";
import { YuvoyError } from "@/lib/api/errors";
import { visitorAddressHeaders } from "@/lib/auth/upstream";
import { FIRST_PAGE_TIMEOUT_MS } from "@/lib/feed/first-page";
import {
  FOUND_PAGE_SIZE,
  type Category,
  type FoundItemList,
} from "./found-words";

/**
 * Page one of a place's found feed, fetched by the server render of `/`
 * (yuvoy-app#179, R2-T4), so the first cards are in the HTML.
 *
 * The feed's own pattern (`lib/feed/first-page.ts`), with three differences,
 * each because `GET /events` is not `GET /reels`:
 *
 *   - **The session goes with it.** "A place shows when the `explore` release
 *     stage and the place's audience include the caller", so a staff number
 *     sees a place still at the staff stage and a visitor does not. Without
 *     the token the server would ask as nobody and a staff tester would read
 *     a 404 for the place they just picked. The token is the `yv_session`
 *     cookie's value, read by the page; it goes to the API in
 *     `Authorization` and nowhere else.
 *   - **The visitor's address goes with it** (`visitorAddressHeaders`), so the
 *     API's per-IP limit counts the person and not Vercel. Every call this
 *     server makes for somebody carries it.
 *   - **It is never cached**: "never cached: the answer depends on who asks".
 *
 * And the answer is three-way rather than "a page or nothing", because the
 * caller does different things with each: a 404 means the place is not one
 * this caller may see (unknown, bookable, closed, or `explore` off), and `/`
 * then shows the bookable feed with the gone line, as an ANSWER says the place
 * is gone (decision 2 of the note). Anything else, the three seconds included,
 * is a failure, and a failure never says a place is gone: the feed shows its
 * error with a retry.
 */
export type FirstFoundPage =
  | { kind: "ok"; page: FoundItemList }
  /** 404: the caller may not see this place. */
  | { kind: "gone" }
  /** Anything else, including the 3 s limit. */
  | { kind: "error" };

export async function firstFoundPage(args: {
  /** `<market>/<destination>`, as the place list names it. */
  destinationKey: string;
  /** From `?category=`, already checked against the generated `Category`. */
  category: Category | null;
  /** The `yv_session` value when a cookie exists. */
  token: string | null;
  /** The incoming request's headers, for `visitorAddressHeaders`. */
  headers: Headers;
  /**
   * The page's own `?__scenario=`, honoured in a mocked build only, so the
   * found scenarios reach this server-side call the way the reels' do.
   */
  scenario?: string;
}): Promise<FirstFoundPage> {
  try {
    const api = createApiClient();
    const { data, error } = await api.GET("/events", {
      params: {
        query: {
          destinationKey: args.destinationKey,
          limit: FOUND_PAGE_SIZE,
          // Omitted rather than sent empty: "" is a value, and not a Category.
          ...(args.category ? { category: args.category } : {}),
        },
      },
      headers: {
        ...(args.token ? { Authorization: `Bearer ${args.token}` } : {}),
        ...visitorAddressHeaders(args.headers),
        ...serverScenarioHeaders(args.scenario),
      },
      cache: "no-store",
      signal: AbortSignal.timeout(FIRST_PAGE_TIMEOUT_MS),
    });
    if (error) throw error;
    return { kind: "ok", page: data };
  } catch (cause) {
    if (cause instanceof YuvoyError && cause.status === 404) {
      // An answer, not a failure: nothing to log.
      return { kind: "gone" };
    }
    /*
      Logged for the reason the reels' first page gives: the page stays a 200
      with the feed's own error and retry, and the function log is the only
      place the cause is visible. The place key is not personal; the token is
      never in `cause`, which is the API's envelope or a network error.
    */
    console.error(
      `[found] server-side GET /events for ${args.destinationKey} failed; ` +
        "the feed shows its error and a retry.",
      cause,
    );
    return { kind: "error" };
  }
}
