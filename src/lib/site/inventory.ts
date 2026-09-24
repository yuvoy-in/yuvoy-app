/**
 * The indexable fixed routes, in one list.
 *
 * There used to be two: the sitemap built its own array, and `e2e/seo.spec.ts`
 * kept a hand-copied one beside it. Two lists of the same thing drift the
 * moment a page is added, and the drift is silent in the worst direction — a
 * page that exists, renders and is never in the sitemap is a page no crawler
 * finds, and nothing fails.
 *
 * So this is the single source, `sitemap.ts` derives from it, and `pnpm qa`
 * fails a public page route that is in neither this list nor the private one.
 * The audit does not import it at all: it reads `/sitemap.xml` from whatever
 * origin it is pointed at, which is the same thing a crawler does and the only
 * version that can be checked against production.
 *
 * Dynamic routes are deliberately absent. `/e/[slug]` and `/guides/[slug]`
 * come from the catalog index and the guide registry — enumerating them here
 * would be a third copy of data that already has an owner.
 */

import { isGatedFromIndex } from "./access";

export interface FixedRoute {
  path: string;
  changeFrequency: "daily" | "weekly" | "monthly";
  priority: number;
}

export const INDEXABLE_FIXED_ROUTES: readonly FixedRoute[] = [
  // The feed. The freshest surface in the product.
  { path: "/", changeFrequency: "daily", priority: 1 },
  // Date-first discovery. Changes as operators load inventory.
  { path: "/search", changeFrequency: "daily", priority: 0.8 },
  // The guides hub. Changes only on deploy — the records are MDX in the repo.
  { path: "/guides", changeFrequency: "weekly", priority: 0.7 },
  /*
    The Help Center. Indexable unlike the rest of the signed-in app, because
    every answer on it is static, none of it is anybody's data, and "how do I
    cancel a Yuvoy booking" is typed into a search engine before anybody thinks
    to open the app. Changes only on deploy: the answers are a module.
  */
  { path: "/help", changeFrequency: "monthly", priority: 0.6 },
] as const;

/**
 * The fixed routes the SITEMAP publishes, which is the list above minus
 * whatever the invite gate has taken out of the index (yuvoy-api#195).
 *
 * Two halves of one answer again, and the same failure mode as robots.txt and
 * the meta tag: a route that says `noindex` and is still in the sitemap is an
 * invitation to crawl a page that refuses to be indexed, and nothing about
 * that fails on its own. Both halves therefore derive from `GATED_FROM_INDEX`
 * in `lib/site/access.ts` (the page through `gatedRobots`, this through the
 * filter below), and `e2e/audit.spec.ts` asserts against a live origin that
 * they agree.
 *
 * The list above is deliberately NOT filtered in place. It is the inventory:
 * "these are the fixed pages of this app that are public", which is what
 * `pnpm qa` checks every page route against, and that answer does not change
 * because a switch is on for a season.
 */
export const SITEMAP_FIXED_ROUTES: readonly FixedRoute[] =
  INDEXABLE_FIXED_ROUTES.filter((route) => !isGatedFromIndex(route.path));

/**
 * Dynamic route patterns that are indexable, as they appear on disk.
 *
 * Not enumerated — named, so `pnpm qa` can tell "this page is accounted for"
 * from "somebody added a public page and forgot the sitemap".
 */
export const INDEXABLE_DYNAMIC_ROUTES = [
  "/e/[slug]",
  "/guides/[slug]",
  /*
    A business's own page — yuvoy-app#30. Public and worth indexing: it is what
    somebody searching an operator's name should land on.

    NOT in the sitemap yet, and that is a gap rather than a decision.
    `GET /catalog/index` enumerates `experience`, `destination` and `market`
    and has no `operator` kind, so there is nothing to build the URL list from
    — and inventing one by walking every listing's operator would be a third
    copy of data that already has an owner, which is what the comment at the
    top of this file refuses. Raised on yuvoy-app#30; the entries appear the
    day the catalog index carries operators.
  */
  "/o/[slug]",
  /*
    What a business runs — yuvoy-app#33. Indexable for the same reason the
    profile is, and now more so: the listings moved OFF the profile onto this
    page, so this is where that content lives and there is no duplicate to
    compete with.

    Not in the sitemap, for the same reason as `/o/[slug]` above and not a
    separate decision: `GET /catalog/index` has no `operator` kind, so there is
    nothing to build the URL list from. Both appear the day it does.
  */
  "/o/[slug]/listings",
] as const;
