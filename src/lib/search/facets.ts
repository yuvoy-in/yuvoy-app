import type { components } from "@/lib/api/schema.gen";

type ExperienceSummary = components["schemas"]["ExperienceSummary"];
type Category = components["schemas"]["Category"];

/**
 * The chips a traveller can actually tap — yuvoy-app#24.
 *
 * ## Derived from the catalogue, never hardcoded
 *
 * `DestinationKey` is a pattern string, not an enum — `<market>/<destination>`
 * — so a fixed list in this client would go stale the first time a destination
 * opens. And the display name is not derivable from the key: production
 * returns "Havelock (Swaraj Dweep)" and "Neil (Shaheed Dweep)", which no
 * title-casing of `andaman/havelock` would ever produce.
 *
 * Both come off `ExperienceSummary` together — `destinationKey` is required on
 * it and `location` is "Display name of the destination". So the key and its
 * label can never disagree, because they arrive on the same row.
 *
 * This is the answer to the open question on the issue: **no destinations
 * endpoint is needed.** `/catalog/index` does list every destination, and was
 * the tempting source because it is unpaginated — but it carries no display
 * name, so it would have meant title-casing a slug after all.
 *
 * ## Only what has something behind it
 *
 * A facet appears only if a published listing carries it. That is the rule
 * this product already applies to the marketing site — "no filter that filters
 * nothing" — and it is stronger here than a fixed list would be: tapping a
 * chip always returns at least one thing, so an empty result means the OTHER
 * filters excluded it rather than the chip being decorative.
 *
 * It is why `category` is derived too, even though `Category` IS a closed
 * enum. Twelve chips where ten return nothing is a worse screen than two that
 * work.
 *
 * ## The limit, stated rather than hidden
 *
 * The source page is capped at `FACET_SAMPLE`. A destination whose only
 * listings fall outside that page has no chip. With a launch catalogue in
 * single figures that cannot happen; when it can, the fix is a destinations
 * endpoint carrying display names, which the backend already offered to build.
 * It is not a silent wrong answer either way — a missing chip is a filter
 * nobody sees, never a filter that lies.
 */

/** How much of the catalogue the chip list is built from. The API's own cap. */
export const FACET_SAMPLE = 50;

export interface DestinationFacet {
  key: string;
  label: string;
}

export interface CategoryFacet {
  key: Category;
  label: string;
}

/**
 * The twelve categories, as words.
 *
 * A client-side map, which this codebase otherwise avoids — `pricingUnitLabel`
 * and `activityTypeLabel` are rendered verbatim precisely so a client cannot
 * drift from the server's wording. The difference is that `Category` is a
 * CLOSED enum in the contract with no label endpoint on the traveller API
 * (`/v1/catalog/vocabulary` is 404 — it exists only on the operator API, which
 * this app cannot reach). A closed enum cannot grow without a contract change,
 * and a contract change is a deploy here anyway.
 *
 * Typed as `Record<Category, string>` so that growing the enum is a BUILD
 * FAILURE rather than a chip with no name.
 */
const CATEGORY_LABELS: Record<Category, string> = {
  adventure: "Adventure",
  nature_wildlife: "Nature & wildlife",
  food_drink: "Food & drink",
  arts_creativity: "Arts & making",
  learning: "Learning",
  culture_heritage: "Culture & heritage",
  wellness: "Wellness",
  entertainment: "Entertainment",
  community: "Community",
  sports: "Sports",
  local_life: "Local life",
  events: "Events",
};

/**
 * The destinations present in a sample of the catalogue, in a stable order.
 *
 * Sorted by label rather than by frequency: a chip row that reorders itself as
 * the catalogue changes is a row somebody has to re-read every visit.
 */
export function destinationFacets(
  items: readonly ExperienceSummary[],
): DestinationFacet[] {
  const byKey = new Map<string, string>();
  for (const item of items) {
    const key = item.destinationKey?.trim();
    if (!key) continue;
    /*
      `location` is optional on the summary while `destinationKey` is
      required, so a listing can name a place this cannot label. Skipped
      rather than shown as its key: `andaman/port_blair` is not a word, and
      it is the exact shape the issue warned against.
    */
    const label = item.location?.trim();
    if (!label) continue;
    if (!byKey.has(key)) byKey.set(key, label);
  }
  return [...byKey]
    .map(([key, label]) => ({ key, label }))
    .sort((a, b) => a.label.localeCompare(b.label, "en"));
}

/** The categories present in a sample of the catalogue, in contract order. */
export function categoryFacets(
  items: readonly ExperienceSummary[],
): CategoryFacet[] {
  const present = new Set<string>();
  for (const item of items) {
    const key = item.category?.trim();
    if (key) present.add(key);
  }
  /*
    Contract order, not alphabetical and not catalogue order. `adventure`
    first is the browse vocabulary's own ordering, and keeping it means the
    chips read the same way on every screen that ever renders them.

    A value the map does not know is skipped rather than titled: it means the
    server's enum has grown past this build, and a chip that cannot be named
    is one nobody can act on. The `Record<Category, …>` type makes that a
    build failure before it can be a runtime one.
  */
  return (Object.keys(CATEGORY_LABELS) as Category[])
    .filter((key) => present.has(key))
    .map((key) => ({ key, label: CATEGORY_LABELS[key] }));
}
