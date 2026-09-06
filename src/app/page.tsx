import type { Metadata } from "next";
import { createApiClient } from "@/lib/api/client";
import { pageMetadata } from "@/lib/site/metadata";
import { Feed } from "@/components/feed/feed";
import { REELS_LIMIT, type ReelsPage } from "@/lib/feed/use-reels";

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
 * The first page is fetched on the SERVER and handed to the client as initial
 * data, so the first cards are in the HTML.
 *
 * That is a performance decision with a measured reason. When the whole feed
 * was client-rendered, FCP was 0.8s and LCP was 5.1s on a throttled mid-range
 * profile — because the LCP element is a feed card's headline, and nothing
 * existed until the bundle downloaded, hydrated, started the mock worker and
 * resolved a query. The shell painting fast is worthless when the shell is
 * empty.
 *
 * Everything past the first page stays client-side: it is scroll-driven and
 * there is nothing for a crawler in it.
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
    twenty characters, and "Yuvoy — Experience More." spent all of them on a
    tagline the description below already carries — into the share card, where
    there is room for it, and out of the tab, where there is not.

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

async function getFirstPage(): Promise<Prefetched> {
  try {
    const api = createApiClient();
    const { data, error } = await api.GET("/reels", {
      params: { query: { limit: REELS_LIMIT } },
    });
    if (error) throw error;
    return { page: data, fetchedAt: Date.now() };
  } catch {
    // A feed that cannot be prefetched still renders — the client refetches
    // and shows its own loading and error states. Failing the page here would
    // turn a slow API into a broken one.
    return { page: null, fetchedAt: 0 };
  }
}

export default async function FeedPage() {
  const { page, fetchedAt } = await getFirstPage();
  return <Feed initialPage={page} initialFetchedAt={fetchedAt} />;
}
