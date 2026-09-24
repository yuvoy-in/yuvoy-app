import type { Metadata } from "next";
import { isGatedFromIndex } from "./access";

/**
 * Whether this deployment may be indexed — and the single place that decides.
 *
 * The app is noindex everywhere until launch — on `app.yuvoy.in` (owner,
 * 3 Sep 2026; the D-102 root-domain move is deferred). The marketing site
 * owns search until then, and two indexed copies
 * of one brand is the worst of both.
 *
 * `robots.ts` and the root layout are TWO halves of that answer — a
 * `robots.txt` rule and a `<meta name="robots">` tag — and they must agree.
 * They did not. `robots.ts` read this flag while the layout hardcoded
 * `index: false`, so flipping the flag at launch would have opened crawling
 * and left every page carrying `noindex`. The site would be crawled and
 * refuse to be indexed, on launch day, and it would look like it had worked.
 *
 * So both halves are derived from here, and `pnpm qa` fails a `robots:`
 * literal written anywhere else under `src/app`.
 */
export const INDEXABLE = process.env.NEXT_PUBLIC_ALLOW_INDEXING === "true";

/**
 * The `<meta name="robots">` policy.
 *
 * The preview directives are set deliberately rather than left to a default:
 * this is a video-first product, and a search result that may show a large
 * image and a full snippet is the difference between a listing that reads as
 * a place and one that reads as a link. They apply only once indexing is on,
 * because a directive attached to `noindex` says nothing.
 */
export const robotsMeta: Metadata["robots"] = INDEXABLE
  ? {
      index: true,
      follow: true,
      googleBot: {
        index: true,
        follow: true,
        "max-image-preview": "large",
        "max-snippet": -1,
        "max-video-preview": -1,
      },
    }
  : { index: false, follow: false };

/**
 * Routes that are never indexed, whatever the switch above says.
 *
 * Each is keyed by a secret, is personal, or is machinery. `/booking` and
 * `/trip/` are the sharp ones: both are addressed by a status token, and that
 * token IS the traveller's access to their booking — a crawler that follows a
 * pasted link is exactly the wrong outcome.
 *
 * This list is also two things at once: part of `robots.txt`'s disallow rules,
 * and the set of pages carrying `privateRobotsMeta`. Keeping them as one list
 * is the point — a private route added to only one of them is private in only
 * one way, and `pnpm qa` fails either half going missing. `robots.txt` is a
 * request; the meta tag is the one a crawler that ignores it still reads.
 */
export const PRIVATE_ROUTES = [
  "/booking",
  /*
    An invitation link and a guest's own trip (yuvoy-app#38 items 7 and 11).

    `/i/{token}` carries a credential in its path: whoever opens it takes a
    place in somebody's party, and the link is single-use, so an indexed one
    would be both a leak and a 404. `/trips/invited/` is keyed by the reader's
    session and has nothing to serve a crawler at all.
  */
  "/i/",
  "/trips/invited/",
  // Checkout. A URL with a `?slot=` on it, holding an idempotency key.
  // Wildcards are matched by every crawler that matters, and the page carries
  // `privateRobotsMeta` for the ones that ignore robots.txt entirely.
  "/e/*/book",
  "/trip/",
  "/trips",
  "/account",
  /*
    The wishlist. Rendered entirely from IndexedDB on the device, so a crawler
    sees an empty list, and a permanently empty result is worse than none.

    NOTE for whoever adds the next one: `pnpm qa` scrapes the string literals
    out of this array, comments included, so a double-quoted word in a comment
    here is read as a route. That is what a quoted Saved in this very comment
    did, and the failure names a route nobody wrote.
  */
  "/saved",
  "/offline",
  /*
    A shared reel — yuvoy-app#36.

    Not private in the sense the rest of this list is: anybody with the link
    may open it, which is the point of sharing one. It is here because the URL
    must never be INDEXED, for two reasons that both hold on their own.

    It is not stable. `GET /reels/{id}` answers 404 for any reel the feed would
    not show, so the address dies the day the listing pauses, sells out for the
    season or has its clip taken down — a normal Tuesday for an operator, and
    an indexed 404 to a crawler.

    And it would compete with the page that should win. The listing at
    `/e/{slug}` is the indexable asset and carries the same subject; a second
    URL about the same experience splits whatever authority it earns.
  */
  "/r/",
  /*
    A business's reel, playing — yuvoy-app#33. The same two reasons as `/r/`,
    one route deeper: the address dies with the clip, and `/o/{slug}` is the
    indexable page about the same business. Wildcarded because the slug sits in
    the middle, as `/e/*​/book` already does.
  */
  "/o/*/r/",
  /* A search result, playing — yuvoy-app#37. Same reasons again. */
  "/search/r/",
] as const;

/**
 * Routes that render no HTML at all, so there is no meta tag to carry.
 *
 * `/go/[code]` records a QR scan server-side and redirects; the response is a
 * 307, never a document. It is disallowed anyway — there is nothing there for
 * a crawler and it is reached from a printed card, not a link — but it cannot
 * be held to the noindex half of the rule, and `pnpm qa` checks that each of
 * these really does redirect rather than taking the exemption on trust.
 */
export const NON_PAGE_ROUTES = ["/go/"] as const;

/**
 * For a page that must never be indexed, whatever the deployment is.
 *
 * Distinct from `robotsMeta` on purpose: this one does not flip at the domain
 * launch, and writing it as a literal on the page hides that distinction.
 */
export const privateRobotsMeta: Metadata["robots"] = {
  index: false,
  follow: false,
};

/**
 * For a public route whose CONTENT is not ready — a guide still in draft or
 * review.
 *
 * The same directives, a different reason, and the distinction is load-bearing
 * rather than cosmetic: `/guides/[slug]` is a public, crawlable, indexable
 * route. One record on it is not ready yet. Marking that page
 * `privateRobotsMeta` would say the route is private, and `pnpm qa` would then
 * want it in PRIVATE_ROUTES and disallowed in robots.txt — which would hide
 * every published guide too.
 */
export const unpublishedRobotsMeta: Metadata["robots"] = {
  index: false,
  follow: false,
};

/**
 * For a public route whose page is the invite gate while the gate is on
 * (yuvoy-api#195): `/search`, today. See `GATED_FROM_INDEX` in
 * `lib/site/access.ts`, which decides WHICH routes carry it.
 *
 * `noindex`, because a crawler is a signed-out visitor and the page it is
 * served says "sign in": a gate in a search result is worse than no result.
 *
 * `follow`, and that is deliberate on two counts. The gate is not a secret,
 * and the links on it (the guides, the front door) are ones worth finding.
 * And it keeps this policy distinguishable from both site-wide ones, which is
 * what lets the production audit tell "left the index because it is gated"
 * from "noindex because the whole site is": before launch the site says
 * `noindex, nofollow`, after it `index, follow`, and this says neither.
 *
 * Not in `PRIVATE_ROUTES` and not disallowed in `robots.txt`: a crawler that
 * is refused the page never reads the `noindex` on it, and a URL it already
 * knows would stay in the index with no page behind it.
 */
export const gatedRobotsMeta: Metadata["robots"] = {
  index: false,
  follow: true,
};

/**
 * A page's `robots`, for a route that may be behind the invite gate.
 *
 * Returns nothing at all when the route is not gated, so the page inherits
 * the app-wide `robotsMeta` exactly as it did before the gate existed, and
 * the pair of halves stays derived from one place rather than two ternaries
 * on two pages. `GATED_FROM_INDEX` in `lib/site/access.ts` is the list, and
 * `sitemap.ts` reads the same list through `SITEMAP_FIXED_ROUTES`, so a route
 * cannot say `noindex` and stay in the sitemap.
 *
 * Spread into a page's metadata:
 *
 *     export const metadata: Metadata = {
 *       ...pageMetadata({ ... }),
 *       ...gatedRobots("/search"),
 *     };
 */
export function gatedRobots(path: string): Pick<Metadata, "robots"> {
  return isGatedFromIndex(path) ? { robots: gatedRobotsMeta } : {};
}
