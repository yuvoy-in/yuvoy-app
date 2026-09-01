import type { Metadata } from "next";
import { createApiClient } from "@/lib/api/client";
import { SearchScreen } from "@/components/search/search-screen";
import { pageMetadata } from "@/lib/site/metadata";
import type { components } from "@/lib/api/schema.gen";

type ExperiencePage = components["schemas"]["ExperiencePage"];

export const metadata: Metadata = pageMetadata({
  title: "Search",
  description:
    "What is on in the Andamans, by the day. Only departures an operator can actually sell.",
  path: "/search",
});

/**
 * T4 — date-first discovery.
 *
 * The unfiltered results are fetched on the SERVER and handed to the client as
 * initial data, so the first cards are in the HTML. Same decision, same
 * measurement as the feed (see app/page.tsx): the screen was scoring 82 with
 * an LCP of 5.0s against a 3.2s budget, because the LCP element is a result
 * card and nothing existed until the bundle downloaded, hydrated, started the
 * mock worker and resolved a query.
 *
 * Filtering stays entirely client-side. Every filtered query is a new query
 * key, so it fetches for itself and the prefetch is used only for the one
 * state it actually describes.
 */
/*
  Rendered per request, not statically generated. Two reasons.

  The catalogue is live: what is bookable changes as operators load inventory,
  and a page baked at build time shows the previous deploy's catalogue.

  And this screen reads the wall clock during render — the day pills are
  "today" and the nine days after it, in Asia/Kolkata. Statically generated,
  that clock read happens at BUILD time, so the HTML shipped on 1 September
  still says "Today" over 1 September in October, until hydration quietly
  rewrites it. It was in fact being prerendered: `/search` was listed in the
  build's prerender manifest before this change.
*/
export const dynamic = "force-dynamic";

interface Prefetched {
  page: ExperiencePage | null;
  /** When this actually came back. Stamped inside the async work rather than
   *  during render — a clock read in a render path is impure and the React
   *  compiler refuses it, server component or not. */
  fetchedAt: number;
}

/** The default view: no query, no day filter. Exactly what the screen renders
 *  before anybody touches a control. */
async function getDefaultResults(): Promise<Prefetched> {
  try {
    const api = createApiClient();
    const { data, error } = await api.GET("/search", {});
    if (error) throw error;
    return { page: data, fetchedAt: Date.now() };
  } catch {
    // A search that cannot be prefetched still renders — the client fetches
    // and shows its own loading and error states. Failing the page here would
    // turn a slow API into a broken one.
    return { page: null, fetchedAt: 0 };
  }
}

export default async function SearchPage() {
  const { page, fetchedAt } = await getDefaultResults();
  return <SearchScreen initialResults={page} initialFetchedAt={fetchedAt} />;
}
