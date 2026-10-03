import { api } from "@/lib/api/client";
import type { components } from "@/lib/api/schema.gen";
import type { GuideFrontmatter } from "./schema";

type ExperienceSummary = components["schemas"]["ExperienceSummary"];

/** The filter a guide names in its frontmatter. */
export type GuideListingsFilter = NonNullable<GuideFrontmatter["listings"]>;

/** As many as the foot of a guide shows. Enough to choose from, not a feed. */
export const GUIDE_LISTINGS = 3;

/** Reels read to find them: each listing appears once per reel it has. */
const READ = 30;

/**
 * The listings at the foot of a guide (yuvoy-app#116 item 4), by the
 * guide's own `listings` filter, through the endpoint Search already reads
 * (`GET /reels` with `category` and `activityType`).
 *
 * The feed carries every published reel with the listing it sells, and only
 * listings on sale reach it, so a listing here is one a traveller can open
 * and see dates for. Each listing comes once, in the order its first reel
 * came.
 *
 * Read in the BROWSER, by `GuideListings`, never while the page renders. A
 * guide is built once and kept for a day, so a list rendered into it would
 * offer a listing for up to a day after it stopped selling, and the build
 * that renders it is not promised the API at all: one that could not reach
 * it shipped every guide with no listings until the next revalidation.
 *
 * Throws like any other query, so a failed read is retried by the query
 * client's rule and never cached as "nothing matches".
 */
export async function guideListings(
  filter: GuideListingsFilter,
  signal?: AbortSignal,
): Promise<ExperienceSummary[]> {
  const { data, error } = await api.GET("/reels", {
    params: {
      query: {
        limit: READ,
        ...(filter.category ? { category: filter.category } : {}),
        ...(filter.activityType ? { activityType: filter.activityType } : {}),
      },
    },
    signal,
  });
  if (error) throw error;
  return firstListings(data?.items ?? []);
}

/** Each listing once, in reel order, up to what a guide shows. */
export function firstListings(
  items: readonly { experience?: ExperienceSummary }[],
): ExperienceSummary[] {
  const seen = new Set<string>();
  const out: ExperienceSummary[] = [];
  for (const { experience } of items) {
    if (!experience?.slug || seen.has(experience.slug)) continue;
    seen.add(experience.slug);
    out.push(experience);
    if (out.length === GUIDE_LISTINGS) break;
  }
  return out;
}
