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
  const robots = (await import("@/app/robots")).default;
  return { indexing, robots: robots() };
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
});
