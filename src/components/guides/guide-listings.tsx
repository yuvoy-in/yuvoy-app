"use client";

import { useQuery } from "@tanstack/react-query";
import { ListingCard } from "@/components/operator/listing-card";
import {
  guideListings,
  type GuideListingsFilter,
} from "@/lib/guides/matching-listings";
import { CACHE, qk } from "@/lib/query/policy";

/**
 * What a guide is about, running now (yuvoy-app#116 item 4).
 *
 * A guide ended with no way to the thing it explained, so the funnel only
 * went backwards. Found by the guide's own filter, the one Search uses, and
 * NOTHING at all until something matches: not while it loads, not when the
 * read fails, not when nothing is on sale. An empty heading is a promise, and
 * a skeleton at the foot of an article promises cards the reader may never
 * get.
 *
 * Nothing on the server either: the query only runs in the browser, so the
 * static page and the first client render agree on an empty foot.
 *
 * One visit of a shuffled order (`CACHE.reelVisit`): `GET /reels` answers in
 * a new order every time, so a refetch on focus would swap the cards while
 * somebody is reading them.
 */
export function GuideListings({ filter }: { filter: GuideListingsFilter }) {
  const {
    data: listings,
    isPending,
    isError,
  } = useQuery({
    queryKey: qk.guideListings(filter.category, filter.activityType),
    queryFn: ({ signal }) => guideListings(filter, signal),
    ...CACHE.reelVisit,
  });

  // Loading, failed, or nothing on sale: no foot at all. See above.
  if (isPending || isError || listings.length === 0) return null;

  return (
    <section
      aria-labelledby="guide-listings"
      className="border-paper-line mt-12 border-t pt-6"
    >
      <h2 id="guide-listings" className="label text-forest/75">
        On Yuvoy
      </h2>
      <ul className="mt-3 space-y-3">
        {listings.map((experience) => (
          <li key={experience.slug}>
            <ListingCard experience={experience} bookable />
          </li>
        ))}
      </ul>
    </section>
  );
}
