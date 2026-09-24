import { describe, it, expect, vi, afterEach } from "vitest";

/**
 * The two halves of the indexing switch, pinned to each other.
 *
 * `robots.txt` and the `<meta name="robots">` tag are one decision expressed
 * twice. They disagreed: the layout hardcoded `index: false` while robots.txt
 * read the flag, so the cutover would have opened crawling on a site whose
 * every page still said noindex — crawled, and unindexable, and it looks like
 * it worked.
 */

async function load(allow: string, inviteOnly = "false") {
  vi.resetModules();
  vi.stubEnv("NEXT_PUBLIC_ALLOW_INDEXING", allow);
  vi.stubEnv("NEXT_PUBLIC_INVITE_ONLY", inviteOnly);
  const indexing = await import("./indexing");
  const inventory = await import("./inventory");
  const access = await import("./access");
  const robots = (await import("@/app/robots")).default;
  const sitemap = (await import("@/app/sitemap")).default;
  return { indexing, inventory, access, robots: robots(), sitemap };
}

/** The fixed paths the sitemap actually publishes, for a loaded module set. */
async function sitemapPaths(loaded: Awaited<ReturnType<typeof load>>) {
  const entries = await loaded.sitemap();
  return entries.map((e) => new URL(e.url).pathname);
}

afterEach(() => vi.unstubAllEnvs());

describe("the indexing switch", () => {
  it("refuses on both sides when the flag is off", async () => {
    const { indexing, robots } = await load("false");

    expect(indexing.INDEXABLE).toBe(false);
    expect(indexing.robotsMeta).toMatchObject({ index: false, follow: false });
    expect(robots.rules).toEqual([{ userAgent: "*", disallow: "/" }]);
    // A sitemap on a fully disallowed host is an invitation nobody can accept.
    expect(robots.sitemap).toBeUndefined();
  });

  it("allows on both sides when the flag is on", async () => {
    const { indexing, robots } = await load("true");

    expect(indexing.INDEXABLE).toBe(true);
    expect(indexing.robotsMeta).toMatchObject({ index: true, follow: true });
    const rule = Array.isArray(robots.rules) ? robots.rules[0] : robots.rules;
    expect(rule.allow).toBe("/");
    expect(robots.sitemap).toMatch(/\/sitemap\.xml$/);
  });

  it("sets the preview directives only once indexing is on", async () => {
    const off = await load("false");
    expect(off.indexing.robotsMeta).not.toHaveProperty("googleBot");

    const on = await load("true");
    expect(on.indexing.robotsMeta).toMatchObject({
      googleBot: {
        "max-image-preview": "large",
        "max-snippet": -1,
        "max-video-preview": -1,
      },
    });
  });

  it("keeps the private routes out even when indexing is on", async () => {
    const { robots } = await load("true");
    const rule = Array.isArray(robots.rules) ? robots.rules[0] : robots.rules;
    // A booking status token lives in a URL. None of these may be crawled.
    expect(rule.disallow).toEqual(
      expect.arrayContaining(["/booking", "/trip/", "/trips", "/account"]),
    );
  });

  /**
   * The two reel routes, and the one page that is not one — yuvoy-app#33, #36.
   *
   * Pinned here rather than in an e2e, and that is the point: before launch the
   * whole app carries a site-wide `noindex, nofollow`, so a rendered page
   * cannot show the difference between "private for its own reasons" and "the
   * site is not live yet". The distinction only exists in these two lists, and
   * only becomes visible on the day `INDEXABLE` flips — which is the worst
   * possible day to discover a page was in the wrong one.
   */
  it("keeps both reel routes private, for reasons that outlive the launch flip", async () => {
    const { robots, indexing } = await load("true");
    const rule = Array.isArray(robots.rules) ? robots.rules[0] : robots.rules;

    /*
      A reel's address dies when its listing pauses or sells out for the
      season, so an indexed one becomes a 404 on a normal Tuesday. And the
      listing or the business is the page that should win the same search.
    */
    expect(rule.disallow).toEqual(expect.arrayContaining(["/r/", "/o/*/r/"]));
    expect(indexing.PRIVATE_ROUTES).toEqual(
      expect.arrayContaining(["/r/", "/o/*/r/"]),
    );
  });

  it("keeps what a business runs indexable, because the content moved there", async () => {
    const { indexing, inventory } = await load("true");

    // The listings came OFF the profile, so this is where that content lives
    // and there is no duplicate for it to compete with.
    expect(inventory.INDEXABLE_DYNAMIC_ROUTES).toContain("/o/[slug]/listings");
    for (const priv of indexing.PRIVATE_ROUTES) {
      expect("/o/hc-diving-skl/listings".startsWith(priv)).toBe(false);
    }
  });
});

/**
 * `/search` while the invite gate is on (yuvoy-api#195).
 *
 * Two halves of one answer again, and the same failure mode as robots.txt and
 * the meta tag: a route whose own tag says `noindex` and which is still in the
 * sitemap is a crawler invited to a page that refuses to be indexed, and
 * nothing about that fails on its own. Both derive from `GATED_FROM_INDEX`,
 * and these are the assertions that keep them derived from it.
 */
describe("a route the invite gate takes out of the index", () => {
  it("changes nothing at all with the switch off", async () => {
    const off = await load("true", "false");

    expect(off.access.GATED_FROM_INDEX).toEqual([]);
    expect(off.indexing.gatedRobots("/search")).toEqual({});
    expect(off.inventory.SITEMAP_FIXED_ROUTES.map((r) => r.path)).toEqual(
      off.inventory.INDEXABLE_FIXED_ROUTES.map((r) => r.path),
    );
    expect(await sitemapPaths(off)).toContain("/search");
  });

  it("says noindex and leaves the sitemap with the switch on", async () => {
    const on = await load("true", "true");

    expect(on.access.GATED_FROM_INDEX).toEqual(["/search"]);
    expect(on.indexing.gatedRobots("/search")).toEqual({
      robots: { index: false, follow: true },
    });
    expect(on.inventory.SITEMAP_FIXED_ROUTES.map((r) => r.path)).not.toContain(
      "/search",
    );
    expect(await sitemapPaths(on)).not.toContain("/search");
  });

  it("keeps the front door indexed and in the sitemap, gate or no gate", async () => {
    /*
      `/` is deliberately not gated FROM THE INDEX even though it is gated: a
      crawler there gets the invite landing, which is a page written for
      exactly that reader. Taking the front door out of the index for a season
      is a cost nothing here is worth.
    */
    for (const flag of ["false", "true"]) {
      const loaded = await load("true", flag);
      expect(loaded.access.isGatedFromIndex("/")).toBe(false);
      expect(loaded.indexing.gatedRobots("/")).toEqual({});
      expect(await sitemapPaths(loaded), flag).toContain("/");
    }
  });

  it("stays out of robots.txt, because a blocked page is never read", async () => {
    const on = await load("true", "true");
    const rule = Array.isArray(on.robots.rules)
      ? on.robots.rules[0]
      : on.robots.rules;

    // A crawler refused the page never reads the noindex on it, and a URL it
    // already knows would stay in the index with nothing behind it.
    expect(rule.disallow).not.toContain("/search");
    expect(on.indexing.PRIVATE_ROUTES).not.toContain("/search");
  });

  it("is a policy the production audit can tell from both site-wide ones", async () => {
    /*
      `e2e/audit.spec.ts` decides "this route is gated" by comparing its tag
      with the site's own, so the gate's policy has to differ from BOTH: from
      `noindex, nofollow` before launch and from `index, follow` after it. If
      it ever matched either, the audit would read a gated route as an
      ungated one and never notice it had left the sitemap.
    */
    const gated = { index: false, follow: true };
    expect((await load("false")).indexing.robotsMeta).not.toMatchObject(gated);
    expect((await load("true")).indexing.robotsMeta).not.toMatchObject(gated);
    expect((await load("true", "true")).indexing.gatedRobotsMeta).toEqual(
      gated,
    );
  });

  it("publishes exactly the fixed routes that are not gated", async () => {
    // The invariant itself, rather than the one route that has it today.
    for (const flag of ["false", "true"]) {
      const loaded = await load("true", flag);
      const published = await sitemapPaths(loaded);
      for (const route of loaded.inventory.INDEXABLE_FIXED_ROUTES) {
        const gated = loaded.access.isGatedFromIndex(route.path);
        expect(
          published.includes(route.path),
          `${route.path} (gate ${flag})`,
        ).toBe(!gated);
        expect(
          loaded.indexing.gatedRobots(route.path),
          `${route.path} (gate ${flag})`,
        ).toEqual(gated ? { robots: loaded.indexing.gatedRobotsMeta } : {});
      }
    }
  });
});
