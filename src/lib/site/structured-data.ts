import type { Guide } from "@/lib/guides/schema";

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
    // Organization only — no author persona we cannot stand behind.
    publisher: { "@type": "Organization", name: "Yuvoy" },
    inLanguage: "en",
  };
  assertNoUnbackedClaims(node);
  return node;
}
