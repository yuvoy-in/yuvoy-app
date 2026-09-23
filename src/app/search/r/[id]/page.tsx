import type { Metadata } from "next";
import { SearchReelScreen } from "@/components/search/search-reel-screen";
import { gatedRoute } from "@/components/auth/gated-route";
import { pageMetadata } from "@/lib/site/metadata";
import { privateRobotsMeta } from "@/lib/site/indexing";

/**
 * A search result, playing — yuvoy-app#37.
 *
 * Entirely client-rendered, and that is the point rather than an omission: the
 * whole feature is that this shares the grid's query key, so the strip opens on
 * pages the grid already holds without a request. A server fetch here would
 * make the one navigation that must be instant the one that costs a round trip.
 *
 * Never indexed. Same two reasons as every reel address: it dies when the
 * listing pauses, and `/e/{slug}` is the indexable page about the same
 * experience. It carries a filter set as well, so no two are the same URL.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  ...pageMetadata({
    title: "A reel on Yuvoy",
    description: "Watch this, then book a seat on it. Andaman Islands.",
    path: "/search",
  }),
  robots: privateRobotsMeta,
};

export default async function SearchReelPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  /*
    Behind the invite gate when it is on (yuvoy-api#195): it is search, one
    tap in. The gate keeps a way back to search, which is where it leads.
  */
  return gatedRoute({
    purpose: "search",
    searchParams,
    back: { href: "/search", label: "search" },
    content: () => <SearchReelScreen mediaId={id} />,
  });
}
