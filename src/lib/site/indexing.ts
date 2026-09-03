import type { Metadata } from "next";

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
  // Checkout. A URL with a `?slot=` on it, holding an idempotency key.
  // Wildcards are matched by every crawler that matters, and the page carries
  // `privateRobotsMeta` for the ones that ignore robots.txt entirely.
  "/e/*/book",
  "/trip/",
  "/trips",
  "/account",
  "/offline",
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
