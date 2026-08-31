import type { MetadataRoute } from "next";

/**
 * Crawler directives.
 *
 * The app is **noindex everywhere** until it takes the root domain at launch
 * (D-102). Two indexed copies of the same brand is the worst of both, and a
 * staging host that gets crawled is a real, common and hard-to-undo mistake.
 *
 * `NEXT_PUBLIC_ALLOW_INDEXING` is the single switch that flips at cutover,
 * so promoting the app is a config change rather than a hunt through metadata.
 */
const BASE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://app.yuvoy.in";
const INDEXABLE = process.env.NEXT_PUBLIC_ALLOW_INDEXING === "true";

export default function robots(): MetadataRoute.Robots {
  if (!INDEXABLE) {
    return { rules: [{ userAgent: "*", disallow: "/" }] };
  }

  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        // Keyed by a secret, personal, or otherwise not for a crawler.
        disallow: [
          "/booking",
          "/trip/",
          "/trips",
          "/account",
          "/go/",
          "/offline",
        ],
      },
    ],
    sitemap: `${BASE}/sitemap.xml`,
    host: BASE,
  };
}
