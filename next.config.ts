import type { NextConfig } from "next";
import { marketingRedirects } from "./src/lib/site/marketing-redirects";

/**
 * The app is a different security surface from the marketing site: it holds a
 * booking status token in the URL fragment and hands off to a payment app.
 * These headers are the marketing site's set plus the two that matter here.
 */
const securityHeaders = [
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains",
  },
  { key: "X-Content-Type-Options", value: "nosniff" },
  /*
    Load-bearing, not boilerplate. The status token lives in the URL fragment
    (/booking#t=...). A fragment is never sent to a server, but a Referer
    header on a cross-origin subresource would carry the whole URL including
    it. strict-origin-when-cross-origin sends only the origin off-site.
    See plan §4.4 — "three ways it leaks that are easy to miss".
  */
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=()",
  },
];

/**
 * The service worker's version, stamped at build time.
 *
 * The commit on a Vercel or GitHub build; a timestamp anywhere else, so every
 * local production build is its own version too. Inlined into the client as
 * NEXT_PUBLIC_SW_VERSION and passed to `register("/sw.js?v=…")` — a changed
 * URL is a new worker, which is the whole invalidation mechanism.
 */
const swVersion = (
  process.env.VERCEL_GIT_COMMIT_SHA ??
  process.env.GITHUB_SHA ??
  Date.now().toString(36)
).slice(0, 12);

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  env: { NEXT_PUBLIC_SW_VERSION: swVersion },
  images: {
    qualities: [75, 100],
    remotePatterns: [
      // Cloudflare Stream poster frames. hlsUrl/dashUrl are played by the
      // video element, not the image optimiser.
      { protocol: "https", hostname: "*.cloudflarestream.com" },
      { protocol: "https", hostname: "videodelivery.net" },
    ],
  },
  /**
   * The marketing site's URLs, once this app is `yuvoy.in` (D-102, option A).
   * Host-gated, temporary, and mirrored against the live marketing sitemap by
   * `pnpm cutover:check`. The table and its reasoning live beside the route
   * inventory in src/lib/site/marketing-redirects.ts.
   */
  async redirects() {
    return marketingRedirects();
  },
  async headers() {
    return [
      { source: "/(.*)", headers: securityHeaders },
      {
        /*
          The booking screen must never be cached by a shared cache. It is
          keyed by a token in the fragment, and a stale confirmed booking is
          worse than no booking at all.
        */
        source: "/booking",
        headers: [{ key: "Cache-Control", value: "no-store, must-revalidate" }],
      },
    ];
  },
};

export default nextConfig;
