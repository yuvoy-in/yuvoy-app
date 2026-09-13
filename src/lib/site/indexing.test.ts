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

async function load(allow: string) {
  vi.resetModules();
  vi.stubEnv("NEXT_PUBLIC_ALLOW_INDEXING", allow);
  const indexing = await import("./indexing");
  const inventory = await import("./inventory");
  const robots = (await import("@/app/robots")).default;
  return { indexing, inventory, robots: robots() };
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
