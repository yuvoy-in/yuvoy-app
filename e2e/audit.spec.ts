import { test, expect } from "@playwright/test";

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
 * `PLAYWRIGHT_BASE_URL=https://app.yuvoy.in pnpm test:e2e e2e/audit.spec.ts e2e/audit-pages.spec.ts`
 * runs this file and `audit-pages.spec.ts` against the live site, and both
 * run after every production deploy.
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

import {
  ALLOWED_JSONLD_TYPES,
  BANNED_JSONLD_KEYS,
  meta,
  sitemapPaths,
} from "./support/audit";

test.describe("the rendered audit", () => {
  test("the inventory the sitemap publishes is the one we intend", async ({
    request,
  }) => {
    const paths = await sitemapPaths(request);
    const home = await (await request.get("/")).text();
    const sitePolicy = meta(home, "robots");

    // The fixed indexable routes, from lib/site/inventory.ts. Named here
    // rather than imported so this suite stays a black-box check of a running
    // origin — importing the app's own module would let a wrong inventory
    // agree with itself.
    for (const required of ["/", "/guides"]) {
      expect(paths, `${required} must be in the sitemap`).toContain(required);
    }

    /*
      `/search` IS CONDITIONAL, and the condition is its own robots tag.

      The invite gate (yuvoy-api#195) takes it out of the index while it is
      on: a crawler is a signed-out visitor, so the route serves it the gate,
      and a gate in a search result under the word Search is worse than no
      result. Both halves derive from `GATED_FROM_INDEX`, and this is the
      check that they agree on a LIVE origin, which is the only place the
      deployed switch exists.

      Compared against the SITE's policy rather than tested for the word
      "index", because before launch the whole app is `noindex, nofollow` and
      `/search` is still in the sitemap, correctly. The gate's own policy is
      `noindex, follow`, which matches neither site-wide answer, so "differs
      from the site's" is exactly "this route is gated". `indexing.test.ts`
      pins that the three policies stay distinguishable.
    */
    const searchPolicy = meta(
      await (await request.get("/search")).text(),
      "robots",
    );
    const searchGated = searchPolicy !== sitePolicy;
    expect(
      paths.includes("/search"),
      `/search says "${searchPolicy}" while the site says "${sitePolicy}", so ` +
        `it is ${searchGated ? "gated and must NOT be" : "not gated and must be"} ` +
        `in the sitemap`,
    ).toBe(!searchGated);
    if (searchGated) {
      // And it is the gate's policy, not some third thing nobody intended.
      expect(searchPolicy, "a gated route is noindex, follow").toMatch(
        /^noindex,\s*follow$/,
      );
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

    /*
      A draft guide renders for a reviewer and is never indexed. Listing one
      invites a crawler to exactly what the review gate holds back.

      Two checks, and neither is "the page does not say noindex". That was
      true of a published guide only by accident: it rendered NO robots tag,
      while every other page carried the site-wide one, so before launch (when
      the whole app is noindex) a live guide was the one page that said
      nothing. A published guide now carries the site-wide policy, which
      before launch IS noindex, so the old check failed every guide.

      - The draft banner, which a draft or review record always renders and a
        published guide never does. It holds with indexing on or off.
      - The same robots policy as the home page: a guide in the sitemap is as
        indexable as the rest of the site, never less.
    */
    const guides = paths.filter((p) => p.startsWith("/guides/"));
    for (const g of guides) {
      const res = await request.get(g);
      const html = await res.text();
      expect(
        html.includes("It is not indexed and"),
        `${g} is in the sitemap but renders as a draft`,
      ).toBe(false);
      expect(
        meta(html, "robots"),
        `${g} is in the sitemap but its robots policy is not the site's`,
      ).toBe(sitePolicy);
    }

    /*
      Businesses (yuvoy-app#116 item 5). The sitemap carried none, because
      the catalog index enumerates none; they are read off the listings on
      sale now. Each is as indexable as the rest of the site, and the test
      below holds every one to a 200 with no redirect.

      Required only where the sitemap has listings too. Both are read from
      the API while the sitemap is built, and the e2e build reads none (its
      mocks start with the server, after the build), so there it has neither
      and `business-sitemap.test.ts` holds the derivation. On a live origin,
      a listing on sale with no business beside it is the failure this
      exists to catch.
    */
    const businesses = paths.filter((p) => /^\/o\/[^/]+$/.test(p));
    const listings = paths.filter((p) => /^\/e\/[^/]+$/.test(p));
    if (listings.length > 0) {
      expect(
        businesses.length,
        "a business with a listing on sale must be in the sitemap",
      ).toBeGreaterThan(0);
    }
    for (const b of businesses) {
      const html = await (await request.get(b)).text();
      expect(
        meta(html, "robots"),
        `${b} is in the sitemap but its robots policy is not the site's`,
      ).toBe(sitePolicy);
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

      /*
        The brand once, never twice.

        `layout.tsx` appends " · Yuvoy" through the title template, so a page
        whose own title already carries the brand renders "Search Yuvoy ·
        Yuvoy". Nothing fails when that happens, because a title is not
        load-bearing — which is why it needs a check rather than a reader. The
        same check found `/contact` doing exactly this over in yuvoy-web.

        Here rather than in `seo.spec.ts`: that file pins five routes to exact
        titles, so a stricter assertion always fires first and this one could
        never run. This test walks the whole sitemap, which is where a title
        nobody looked at actually lives.

        Counted rather than pattern-matched, so a compound brand stays one.
      */
      const brand = (title!.match(/Yuvoy/g) ?? []).length;
      expect(brand, `${path} names the brand ${brand} times: "${title}"`).toBe(
        1,
      );

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
});
