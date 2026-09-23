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
 * T4 — date-first discovery.
 *
 * No server prefetch, and that is the fix rather than a regression. The
 * default state used to be "the unfiltered results", fetched on the server for
 * the LCP's sake — but the contract says an empty `q` returns nothing, so
 * against the real API that prefetch was an empty list, and the mock that
 * answered "everything" was the only reason it looked like a screen. The
 * default state is now a prompt, which paints instantly and costs no request;
 * the first result card is the LCP only once somebody has asked for one.
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
    content: () => <SearchScreen />,
  });
}
