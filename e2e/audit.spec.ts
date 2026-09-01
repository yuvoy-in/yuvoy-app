import { test, expect, type APIRequestContext } from "@playwright/test";

/**
 * The rendered audit, driven by the sitemap rather than by a list in this file.
 *
 * ## Why it reads the sitemap
 *
 * There used to be a hand-copied array of indexable URLs here, beside the
 * sitemap's own array. Two lists of the same thing drift the moment a page is
 * added, and the drift is silent in the worst direction: a page that renders
 * perfectly and is in no sitemap is a page nobody finds, and nothing fails.
 *
 * So this suite asks the running origin for `/sitemap.xml` and audits whatever
 * is in it — the same thing a crawler does, and the only version of the check
 * that can be pointed at production. The inventory's *completeness* is guarded
 * separately and statically by `pnpm qa`.
 *
 * ## Why it is read-only
 *
 * `PLAYWRIGHT_BASE_URL=https://app.yuvoy.in pnpm test:e2e e2e/audit.spec.ts`
 * runs this against the live site, and it runs after every production deploy.
 * So it may never create a reservation, POST anything, or touch a booking.
 * Every request here is a GET. The write-bearing specs live in
 * `money-loop.spec.ts` and are never pointed at production.
 *
 * ## Why sitemap URLs are re-based
 *
 * The sitemap is absolute and built from `NEXT_PUBLIC_SITE_URL`, so on a
 * preview or a localhost build it names `app.yuvoy.in` while the app under
 * test is somewhere else entirely. Only the PATH is taken from each entry.
 */

const ALLOWED_JSONLD_TYPES = new Set([
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
const BANNED_JSONLD_KEYS =
  /"(aggregateRating|ratingValue|reviewCount|offers|price|priceCurrency|availability)"/;

async function sitemapPaths(request: APIRequestContext): Promise<string[]> {
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

function meta(html: string, key: string): string | undefined {
  return (
    html.match(
      new RegExp(`<meta property="${key}" content="([^"]*)"`, "i"),
    )?.[1] ??
    html.match(new RegExp(`<meta name="${key}" content="([^"]*)"`, "i"))?.[1]
  );
}

test.describe("the rendered audit", () => {
  test("the inventory the sitemap publishes is the one we intend", async ({
    request,
  }) => {
    const paths = await sitemapPaths(request);

    // The three fixed indexable routes, from lib/site/inventory.ts. Named here
    // rather than imported so this suite stays a black-box check of a running
    // origin — importing the app's own module would let a wrong inventory
    // agree with itself.
    for (const required of ["/", "/search", "/guides"]) {
      expect(paths, `${required} must be in the sitemap`).toContain(required);
    }

    // Nothing private, ever. Each of these is keyed by a secret, personal, or
    // machinery, and a sitemap entry is an invitation.
    for (const p of paths) {
      expect(
        /^\/(booking|trips|account|offline|go\/|trip\/)/.test(p),
        `${p} is private and must not be in the sitemap`,
      ).toBe(false);
      expect(
        /\/book$/.test(p),
        `${p} is checkout and must not be in the sitemap`,
      ).toBe(false);
    }

    // A draft guide renders locally for a reviewer and is noindex. Listing one
    // invites a crawler to exactly what the review gate holds back.
    const guides = paths.filter((p) => p.startsWith("/guides/"));
    for (const g of guides) {
      const res = await request.get(g);
      const html = await res.text();
      expect(
        meta(html, "robots") ?? "",
        `${g} is in the sitemap but is noindex`,
      ).not.toMatch(/noindex/);
    }

    // No duplicates. A URL listed twice is a crawl budget spent twice.
    expect(new Set(paths).size, "the sitemap must not repeat a URL").toBe(
      paths.length,
    );
  });

  test("every sitemap URL is a 200 with no redirect", async ({ request }) => {
    for (const path of await sitemapPaths(request)) {
      const res = await request.get(path, { maxRedirects: 0 });
      expect(res.status(), `${path} must answer 200 directly`).toBe(200);
    }
  });

  test("every sitemap URL describes itself, and describes itself uniquely", async ({
    request,
  }) => {
    const paths = await sitemapPaths(request);
    const seen = new Map<string, string>();

    for (const path of paths) {
      const html = await (await request.get(path)).text();

      const title = html.match(/<title>([^<]*)<\/title>/)?.[1];
      const description = meta(html, "description");
      const canonical = html.match(/<link rel="canonical" href="([^"]*)"/)?.[1];

      expect(title, `${path} has no <title>`).toBeTruthy();
      expect(description, `${path} has no description`).toBeTruthy();
      expect(canonical, `${path} has no canonical`).toBeTruthy();

      // Self-canonical. A canonical pointing at another page is a page asking
      // not to be indexed, which is not what any of these want.
      expect(
        new URL(canonical!, "http://x").pathname.replace(/\/$/, "") || "/",
        `${path} canonical points elsewhere`,
      ).toBe(path.replace(/\/$/, "") || "/");

      // Route-specific Open Graph and Twitter, complete. The failure this
      // pins: every route inheriting the root's, so a shared guide link
      // previews as the homepage.
      for (const key of [
        "og:title",
        "og:description",
        "og:url",
        "og:site_name",
        "og:image",
        "twitter:card",
        "twitter:title",
        "twitter:description",
      ]) {
        expect(meta(html, key), `${path} has no ${key}`).toBeTruthy();
      }
      expect(meta(html, "og:image"), `${path} og:image is relative`).toMatch(
        /^https?:\/\//,
      );

      // No two pages may claim the same identity.
      const identity = `${title}|${description}`;
      expect(
        seen.has(identity),
        `${path} reuses the identity of ${seen.get(identity)}`,
      ).toBe(false);
      seen.set(identity, path);
    }
  });

  test("every sitemap URL has exactly one H1 and no skipped heading level", async ({
    request,
  }) => {
    for (const path of await sitemapPaths(request)) {
      const html = await (await request.get(path)).text();
      const body = html.slice(html.indexOf("<body"));

      const h1s = [...body.matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1>/g)];
      expect(h1s.length, `${path} must have exactly one <h1>`).toBe(1);
      expect(
        h1s[0][1].replace(/<[^>]+>/g, "").trim(),
        `${path} has an empty <h1>`,
      ).not.toBe("");

      // Heading order. A jump from h1 to h3 is a document outline that a
      // screen reader and a crawler both read as a missing section.
      const levels = [...body.matchAll(/<h([1-6])\b/g)].map((m) =>
        Number(m[1]),
      );
      let previous = 0;
      for (const level of levels) {
        if (previous !== 0) {
          expect(
            level - previous,
            `${path} skips from h${previous} to h${level}`,
          ).toBeLessThanOrEqual(1);
        }
        previous = level;
      }
    }
  });

  test("every sitemap URL publishes only structured data we stand behind", async ({
    request,
  }) => {
    for (const path of await sitemapPaths(request)) {
      const html = await (await request.get(path)).text();

      const blocks = [
        ...html.matchAll(
          /<script type="application\/ld\+json">([\s\S]*?)<\/script>/g,
        ),
      ].map((m) => m[1].replace(/\\u003c/g, "<"));

      for (const raw of blocks) {
        // Unparseable JSON-LD is worse than none: it is a claim nobody can
        // read and nobody can check.
        let node: { "@type"?: string };
        expect(() => {
          node = JSON.parse(raw);
        }, `${path} has unparseable JSON-LD`).not.toThrow();
        node = JSON.parse(raw);

        expect(
          ALLOWED_JSONLD_TYPES.has(node["@type"] ?? ""),
          `${path} publishes @type ${node["@type"]}, which is not on the allowlist`,
        ).toBe(true);
      }

      // Structured data is a claim even though it is invisible on the page.
      expect(
        blocks.join(""),
        `${path} asserts a rating, review count, price or availability`,
      ).not.toMatch(BANNED_JSONLD_KEYS);
    }
  });

  test("every share image the pages name actually serves", async ({
    request,
  }) => {
    const seen = new Set<string>();

    for (const path of await sitemapPaths(request)) {
      const html = await (await request.get(path)).text();
      const image = meta(html, "og:image");
      if (!image || seen.has(image)) continue;
      seen.add(image);

      // Path only: the tag is absolute against NEXT_PUBLIC_SITE_URL, which may
      // name a different origin from the one under test.
      const res = await request.get(new URL(image).pathname);
      expect(res.status(), `${image} does not serve`).toBe(200);
      expect(
        res.headers()["content-type"] ?? "",
        `${image} is not an image`,
      ).toMatch(/^image\//);
    }
  });

  test("no page links to somewhere that is not there", async ({ request }) => {
    const paths = await sitemapPaths(request);
    const checked = new Map<string, number>();

    for (const path of paths) {
      const html = await (await request.get(path)).text();
      const body = html.slice(html.indexOf("<body"));

      const hrefs = [...body.matchAll(/href="(\/[^"#?]*)"/g)]
        .map((m) => m[1])
        .filter((h) => !h.startsWith("//"));

      for (const href of new Set(hrefs)) {
        if (!checked.has(href)) {
          const res = await request.get(href, { maxRedirects: 0 });
          checked.set(href, res.status());
        }
        // 200 or a deliberate redirect. A 404 from a link the page itself
        // renders is the cheapest possible SEO defect and the easiest to ship.
        expect(
          checked.get(href)! < 400,
          `${path} links to ${href}, which answers ${checked.get(href)}`,
        ).toBe(true);
      }
    }
  });

  test("no guide is an orphan", async ({ request }) => {
    const paths = await sitemapPaths(request);
    const guides = paths.filter((p) => /^\/guides\/.+/.test(p));
    if (guides.length === 0) test.skip();

    // Reachable from the hub, not only from the sitemap. A page a crawler can
    // find only in an XML file is a page a reader arriving anywhere else
    // cannot find at all.
    const hub = await (await request.get("/guides")).text();
    for (const g of guides) {
      expect(
        hub,
        `${g} is in the sitemap but not linked from /guides`,
      ).toContain(`href="${g}"`);
    }
  });

  test("robots.txt and the meta tag agree about indexing", async ({
    request,
  }) => {
    /*
      The bug this pins shipped and was caught on 1 Sep: robots.ts read
      NEXT_PUBLIC_ALLOW_INDEXING while the root layout hardcoded
      `index: false`. Flipping the flag at the domain cutover would have opened
      crawling on a site whose every page still said noindex — crawled,
      unindexable, and indistinguishable from success until somebody checked
      Search Console weeks later.

      Both halves are asserted against a LIVE origin here, because that is the
      only place the deployed configuration exists.
    */
    const robots = await (await request.get("/robots.txt")).text();
    const home = await (await request.get("/")).text();
    const tag = meta(home, "robots") ?? "";

    const robotsBlocksAll = /Disallow:\s*\/\s*$/m.test(robots);
    const pageSaysNoindex = /noindex/.test(tag);

    expect(
      robotsBlocksAll,
      `robots.txt ${robotsBlocksAll ? "blocks" : "allows"} crawling but the ` +
        `page says "${tag}" — these are two halves of one answer`,
    ).toBe(pageSaysNoindex);
  });
});
