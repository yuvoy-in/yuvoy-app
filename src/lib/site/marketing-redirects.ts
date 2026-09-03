import type { NextConfig } from "next";

type Redirect = Awaited<
  ReturnType<NonNullable<NextConfig["redirects"]>>
>[number];

/**
 * Every URL the marketing site publishes, forwarded to the marketing host once
 * this app takes the root domain (D-102; yuvoy-app#12, option A, 3 Sep 2026).
 *
 * **Deferred the same day.** The owner launches on `app.yuvoy.in` and may
 * revisit the root domain later. Until then these rules are inert — the host
 * gate below is what keeps them so — and they stay in the repo, tested, so
 * that day does not start from zero. `docs/SEARCH_INDEXING.md`, appendix.
 *
 * ## The decision these encode
 *
 * At launch `yuvoy.in` is this app and `yuvoy-web` moves to `www.yuvoy.in`.
 * Google has twelve marketing URLs indexed on the root domain, printed cards
 * carry `/go/<source>` campaign routes, and the operator portal's only door
 * for a new operator is `/operators`. Without these rules every one of them
 * is a 404 the morning the domain moves — silently, because a 404 on an
 * indexed URL fails in a traffic graph weeks later, not in a log.
 *
 * ## Gated on the host, deliberately
 *
 * Each rule carries `has: [{ type: "host", value: ROOT_HOST }]`, so it fires
 * only when this app is answering for `yuvoy.in`. On `app.yuvoy.in` today, and
 * on every preview, nothing here applies: `www.yuvoy.in` still forwards to
 * `yuvoy.in`, so an ungated rule would send `app.yuvoy.in/about` on a two-hop
 * chain that ends back where it started. The rules activate exactly once, with
 * the domain — and are verified the same way: `pnpm cutover:check` against
 * `https://yuvoy.in` after the move, and against a production build with a
 * `Host: yuvoy.in` header before it.
 *
 * ## Temporary (307), promoted later
 *
 * `permanent: false` on every rule, for the reason yuvoy-web gives for its
 * own: a 308 is cached by browsers indefinitely, and the plan of record still
 * migrates these pages into this app one at a time, each replacing a redirect.
 * A browser holding a cached 308 for `/about` would then bounce between the
 * two hosts forever. Promote to `permanent: true` only once the shape has held
 * for a season and no page is about to move back.
 *
 * ## Two sources of truth, reconciled live
 *
 * This table mirrors what yuvoy-web serves and will drift the day that repo
 * adds a page. That is what `pnpm cutover:check` exists for: it reads the
 * marketing site's live sitemap and fails on any URL this app cannot answer.
 * Neither list is trusted alone, and the check deliberately does not import
 * this file — a wrong table must not be allowed to agree with itself.
 */

/** The host these rules answer for. The marketing host is a different one. */
export const ROOT_HOST = "yuvoy.in";
export const MARKETING_ORIGIN = "https://www.yuvoy.in";

/**
 * `has.value` is matched by Next as an anchored regular expression, so the
 * dot is escaped: this matches `yuvoy.in` and nothing else — not
 * `app.yuvoy.in`, not `www.yuvoy.in`, not a preview host.
 */
const ROOT_HOST_PATTERN = ROOT_HOST.replace(/\./g, "\\.");

/** The marketing site's fixed pages, forwarded as they are. */
export const MARKETING_PAGES = [
  "/about",
  "/contact",
  "/explore",
  "/journal",
  "/operators",
  "/safety",
  "/waitlist",
  // Linked from every marketing footer; noindex today, so not in its sitemap.
  "/privacy",
  "/terms",
] as const;

/** Trees with their own leaves on the marketing site. */
export const MARKETING_TREES = ["/journal", "/destinations"] as const;

/**
 * Campaign QR landings. Mirrors yuvoy-web's `CAMPAIGN_SOURCES`
 * (`src/lib/leads/registry.ts`). They sit under the same prefix as this app's
 * own `/go/[code]` QR arrivals, and redirects are matched before the
 * filesystem — so a scan code spelled exactly like one of these would be
 * shadowed. Raised on yuvoy-api: codes must never be minted with these values.
 */
export const CAMPAIGN_SOURCES = [
  "ferry",
  "kiosk",
  "hotel",
  "instagram",
  "direct",
] as const;

/**
 * Paths the marketing site answers with a redirect of its own (its 2026-08-06
 * consolidation). Forwarded straight to where THEY land, so the hop count
 * stays at one: `/how-it-works` → `www.yuvoy.in/#how`, not
 * `www.yuvoy.in/how-it-works` → `#how`.
 */
export const MARKETING_LEGACY: Readonly<Record<string, string>> = {
  "/how-it-works": "/#how",
  "/travellers": "/explore",
  "/experiences": "/explore#experiences",
  "/destinations": "/#destinations",
  "/destinations/neil": "/destinations/neil-island",
};

/**
 * Retired pages the marketing site answers `410 Gone` for. Forwarded so a
 * crawler still meets the 410 — a deliberate signal — rather than this app's
 * 404, which says something different.
 */
export const MARKETING_GONE = ["/philosophy", "/experiences/:slug*"] as const;

export function marketingRedirects(): Redirect[] {
  const rule = (source: string, path: string): Redirect => ({
    source,
    destination: `${MARKETING_ORIGIN}${path}`,
    permanent: false,
    has: [{ type: "host", value: ROOT_HOST_PATTERN }],
  });

  return [
    // Exact legacy paths first. `/destinations/neil` must beat
    // `/destinations/:path*`, and the bare `/destinations` (now a homepage
    // anchor) and `/experiences` (now `/explore#experiences`) must beat the
    // trees and the 410 wildcard beneath them.
    ...Object.entries(MARKETING_LEGACY).map(([source, path]) =>
      rule(source, path),
    ),
    ...MARKETING_PAGES.map((path) => rule(path, path)),
    ...MARKETING_TREES.map((tree) => rule(`${tree}/:path*`, `${tree}/:path*`)),
    ...CAMPAIGN_SOURCES.map((source) => rule(`/go/${source}`, `/go/${source}`)),
    ...MARKETING_GONE.map((path) => rule(path, path)),
  ];
}
