import type { Metadata } from "next";
import { SearchScreen } from "@/components/search/search-screen";
import { pageMetadata } from "@/lib/site/metadata";

export const metadata: Metadata = pageMetadata({
  title: "Search",
  description:
    "What is on in the Andamans, by the day. Only departures an operator can actually sell.",
  path: "/search",
});

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
 */
export const dynamic = "force-dynamic";

export default function SearchPage() {
  return <SearchScreen />;
}
