import type { Metadata } from "next";
import { SearchReelScreen } from "@/components/search/search-reel-screen";
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
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <SearchReelScreen mediaId={id} />;
}
