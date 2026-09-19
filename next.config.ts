import type { NextConfig } from "next";
import { marketingRedirects } from "./src/lib/site/marketing-redirects";
import { cspHeaders } from "./src/lib/site/csp";

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
  /*
    DENY rather than SAMEORIGIN, matching `frame-ancestors 'none'` in the CSP
    (yuvoy-app#23). Nothing in this app frames anything, including itself, and
    the two headers saying different things is how one of them ends up being
    the one that is wrong. `X-Frame-Options` is kept alongside the CSP because
    it is still honoured by things that ignore CSP.
  */
  { key: "X-Frame-Options", value: "DENY" },
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
  /**
   * The client router cache, switched back on for dynamic routes.
   *
   * Next 15 changed `staleTimes.dynamic` from 30s to **0**, which means a
   * dynamic route's payload is thrown away the instant you leave it. Three of
   * this app's screens are dynamic, so Feed -> Trips -> Feed refetched and
   * re-rendered the feed on the server the second time, with the old screen
   * held on the glass while it did. Every tab tap paid full price, every time,
   * including the ones a traveller makes ten seconds apart while deciding.
   *
   * 30 seconds, matching the `staleTime` the QueryClient already uses for the
   * same data (`lib/query/client.ts`). The two layers cache the same reels for
   * the same window, so a return trip inside it is instant from both, and a
   * trip after it refetches from both. Setting them differently is how you get
   * a screen that is stale in one layer and fresh in the other.
   *
   * This does NOT hold a stale booking or a stale seat count in front of
   * anyone. It is the client's *router* cache — a re-navigation inside the
   * window re-renders from the payload, and every query on the screen still
   * revalidates on its own terms, including `refetchOnReconnect`. `/booking`
   * is additionally `no-store` at the CDN (see `headers` below), which is the
   * surface where staleness would actually cost something.
   */
  experimental: {
    staleTimes: { dynamic: 30, static: 180 },
  },
  images: {
    qualities: [75, 100],
    remotePatterns: [
      // Cloudflare Stream poster frames. hlsUrl/dashUrl are played by the
      // video element, not the image optimiser.
      { protocol: "https", hostname: "*.cloudflarestream.com" },
      { protocol: "https", hostname: "videodelivery.net" },
      /*
        Cloudflare Images: an operator's logo and the photographs of their
        operation, drawn through `next/image` on `/o/[slug]` (yuvoy-app#30).
        One host for every business — the account is in the path — so a new
        operator is not a deploy. Absent, the optimiser answers 400 and the
        page shows a broken logo.
      */
      { protocol: "https", hostname: "imagedelivery.net" },
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
    /*
      The CSP is built from the same env the client reads, so the API origin
      in the policy cannot drift from the API the app calls. See
      src/lib/site/csp.ts for the directive list and, more importantly, for
      why `script-src` has no nonce.

      Two headers, deliberately: a small enforced subset that cannot break a
      working page, and the full policy in report-only until a real run
      against production says the enumeration is complete.
    */
    const csp = cspHeaders({
      apiUrl: process.env.NEXT_PUBLIC_API_URL,
      posthogHost:
        process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://eu.i.posthog.com",
      dev: process.env.NODE_ENV !== "production",
    });

    return [
      { source: "/(.*)", headers: [...securityHeaders, ...csp] },
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
