import { expect, type APIRequestContext } from "@playwright/test";

export const ALLOWED_JSONLD_TYPES = new Set([
  "Organization",
  "WebSite",
  "Article",
  "BreadcrumbList",
]);

/**
 * Types that assert something no record backs. Absent from the builder by
 * design; asserted here because the builder is not the only way a `<script>`
 * tag reaches a page.
 */
export const BANNED_JSONLD_KEYS =
  /"(aggregateRating|ratingValue|reviewCount|offers|price|priceCurrency|availability)"/;

export async function sitemapPaths(
  request: APIRequestContext,
): Promise<string[]> {
  const res = await request.get("/sitemap.xml");
  expect(res.status(), "/sitemap.xml must serve").toBe(200);

  const xml = await res.text();
  const paths = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => {
    // Path only. See the header: the sitemap is absolute and may name a
    // different origin from the one under test.
    try {
      return new URL(m[1]).pathname;
    } catch {
      return m[1];
    }
  });

  expect(paths.length, "the sitemap must not be empty").toBeGreaterThan(0);
  return paths;
}

export function meta(html: string, key: string): string | undefined {
  return (
    html.match(
      new RegExp(`<meta property="${key}" content="([^"]*)"`, "i"),
    )?.[1] ??
    html.match(new RegExp(`<meta name="${key}" content="([^"]*)"`, "i"))?.[1]
  );
}
