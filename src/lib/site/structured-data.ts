import type { Guide } from "@/lib/guides/schema";
import {
  ORGANIZATION_ID,
  SITE_NAME,
  SITE_URL,
  WEBSITE_ID,
} from "@/lib/site/metadata";

/**
 * Structured data, from an allowlist.
 *
 * **Structured data counts as a claim even though it is invisible on the
 * page.** This project removed a site that published invented prices, review
 * counts and unapproved operator names, and schema.org is the easiest place to
 * do that again by accident — a copied snippet carrying `aggregateRating` says
 * something no record backs.
 *
 * So: nothing here emits a rating, a review count, a price, an availability
 * claim or a named partner. There is no Product or Offer builder in this file
 * on purpose. When one is needed it goes through review, not through a copy of
 * somebody's blog post.
 */

const BANNED = [
  "aggregateRating",
  "ratingValue",
  "reviewCount",
  "review",
  "offers",
  "price",
  "priceCurrency",
  "availability",
] as const;

/** Fails loudly rather than emitting an unbacked claim. */
function assertNoUnbackedClaims(node: Record<string, unknown>): void {
  const json = JSON.stringify(node);
  for (const key of BANNED) {
    if (json.includes(`"${key}"`)) {
      throw new Error(
        `Structured data contains "${key}", which asserts something no record backs. See src/lib/site/structured-data.ts.`,
      );
    }
  }
}

export function articleJsonLd(guide: Guide): Record<string, unknown> {
  const node = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: guide.title,
    description: guide.description,
    dateModified: guide.updated,
    /*
      Only when there is one. `image` is a claim like any other — an absolute
      URL to a picture we say represents this article — so it is emitted from
      the record rather than defaulted to a brand asset that has nothing to do
      with the guide.
    */
    ...(guide.hero ? { image: `${SITE_URL}${guide.hero.src}` } : {}),
    // Linked to the Organization node by @id rather than restating it, so
    // there is one publisher on the site and not one per article.
    publisher: { "@id": ORGANIZATION_ID },
    isPartOf: { "@id": WEBSITE_ID },
    mainEntityOfPage: `${SITE_URL}/guides/${guide.slug}`,
    inLanguage: "en",
  };
  assertNoUnbackedClaims(node);
  return node;
}

/**
 * Who publishes this. Emitted once, in the root layout.
 *
 * Deliberately thin: a name, a URL and the logo the app already ships. No
 * address, no founder, no telephone, no social profiles — every one of those
 * is a fact somebody would have to keep true, and a stale one in structured
 * data is worse than an absent one.
 */
export function organizationJsonLd(): Record<string, unknown> {
  const node = {
    "@context": "https://schema.org",
    "@type": "Organization",
    "@id": ORGANIZATION_ID,
    name: SITE_NAME,
    url: `${SITE_URL}/`,
    logo: `${SITE_URL}/icon.png`,
  };
  assertNoUnbackedClaims(node);
  return node;
}

/**
 * The site itself, linked to its publisher by @id rather than by repeating it.
 *
 * No `potentialAction` / SearchAction: Google retired the sitelinks searchbox
 * in 2024, so it would be markup that asks for something nothing grants.
 */
export function webSiteJsonLd(): Record<string, unknown> {
  const node = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": WEBSITE_ID,
    name: SITE_NAME,
    url: `${SITE_URL}/`,
    publisher: { "@id": ORGANIZATION_ID },
    inLanguage: "en",
  };
  assertNoUnbackedClaims(node);
  return node;
}

export interface Crumb {
  name: string;
  /** Path from the root, with a leading slash. */
  path: string;
}

/**
 * Where a page sits. Emitted on every interior page, not on one sample.
 *
 * The trail must match the URL a crawler can actually walk — a breadcrumb
 * naming a level that is not a real route is a claim like any other.
 */
export function breadcrumbJsonLd(trail: Crumb[]): Record<string, unknown> {
  if (trail.length === 0) {
    throw new Error("A breadcrumb with no trail describes nothing.");
  }
  const node = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: trail.map((c, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: c.name,
      item: new URL(c.path, SITE_URL).toString(),
    })),
  };
  assertNoUnbackedClaims(node);
  return node;
}
