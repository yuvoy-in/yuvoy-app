import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * The guide hero is the page's LCP, so it must not be lazy-loaded.
 *
 * It sits directly under the title at full width, which makes it the largest
 * element on every viewport that shows more than the headline. A lazy image
 * is skipped by the browser's preload scanner and only fetched after layout
 * confirms it is on screen, so `loading="lazy"` here deferred the one image the
 * page is judged on. It shipped that way.
 *
 * Read from source rather than rendered: the page is an async server
 * component over MDX, and the property worth pinning is a single attribute on
 * one tag, which a render would only reach the long way round.
 */
const PAGE = join(process.cwd(), "src/app/guides/[slug]/page.tsx");

/** The one `<img>` tag carrying the hero, whole. */
function heroTag(): string {
  const src = readFileSync(PAGE, "utf8");
  const match = src.match(/<img\b[^>]*src=\{guide\.hero\.src\}[^>]*>/);
  if (!match) throw new Error("the guide hero <img> could not be found");
  return match[0];
}

describe("the guide hero", () => {
  it("is not lazy-loaded", () => {
    expect(heroTag()).not.toMatch(/loading=["']lazy["']/);
  });

  it("asks for high fetch priority", () => {
    expect(heroTag()).toMatch(/fetchPriority=["']high["']/);
  });
});
