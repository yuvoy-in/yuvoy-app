import { test, expect } from "@playwright/test";

import { meta, sitemapPaths } from "./support/audit";

/**
 * The second half of the rendered audit, then the security headers and the
 * privacy and terms links. Moved here from `audit.spec.ts` (yuvoy-app#243)
 * with no test changed. Read-only like that file and run with it against
 * production after every deploy: see its header for why every request here
 * is a GET.
 */

test.describe("the rendered audit", () => {
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

  test("the front door resolves its feed on the SERVER, not in the browser", async ({
    request,
  }) => {
    /*
      The homepage prefetches the first page of reels in a Server Component and
      hands it to the client as `initialData`, so the first cards are in the
      HTML. That is a measured decision, not a preference: when the feed was
      client-rendered, FCP was 0.8s and **LCP was 5.1s** on a throttled
      mid-range profile, because the LCP element is a card's headline and
      nothing existed until the bundle downloaded and hydrated.

      `firstReelsPage()` gives up on every failure and returns null on
      purpose: a feed that cannot be prefetched still renders, because
      failing the page would turn a slow API into a broken one. The cost of
      that kindness is that the failure is **silent on the page**: it is a
      200, every heading and canonical and structured-data check above
      passes, and the only symptom is a number in a lab report nobody is
      running.

      So this asserts the one thing those checks cannot see: that the server
      resolved the feed to SOMETHING. Cards, or the honest empty state, or an
      error — any of those is a server that did its job. The skeleton is not:
      it means the prefetch came back null and the work was handed to the
      browser on a 0.5 Mbps island connection.

      Found on 6 September against production, after the feed moved to
      `GET /v1/reels`. Nothing in this suite could tell a working front door
      from one that had been showing a loading state to every traveller.
    */
    const res = await request.get("/");
    expect(res.status(), "the front door must serve").toBe(200);
    const html = await res.text();

    const resolved = {
      cards: /aria-posinset=/.test(html),
      empty: html.includes("Nothing bookable here yet"),
      error: html.includes("Booking is paused") || html.includes("Try again"),
      /*
        THE INVITE LANDING IS A RESOLVED FRONT DOOR TOO (yuvoy-api#195).

        With the gate on, a signed-out visitor and a crawler are served the
        landing instead of the feed, and the feed's first page is deliberately
        not even fetched for somebody who will not see it. That is the server
        doing its job, not failing to: the thing this check exists to catch is
        a SKELETON, which means the prefetch returned null and the work was
        handed to a browser on an island connection.

        Keyed on the attribute the gate puts in the HTML rather than on its
        copy, so rewording the landing never turns this into a false alarm.
      */
      landing: html.includes('data-invite-gate="page"'),
    };

    expect(
      resolved.cards || resolved.empty || resolved.error || resolved.landing,
      "the homepage served a loading skeleton, which means the server-side " +
        "prefetch returned null and the feed is being fetched by the browser " +
        "instead. Check the API is reachable from the deployment at request " +
        "time — this is invisible to every other check in this file.",
    ).toBe(true);
  });

  test("Search resolves its first page on the SERVER too", async ({
    request,
  }) => {
    /*
      The same decision, measured on Search (production readiness, 6 Oct
      2026): its grid was fetched only once the page had hydrated, so its
      first tile, the LCP, was the slowest first paint in the app at 4.2s on
      the same throttled profile. The server now sends the first page with
      the HTML, and gives up on it just as quietly when the API cannot
      answer in time.
    */
    const res = await request.get("/search");
    expect(res.status(), "Search must serve").toBe(200);
    const html = await res.text();
    const resolved =
      html.includes('aria-label="Search results"') ||
      html.includes("No matches") ||
      html.includes('data-invite-gate="page"');
    expect(
      resolved,
      "Search served its loading skeleton, which means the server-side " +
        "prefetch returned null and the grid is being fetched by the browser " +
        "instead. Check the API is reachable from the deployment at request " +
        "time.",
    ).toBe(true);
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

/**
 * Security headers, asserted against a running origin — yuvoy-app#23.
 *
 * Read-only GETs, so this runs against production the same way the rest of
 * this file does. That matters more than usual here: `next.config.ts` builds
 * the policy from environment variables, so the only place the real policy
 * exists is a deployed response. A green unit test on the builder says the
 * string is right; only this says the string arrived.
 */
test.describe("security headers", () => {
  test("every response carries the enforced policy", async ({ request }) => {
    const res = await request.get("/");
    const headers = res.headers();

    /*
      The WHOLE policy is enforced as of 9 Sep 2026 — yuvoy-app#23. It shipped
      report-only in the morning and was enforced the same day against this
      suite rather than a waiting period: 91 tests drive the real production
      build in a real browser, so a directive that blocks anything they touch
      fails here rather than in front of a traveller.
    */
    const enforced = headers["content-security-policy"] ?? "";
    expect(enforced).toContain("default-src 'none'");
    expect(enforced).toContain("connect-src");
    expect(enforced).toContain("frame-ancestors 'none'");
    expect(enforced).not.toContain("'unsafe-eval'");
    expect(headers["x-frame-options"]).toBe("DENY");
    expect(headers["strict-transport-security"]).toContain("max-age=");
    expect(headers["x-content-type-options"]).toBe("nosniff");
    expect(headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
  });

  test("the policy can still play a clip", async ({ request }) => {
    const policy =
      (await request.get("/")).headers()[
        "content-security-policy-report-only"
      ] ?? "";

    // The directive the issue is actually about.
    expect(policy).toMatch(/connect-src [^;]*'self'/);
    // Cloudflare Stream in all three places it is needed. Missing one of them
    // is a feed of black rectangles, and report-only is where that is found.
    for (const d of ["img-src", "media-src", "connect-src"]) {
      const found = policy.split("; ").find((x) => x.startsWith(`${d} `)) ?? "";
      expect(found, `${d} must allow Cloudflare Stream`).toContain(
        "cloudflarestream.com",
      );
    }
    // Nothing that would make the policy decorative.
    expect(policy).not.toContain("'unsafe-eval'");
    expect(policy).toContain("default-src 'none'");
  });

  test("the enforced and reported policies are the same", async ({
    request,
  }) => {
    /*
      Both headers carry one directive list. Report-only is kept alongside the
      enforced copy on purpose: it is what turns a production block into a
      console line naming the directive that did it, which an enforced-only
      header does not give you.

      Divergence means somebody narrowed one and not the other, and the
      enforced copy would then be silently stricter than anything anybody ever
      saw a report for.
    */
    const headers = (await request.get("/")).headers();
    expect(headers["content-security-policy-report-only"]).toBe(
      headers["content-security-policy"],
    );
  });
});

/**
 * The privacy policy and the terms are reachable — yuvoy-app#15.
 *
 * This app collects a health-screener answer at checkout and a phone number
 * with it, and linked to neither from anywhere. A policy that is not reachable
 * from where the data is given is not a policy anybody relied on.
 *
 * Asserted against the SERVER-RENDERED HTML rather than a hydrated page,
 * because the first version of this shipped inside a branch that only renders
 * after IndexedDB is read — so `/account` prerendered to its loading shell
 * with the links nowhere in it. A link that exists only after hydration is one
 * a crawler, a reader with JavaScript off, and anybody reading the source
 * cannot find.
 */
test("the app links to a privacy policy and to terms", async ({ request }) => {
  const html = await (await request.get("/account")).text();
  expect(html).toContain("https://yuvoy.in/privacy");
  expect(html).toContain("https://yuvoy.in/terms");
});
