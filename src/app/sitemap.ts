import type { MetadataRoute } from "next";
import { publishedGuides } from "@/lib/guides/guides";
import { createApiClient } from "@/lib/api/client";
import { SITE_URL } from "@/lib/site/metadata";
import { SITEMAP_FIXED_ROUTES } from "@/lib/site/inventory";
import { businessEntries } from "@/lib/site/business-sitemap";
import type { components } from "@/lib/api/schema.gen";

/** Pages of listings read for the businesses: far past any season's count. */
const MAX_LISTING_PAGES = 20;

/**
 * The sitemap.
 *
 * Derived from the same sources the pages are — the catalog index and the
 * guide registry — rather than hand-maintained. A hand-written sitemap is a
 * second source of truth that goes stale silently, and the first symptom is a
 * crawler asking for a page that no longer exists.
 *
 * **Only `published` guides appear.** Drafts render locally and are noindex;
 * listing one here would invite a crawler to the thing the review gate exists
 * to hold back.
 */
export const revalidate = 3600;

const BASE = SITE_URL;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();

  /*
    Derived from lib/site/inventory.ts rather than written here. The audit
    suite used to keep a second copy of this list; two lists of the same thing
    drift the moment a page is added, and a page missing from the sitemap
    fails nothing and is found by nobody.

    `SITEMAP_FIXED_ROUTES`, not the inventory itself: a route the invite gate
    has taken out of the index (yuvoy-api#195) leaves the sitemap with it, so
    a crawler is never invited to a page whose own tag says noindex.
  */
  const stat: MetadataRoute.Sitemap = SITEMAP_FIXED_ROUTES.map((r) => ({
    url: new URL(r.path, BASE).toString(),
    lastModified: now,
    changeFrequency: r.changeFrequency,
    priority: r.priority,
  }));

  const guides: MetadataRoute.Sitemap = publishedGuides().map((g) => ({
    url: `${BASE}/guides/${g.slug}`,
    lastModified: new Date(`${g.updated}T00:00:00+05:30`),
    changeFrequency: "monthly",
    priority: 0.6,
  }));

  // The catalog index exists for exactly this. A failure here must not fail
  // the build — a sitemap missing the experiences is recoverable, a broken
  // deploy is not.
  let experiences: MetadataRoute.Sitemap = [];
  const lastModifiedBySlug = new Map<string, Date>();
  const api = createApiClient();
  try {
    const { data } = await api.GET("/catalog/index", {});
    for (const e of data?.entries ?? []) {
      if (e.kind === "experience") {
        lastModifiedBySlug.set(e.slug, new Date(e.lastModified));
      }
    }
    experiences = (data?.entries ?? [])
      .filter((e) => e.kind === "experience" && e.hasBookableDates)
      .map((e) => ({
        url: `${BASE}/e/${e.slug}`,
        lastModified: new Date(e.lastModified),
        changeFrequency: "daily" as const,
        priority: 0.9,
      }));
  } catch {
    // Left empty on purpose. See above.
  }

  /*
    The businesses, from the listings on sale (yuvoy-app#116 item 5; see
    `businessEntries`). Paged to the end the API says, never inferred from a
    short page, and capped so a cursor that never ends cannot hang a build.
    The same rule as above: a failure leaves them out and never fails the
    build.
  */
  let businesses: MetadataRoute.Sitemap = [];
  try {
    const listings: components["schemas"]["ExperienceSummary"][] = [];
    let cursor: string | undefined;
    for (let page = 0; page < MAX_LISTING_PAGES; page += 1) {
      const { data, error } = await api.GET("/experiences", {
        params: { query: { limit: 100, ...(cursor ? { cursor } : {}) } },
      });
      if (error || !data) break;
      listings.push(...data.items);
      if (data.complete || !data.nextCursor) break;
      cursor = data.nextCursor;
    }
    businesses = businessEntries(listings, lastModifiedBySlug, BASE, now);
  } catch {
    // Left empty on purpose. See above.
  }

  return [...stat, ...guides, ...experiences, ...businesses];
}
