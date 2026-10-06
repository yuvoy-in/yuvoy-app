import { createApiClient, serverScenarioHeaders } from "@/lib/api/client";
import { REELS_PAGE_SIZE, type ReelsPage } from "./reels";
import type { paths } from "@/lib/api/schema.gen";

type ReelsQuery = NonNullable<paths["/reels"]["get"]["parameters"]["query"]>;

/**
 * How long a server render waits for its first page of reels before it renders
 * without one (production readiness, 6 Oct 2026).
 *
 * Giving up costs one round trip, never the screen: the browser asks for the
 * same page the moment it is up, and shows its own loading state while it
 * does. Waiting longer costs a blank screen on every visit while the API is
 * having a bad minute, which is what an unbounded wait did. Three seconds is
 * the invite gate's figure for the same trade (`ACCESS_TIMEOUT_MS`), and this
 * hop is normally tens of milliseconds.
 */
export const FIRST_PAGE_TIMEOUT_MS = 3_000;

export interface FirstPage {
  page: ReelsPage | null;
  /**
   * When it actually came back, or 0 when it did not. Stamped here, inside the
   * async work, rather than during render: a clock read in a render path is
   * impure and the React compiler refuses it, server component or not.
   */
  fetchedAt: number;
}

/**
 * The first page of `GET /reels`, fetched by a server render so the first
 * cards are in the HTML: the feed's, or a search's for the filters in the
 * address. It carries no cursor, which is what makes it page one; every page
 * after it is fetched in the browser.
 */
export async function firstReelsPage(options: {
  /** Names the screen in the log: "feed", "search". */
  screen: string;
  /** A search's filters, as `reelQuery` writes them. */
  filters?: Omit<ReelsQuery, "limit" | "cursor">;
  /** The page's own `?__scenario=`, honoured in a mocked build only. */
  scenario?: string;
}): Promise<FirstPage> {
  try {
    const api = createApiClient();
    const { data, error } = await api.GET("/reels", {
      params: { query: { limit: REELS_PAGE_SIZE, ...options.filters } },
      /*
        The `?__scenario=` switch, carried from the PAGE's query into this
        server-side call. Empty in any build without mocking.

        Without it the server seeds `initialData` with a healthy feed, the
        client never refetches, and every failure state this app has is
        unreachable from a URL, which is how a failure state becomes untestable
        and then unbuilt.
      */
      headers: serverScenarioHeaders(options.scenario),
      signal: AbortSignal.timeout(FIRST_PAGE_TIMEOUT_MS),
    });
    if (error) throw error;
    return { page: data, fetchedAt: Date.now() };
  } catch (cause) {
    /*
      A screen that cannot be prefetched still renders: the client fetches and
      shows its own loading and error states. Failing the page here would turn
      a slow API into a broken one.

      But swallowing it silently was not right either. The page stays a 200,
      every heading, canonical and structured-data check passes, and the only
      symptom is LCP (5.1s against an FCP of 0.8s when the feed was last
      measured without it), which nobody sees without a lab report against
      production. So it is logged: on Vercel this reaches the function log,
      the only place the CAUSE is visible. `e2e/audit.spec.ts` fails the
      deploy on the symptom; this names the reason.
    */
    console.error(
      `[${options.screen}] server-side prefetch of GET /reels failed; the ` +
        "browser will fetch it instead and LCP will suffer.",
      cause,
    );
    return { page: null, fetchedAt: 0 };
  }
}
