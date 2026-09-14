import type { Metadata } from "next";
import { createApiClient, serverScenarioHeaders } from "@/lib/api/client";
import { pageMetadata } from "@/lib/site/metadata";
import { Feed } from "@/components/feed/feed";
import { REELS_PAGE_SIZE, type ReelsPage } from "@/lib/feed/reels";

/**
 * T2 — the reels feed. The app's front door.
 *
 * Built on `GET /reels` — **every published reel**, not one per listing.
 * `/experiences` returns a single `heroMedia` per row, which capped the feed at
 * the number of listings rather than the amount of footage: two reels visible
 * against three published, with the third invisible since the day it went up
 * (yuvoy-app#18). `/experiences` is untouched and still right for a search or
 * a category listing; it simply is not the feed.
 *
 * The FIRST page is fetched on the SERVER and handed to the client as initial
 * data, so the first cards are in the HTML. It carries no cursor, which is
 * what makes it page one rather than an arbitrary page — everything after it
 * is fetched in the browser as the traveller scrolls (yuvoy-api#114).
 *
 * That is a performance decision with a measured reason. When the whole feed
 * was client-rendered, FCP was 0.8s and LCP was 5.1s on a throttled mid-range
 * profile — because the LCP element is a feed card's headline, and nothing
 * existed until the bundle downloaded, hydrated, started the mock worker and
 * resolved a query. The shell painting fast is worthless when the shell is
 * empty.
 *
 * Everything past the first page stays client-side: it is scroll-driven and
 * there is nothing for a crawler in it. That is also why the page is twelve
 * reels rather than sixty — this response is on the LCP path, and the 48 cards
 * a traveller has not scrolled to are ~48 KB of JSON in the HTML that buys
 * nothing. See `REELS_PAGE_SIZE`.
 */
/*
  Rendered per request, not statically generated.

  Two reasons, and the second is the one that decided it.

  The feed is the freshest surface in the product: it changes as operators put
  inventory on sale and as seats go. A page baked at build time and served for
  60 seconds is showing yesterday's catalogue to somebody standing on a jetty.

  And a build-time fetch is not reliable to begin with — Next generates static
  pages in worker processes that do not run `instrumentation.register()`, so
  the prefetch failed silently during `next build` and baked "Loading
  experiences" into the HTML. Discovering that in production, against a real
  API that happens to be reachable at build time, would have been worse: it
  would have worked until the one build where it did not.

  /e/[slug] stays static — that one IS the SEO asset and its content changes
  rarely.
*/
export const dynamic = "force-dynamic";

export const metadata: Metadata = pageMetadata({
  /*
    Just the name (owner's call, 6 Sep 2026). A tab shows roughly the first
    twenty characters, and the name-plus-tagline title spent all of them on a
    strapline the description below already carries — into the share card,
    where there is room for it, and out of the tab, where there is not. The
    tagline has since gone from the app altogether (yuvoy-app#36, 14 Sep).

    `absoluteTitle` is kept but is a no-op here, and that is worth writing down
    rather than leaving as a trap: Next applies a layout's `title.template` to
    CHILD segments only, and `app/page.tsx` shares a segment with
    `app/layout.tsx`, so the root page takes `title.default` and never the
    template. Verified by rendering it both ways — both give "Yuvoy". It stays
    because it costs nothing and states the intent for anyone moving this.
  */
  title: "Yuvoy",
  description:
    "Find something worth doing in the Andaman Islands, and book a seat on it. Real departures, filmed by the operators who run them.",
  path: "/",
  absoluteTitle: true,
});

interface Prefetched {
  page: ReelsPage | null;
  /** When this actually came back. Stamped here, inside the async work,
   *  rather than during render — a clock read in a render path is impure
   *  and the React compiler refuses it, server component or not. */
  fetchedAt: number;
}

async function getFirstPage(scenario?: string): Promise<Prefetched> {
  try {
    const api = createApiClient();
    const { data, error } = await api.GET("/reels", {
      params: { query: { limit: REELS_PAGE_SIZE } },
      /*
        The `?__scenario=` switch, carried from the PAGE's query into this
        server-side call. Empty in any build without mocking.

        Without it the server seeds `initialData` with a healthy feed, the
        client never refetches, and every failure state this app has is
        unreachable from a URL — which is how a failure state becomes
        untestable and then unbuilt.
      */
      headers: serverScenarioHeaders(scenario),
    });
    if (error) throw error;
    return { page: data, fetchedAt: Date.now() };
  } catch (cause) {
    /*
      A feed that cannot be prefetched still renders — the client refetches and
      shows its own loading and error states. Failing the page here would turn
      a slow API into a broken one, and that is still the right call.

      But swallowing it silently was not. The page stays a 200, every heading,
      canonical and structured-data check passes, and the only symptom is LCP
      — 5.1s against an FCP of 0.8s when this was last measured — which nobody
      sees without running a lab report against production.

      So it is logged. On Vercel this reaches the function log, which is the
      only place the CAUSE is visible: a reachability problem at request time
      looks identical from outside to a page that simply has no reels.
      `e2e/audit.spec.ts` fails the deploy on the symptom; this names the
      reason.
    */
    console.error(
      "[feed] server-side prefetch of GET /reels failed; the browser will " +
        "fetch it instead and LCP will suffer.",
      cause,
    );
    return { page: null, fetchedAt: 0 };
  }
}

export default async function FeedPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  const raw = query.__scenario;
  const scenario = typeof raw === "string" ? raw : undefined;

  const { page, fetchedAt } = await getFirstPage(scenario);
  return <Feed initialPage={page} initialFetchedAt={fetchedAt} />;
}
