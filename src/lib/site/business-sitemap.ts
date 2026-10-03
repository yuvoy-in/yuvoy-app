import type { MetadataRoute } from "next";
import type { components } from "@/lib/api/schema.gen";

type ExperienceSummary = components["schemas"]["ExperienceSummary"];

/**
 * A business's page in the sitemap, for every business with a listing on
 * sale (yuvoy-app#116 item 5).
 *
 * `GET /catalog/index` enumerates experiences, destinations and markets, and
 * no businesses, so the sitemap carried 15 URLs and not one of them was a
 * business. The businesses are read off the listings instead: every
 * `ExperienceSummary` names its operator's slug, and a business is worth a
 * sitemap entry exactly when it has something on sale. The API's owner asked
 * for this route rather than an `operator` kind on the index.
 *
 * Each business once, with the newest `lastModified` among its listings in
 * the catalog index (or the sitemap's own time when the index did not say),
 * which is when there was last something new on its page.
 */
export function businessEntries(
  listings: readonly ExperienceSummary[],
  lastModifiedBySlug: ReadonlyMap<string, Date>,
  base: string,
  now: Date,
): MetadataRoute.Sitemap {
  const newest = new Map<string, Date>();
  for (const listing of listings) {
    const slug = listing.operator?.slug?.trim();
    if (!slug) continue;
    const at = lastModifiedBySlug.get(listing.slug) ?? now;
    const was = newest.get(slug);
    if (!was || at > was) newest.set(slug, at);
  }
  return [...newest].map(([slug, lastModified]) => ({
    url: `${base}/o/${encodeURIComponent(slug)}`,
    lastModified,
    changeFrequency: "weekly" as const,
    priority: 0.7,
  }));
}
