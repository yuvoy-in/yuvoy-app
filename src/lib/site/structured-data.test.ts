import { describe, it, expect } from "vitest";
import {
  articleJsonLd,
  breadcrumbJsonLd,
  organizationJsonLd,
  webSiteJsonLd,
} from "./structured-data";
import { ORGANIZATION_ID, WEBSITE_ID } from "./metadata";
import type { Guide } from "@/lib/guides/schema";

const GUIDE = {
  slug: "diving-in-havelock",
  title: "Diving in Havelock",
  description: "What a first dive here is actually like.",
  updated: "2026-08-30",
  status: "published",
} as unknown as Guide;

/**
 * Structured data is a claim even though it is invisible on the page. This
 * project removed a site that published invented prices and review counts, and
 * schema.org is the easiest place to do that again by accident.
 */
describe("structured data", () => {
  it("links the site to its publisher by @id rather than repeating it", () => {
    expect(organizationJsonLd()["@id"]).toBe(ORGANIZATION_ID);
    expect(webSiteJsonLd()).toMatchObject({
      "@id": WEBSITE_ID,
      publisher: { "@id": ORGANIZATION_ID },
    });
    expect(articleJsonLd(GUIDE)).toMatchObject({
      publisher: { "@id": ORGANIZATION_ID },
      isPartOf: { "@id": WEBSITE_ID },
    });
  });

  it("builds a breadcrumb with absolute items, in order", () => {
    const node = breadcrumbJsonLd([
      { name: "Yuvoy", path: "/" },
      { name: "Guides", path: "/guides" },
    ]) as { itemListElement: { position: number; item: string }[] };

    expect(node.itemListElement.map((i) => i.position)).toEqual([1, 2]);
    for (const item of node.itemListElement) {
      // A relative `item` is not a location a crawler can resolve.
      expect(item.item).toMatch(/^https?:\/\//);
    }
  });

  it("refuses a breadcrumb that describes nothing", () => {
    expect(() => breadcrumbJsonLd([])).toThrow();
  });

  it("emits no rating, review count, price or availability, from any builder", () => {
    const BANNED =
      /"(aggregateRating|ratingValue|reviewCount|review|offers|price|priceCurrency|availability)"/;

    for (const node of [
      organizationJsonLd(),
      webSiteJsonLd(),
      articleJsonLd(GUIDE),
      breadcrumbJsonLd([{ name: "Yuvoy", path: "/" }]),
    ]) {
      expect(JSON.stringify(node)).not.toMatch(BANNED);
    }
  });

  it("bans the KEY, not the word — prose may say `reviewCount`", () => {
    // Deliberate. The rule is "do not assert a rating", not "do not discuss
    // ratings"; a guide explaining that Yuvoy publishes no review counts must
    // still be publishable.
    const guide = {
      ...GUIDE,
      title: "Why there is no reviewCount here",
    } as Guide;
    expect(() => articleJsonLd(guide)).not.toThrow();
    expect(articleJsonLd(guide).headline).toContain("reviewCount");
  });
});
