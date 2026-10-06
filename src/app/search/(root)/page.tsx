/*
  This page sits in a `(root)` route group to SCOPE the loading boundary beside
  it, and for no other reason.

  `/search` is a stop on the bar and wants a fallback so its tap paints in the
  first frame. `/search/r/[id]` is a reel — the same full-bleed media ground as
  the feed — and streaming that ground reliably breaks hydration in WebKit
  (React #418, see `components/states/route-skeletons.tsx` for the measurement).
  A boundary at `app/search/` would have covered both.

  A route group is not part of the URL, so `/search` is unchanged and
  `loading.tsx` in here covers this page alone. `loading.test.ts` pins it.
*/
import type { Metadata } from "next";
import { SearchScreen } from "@/components/search/search-screen";
import { gatedRoute } from "@/components/auth/gated-route";
import { pageMetadata } from "@/lib/site/metadata";
import { gatedRobots } from "@/lib/site/indexing";
import { preconnectApi } from "@/lib/site/preconnect";
import { firstReelsPage } from "@/lib/feed/first-page";
import {
  filtersFromParams,
  reelFilterKey,
  reelQuery,
} from "@/lib/search/filters";

export const metadata: Metadata = {
  ...pageMetadata({
    title: "Search",
    description:
      "What is on in the Andamans, by the day. Only departures an operator can actually sell.",
    path: "/search",
  }),
  /*
    OUT OF THE INDEX WHILE THE INVITE GATE IS ON (yuvoy-api#195).

    A crawler is a signed-out visitor, so with the gate on this route serves
    it the invite landing: a page whose only content is "sign in". Indexing
    that would put a gate in a search result under the word Search.

    Nothing at all with the gate off, so the page inherits the app-wide policy
    exactly as it always did. `gatedRobots` and `SITEMAP_FIXED_ROUTES` read
    one list, so this tag and the sitemap cannot disagree.
  */
  ...gatedRobots("/search"),
};

/**
 * T4: date-first discovery.
 *
 * ## The first page of results comes with the HTML
 *
 * Fetched here for the filters in the address, and handed to the screen as its
 * first page (production readiness, 6 Oct 2026). The grid used to be fetched
 * only once the page had hydrated, so its first tile, the LCP, waited for the
 * whole bundle and then a round trip from the island: 4.2s on a throttled
 * profile against production, the slowest first paint in the app.
 *
 * An earlier server prefetch was removed for a reason that no longer holds:
 * it ran `/experiences` with an empty `q`, which the contract answers with
 * nothing. Opening Search has since become the unfiltered reel grid
 * (yuvoy-app#37 item 9), and `GET /reels` with no filters is the rotation the
 * feed shows, so the server's page is the same one the browser would ask for.
 *
 * ## It is dynamic for the CLOCK, not for the data, and it stays that way
 *
 * This route looks statically renderable — it awaits nothing and returns one
 * client component — and it is not. The day pills are "today" and the nine
 * days after it in Asia/Kolkata, read during render, so a prerender bakes the
 * build date into the HTML and serves it for the life of the deploy until
 * hydration quietly rewrites it. That shipped once already, past a green build
 * and a green suite, which is why `check-prerender.mjs` now pins this route as
 * one that MUST be dynamic and fails the build if it is ever prerendered.
 *
 * Making the Search tap instant therefore goes through `loading.tsx`, not
 * through a static conversion: a dynamic route with a loading boundary is
 * partially prefetched and paints its fallback in the first frame. Removing
 * this line to chase a faster tab would trade a real wrong date for it.
 */
export const dynamic = "force-dynamic";

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  // Behind the invite gate when it is on (yuvoy-api#195). See gatedRoute.
  return gatedRoute({
    purpose: "search",
    searchParams,
    content: async () => {
      // The vocabulary and every later page are read from the browser.
      preconnectApi();
      const query = await searchParams;
      const filters = filtersFromParams(asSearchParams(query));
      const raw = query.__scenario;
      const first = await firstReelsPage({
        screen: "search",
        filters: reelQuery(filters),
        scenario: typeof raw === "string" ? raw : undefined,
      });
      return (
        <SearchScreen initial={{ ...first, key: reelFilterKey(filters) }} />
      );
    },
  });
}

/** The page's query, as the `URLSearchParams` the screen reads its filters from. */
function asSearchParams(
  query: Record<string, string | string[] | undefined>,
): URLSearchParams {
  const params = new URLSearchParams();
  for (const [name, value] of Object.entries(query)) {
    for (const one of Array.isArray(value) ? value : [value]) {
      if (one !== undefined) params.append(name, one);
    }
  }
  return params;
}
