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
 * It is read in lib/site/indexing.ts, which the root layout's `robots` meta
 * tag also derives from — this file and that tag are two halves of one answer
 * and a deployment where they disagree is crawled but unindexable.
 */
import {
  INDEXABLE,
  NON_PAGE_ROUTES,
  PRIVATE_ROUTES,
} from "@/lib/site/indexing";
import { SITE_URL } from "@/lib/site/metadata";

const BASE = SITE_URL;

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
        //
        // `/go/` stays disallowed, and that is a deliberate divergence from
        // yuvoy-app#6, which asked for it to be removed. That request was
        // written against yuvoy-web's `/go/[source]` CAMPAIGN PAGES, where a
        // robots block hid a page-level `noindex` from the crawler that
        // needed to read it. In this repo `/go/[code]` is not a page: it
        // records a QR scan server-side and redirects. There is no meta tag
        // to expose, nothing to index, and nothing links to it.
        disallow: [...PRIVATE_ROUTES, ...NON_PAGE_ROUTES],
      },
    ],
    sitemap: `${BASE}/sitemap.xml`,
    host: BASE,
  };
}
