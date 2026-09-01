import type { MetadataRoute } from "next";
import { publishedGuides } from "@/lib/guides/guides";
import { createApiClient } from "@/lib/api/client";
import { SITE_URL } from "@/lib/site/metadata";
import { INDEXABLE_FIXED_ROUTES } from "@/lib/site/inventory";

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
  */
  const stat: MetadataRoute.Sitemap = INDEXABLE_FIXED_ROUTES.map((r) => ({
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
  try {
    const api = createApiClient();
    const { data } = await api.GET("/catalog/index", {});
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

  return [...stat, ...guides, ...experiences];
}
