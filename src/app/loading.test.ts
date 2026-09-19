import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, dirname, relative } from "node:path";

/**
 * Every dynamic route reaches a loading boundary.
 *
 * ## The defect this exists for
 *
 * This app shipped twenty-one routes and zero `loading.tsx` files, and that
 * one fact is what "clicking a nav link lags and opens after some time" was.
 * Two separate mechanisms, both documented framework behaviour:
 *
 *   - **Prefetching is SKIPPED for a dynamic route with no loading boundary.**
 *     Next will partially prefetch one that has a boundary, and prefetch
 *     nothing at all for one that does not. So the most-tapped screen in the
 *     app started every navigation cold.
 *   - **With no boundary to fall back to, the router shows nothing.** It keeps
 *     the previous screen on the glass until the new one has finished
 *     rendering on the server. No spinner, no skeleton — the tap looks
 *     ignored, and the longer the server takes the more broken it looks.
 *
 * ## Why a test and not a note
 *
 * Nothing else fails. The build passes, every unit test passes, the e2e suite
 * passes, and the screen is correct once it arrives — it is only *slow*, and
 * only on a real network. The one moment this is cheap to notice is the moment
 * a dynamic route is added, which is exactly when this fires.
 *
 * ## And the rule that has to be held against it
 *
 * A boundary makes the route STREAM, and the HTTP status goes out with the
 * first flushed byte. A page that calls `notFound()` after an await therefore
 * answers **200** with the not-found screen inside it. That was measured in
 * yuvoy-operator, where the first version of this change turned five detail
 * routes from 404 into 200 and eleven e2e tests caught it.
 *
 * Here it matters more, not less: `/e/[slug]`, `/guides/[slug]` and `/o/[slug]`
 * are public and crawled, and a soft 404 is a page Google indexes as real. So
 * seven routes in this app must stay unstreamed, and the feed's boundary is
 * scoped by a `(feed)` route group rather than sitting at the root, where it
 * would have covered every one of them.
 *
 * A route counts as covered by the NEAREST boundary at or above it, because
 * that is how Suspense nests. The test walks upward rather than demanding a
 * file per route, so a segment happy with an inherited fallback needs nothing.
 */

const APP = join(process.cwd(), "src/app");

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

const FILES = walk(APP);

/** Page files, excluding API route handlers and the metadata conventions. */
const PAGES = FILES.filter((f) => /\/page\.tsx$/.test(f));

/**
 * Is this page rendered per request?
 *
 * `force-dynamic` is the explicit declaration and is what every dynamic route
 * here uses. A page that becomes dynamic by awaiting `cookies()` or `headers()`
 * instead would not be caught by this string test — which is a real limit, and
 * the reason the rule is stated in the comment above as well as pinned here.
 */
const isDynamic = (file: string) =>
  /export const dynamic\s*=\s*["']force-dynamic["']/.test(
    readFileSync(file, "utf8"),
  );

/** The nearest `loading.tsx` at or above a page, or null. */
function boundaryFor(page: string): string | null {
  let dir = dirname(page);
  for (;;) {
    if (FILES.includes(join(dir, "loading.tsx")))
      return join(dir, "loading.tsx");
    if (dir === APP) return null;
    dir = dirname(dir);
  }
}

const rel = (f: string) => relative(process.cwd(), f);

/** `src/app/(feed)/page.tsx` -> `/`; groups do not appear in the URL. */
const routeOf = (page: string) =>
  "/" +
  relative(APP, dirname(page))
    .split("/")
    .filter((s) => s && !(s.startsWith("(") && s.endsWith(")")))
    .join("/");

/**
 * Scan CODE, not prose. A comment explaining that a child route calls
 * `notFound()` is not a call to it, and a scanner that cannot tell the two
 * apart fails routes that obey the rule — which teaches people to delete the
 * explanation rather than keep the rule. `palette.test.ts` documents the same
 * trap; yuvoy-operator hit it for real.
 */
const stripComments = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

const canNotFound = (file: string) =>
  /\bnotFound\(\)/.test(stripComments(readFileSync(file, "utf8")));

/**
 * Routes that must NOT stream, and why each one is on the list.
 *
 * Both reasons were measured, not reasoned about, and both cost more than a
 * boundary buys on the route concerned.
 */
const MUST_NOT_STREAM: Record<string, string> = {
  /*
    The media ground. A boundary makes the segment stream, and React streams it
    by rendering into a hidden container at the end of `<body>` and swapping it
    into `<main>` with an inline script. On the feed that reliably produced
    React #418 — a hydration mismatch — in WebKit, reproduced both with the
    real skeleton and with a fallback containing no client components, so it is
    the streaming and not the markup. A mismatch throws away the server-
    rendered first page, which is the whole reason this route is not static
    (see `page.tsx`: client-rendering it measured LCP 5.1s). `hydration.spec.ts`
    is what catches a re-attempt.
  */
  "/": "streaming the feed breaks hydration in WebKit (React #418)",
  "/r/[id]": "same media ground as the feed, and it can answer 404",
  "/search/r/[id]": "same media ground as the feed",
};

describe("loading boundaries", () => {
  /*
    Every dynamic route gets a boundary unless it is on one of the two exempt
    lists — it can answer 404, or it is media ground. Stated as a single rule
    rather than a list of the covered ones, so a route added tomorrow is
    covered by default and an exemption has to be argued for in writing.
  */
  it("cover every dynamic route that is allowed to stream", () => {
    const uncovered = PAGES.filter(isDynamic)
      .filter((page) => !canNotFound(page))
      .filter((page) => !(routeOf(page) in MUST_NOT_STREAM))
      .filter((page) => boundaryFor(page) === null)
      .map(rel);

    expect(uncovered).toEqual([]);
  });

  /*
    The exemptions are real routes. A typo in the table above would silently
    exempt nothing and the rule would look satisfied while the route it was
    meant to describe went uncovered.
  */
  it("exempt only routes that exist", () => {
    const routes = new Set(PAGES.map(routeOf));
    const stale = Object.keys(MUST_NOT_STREAM).filter((r) => !routes.has(r));

    expect(stale).toEqual([]);
  });

  it("keep every exempt route unstreamed", () => {
    const streamed = PAGES.filter((p) => routeOf(p) in MUST_NOT_STREAM)
      .filter((p) => boundaryFor(p) !== null)
      .map((p) => `${routeOf(p)}: ${MUST_NOT_STREAM[routeOf(p)]}`);

    expect(streamed).toEqual([]);
  });

  /*
    THE ONE THAT MATTERS MOST HERE. A boundary above a `notFound()` streams a
    200 shell and the status can never be corrected afterwards. On a public,
    crawled route that is a soft 404 — a missing experience page that Google
    indexes as a real one. Putting `loading.tsx` back at the root would do it
    to all seven at once, which is exactly why the feed's lives in a group.
  */
  it("never sit above a route that can answer 404", () => {
    const streamed = PAGES.filter(canNotFound)
      .map((page) => {
        const b = boundaryFor(page);
        return b ? `${routeOf(page)} would stream via ${rel(b)}` : null;
      })
      .filter(Boolean);

    expect(streamed).toEqual([]);
  });

  /*
    A fallback that renders nothing is worse than no fallback: it blanks the
    screen instead of holding the old one, and it still satisfies the check
    above. Every boundary has to actually draw one of the two chassis.
  */
  it("draw a real chassis rather than an empty element", () => {
    const empty = FILES.filter((f) => /\/loading\.tsx$/.test(f))
      .filter((f) => !/SheetSkeleton/.test(readFileSync(f, "utf8")))
      .map(rel);

    expect(empty).toEqual([]);
  });
});
