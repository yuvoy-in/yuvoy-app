import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

/**
 * The tagline is gone, and it stays gone.
 *
 * The owner asked on 13 September for the strapline off the reels feed. #41
 * took it off the feed masthead only, and it was still on search, trips,
 * account, every listing header, the desktop rail, the home-screen name and
 * the share card's alt text. The owner asked again on 14 September, for every
 * page this time (yuvoy-app#36).
 *
 * A component change alone would not hold. The strapline is baked into the
 * delivered lockup art, so it comes back through any of four doors: a second
 * `<Wordmark>` variant, a re-added SVG under `public/brand`, a metadata
 * string, or a `title`/`alt` somebody writes from the brand deck. This walks
 * the two directories the owner named and fails on the words themselves.
 *
 * Scoped exactly to the issue's own two acceptance greps over `src` and
 * `public`: one for the strapline, one for the delivered lockup's filename.
 * Both must return nothing.
 *
 * The strapline check is deliberately case-insensitive. The delivered art and
 * the manifest capitalised it differently, and the two would otherwise need
 * separate rules.
 *
 * ## Neither forbidden string is written out anywhere in this file
 *
 * Not even in this comment. The scanner already excludes its own path, so the
 * TEST would pass either way, but the issue's acceptance criterion is a literal
 * `git grep` that anybody can run, and one that comes back with a hit inside
 * the guard enforcing it needs a verbal exemption every time. It is cheaper to
 * describe the strings than to quote them.
 *
 * The needles are joined from fragments below for the same reason.
 */

const ROOT = process.cwd();
const SCANNED = ["src", "public"];

/*
  Split so the scanner does not match its own source. Joining at runtime is
  not cleverness for its own sake: the alternative is an exemption for this
  path, and an exemption is a hole that widens.
*/
const TAGLINE = ["experience", "more"].join(" ");
const LOCKUP = ["yuvoy", "lockup"].join("-");

/** Every file under the scanned directories. Binary assets are skipped. */
function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry.startsWith(".")) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

/*
  Text only. A .png cannot be grepped meaningfully and would throw off the
  line reporting; the art that matters here is SVG, which is text.
*/
const TEXT = /\.(tsx?|jsx?|mjs|cjs|css|svg|json|md|txt|webmanifest)$/;

const files = SCANNED.flatMap((d) => walk(join(ROOT, d)))
  .filter((f) => TEXT.test(f))
  .filter((f) => f !== __filename);

/*
  Contents AND path.

  The path half is not decoration. Re-adding the delivered art was caught below
  only because it happens to name the strapline in its own `<desc>`; a
  redelivery that reworded that one line would have put the file back under
  `public/brand` with nothing complaining. The FILE NAME is the thing the issue
  asked to be gone, so the file name is what is checked.
*/
function hits(needle: string): string[] {
  const found: string[] = [];
  for (const file of files) {
    const path = relative(ROOT, file);
    if (path.toLowerCase().includes(needle)) {
      found.push(`${path}: the file name itself`);
    }
    const lines = readFileSync(file, "utf8").split("\n");
    lines.forEach((line, i) => {
      if (line.toLowerCase().includes(needle)) {
        found.push(`${path}:${i + 1}: ${line.trim()}`);
      }
    });
  }
  return found;
}

describe("the tagline is gone from every page", () => {
  it("scans a believable number of files, so a broken walk cannot pass", () => {
    /*
      The guard on the guard. A `walk` that returned nothing, or a filter that
      excluded everything, would make both assertions below pass forever while
      checking nothing at all.
    */
    expect(files.length).toBeGreaterThan(100);
    expect(files.some((f) => f.includes(join("public", "brand")))).toBe(true);
    expect(files.some((f) => f.endsWith("manifest.ts"))).toBe(true);
  });

  it("has no strapline anywhere under src or public", () => {
    expect(
      hits(TAGLINE),
      "the strapline is back. It belongs in the description and the share " +
        "card, never in a wordmark, a tab title or a home-screen name",
    ).toEqual([]);
  });

  it("has no delivered lockup art anywhere under src or public", () => {
    expect(
      hits(LOCKUP),
      "the delivered lockup is back. It bakes the strapline into the art, " +
        "so nothing may reference it. The compact mark is generated from " +
        "yuvoy-web by scripts/generate-feed-lockup.mjs",
    ).toEqual([]);
  });

  it("leaves exactly one wordmark drawing, with no variant to choose", () => {
    /*
      The deletion that makes the two scans above hold. A `variant` prop with
      a default is how a removed drawing comes back: one call site omits it
      and gets the old art, and no scan of `src` sees a problem because the
      filename lives in a map somewhere else.
    */
    const source = readFileSync(
      join(ROOT, "src/components/ui/wordmark.tsx"),
      "utf8",
    );
    expect(source, "the variant prop is back on Wordmark").not.toMatch(
      /variant\s*[?:]/,
    );
    const srcs = [...source.matchAll(/"(\/brand\/[^"]+)"/g)].map((m) => m[1]);
    expect(srcs.sort()).toEqual([
      "/brand/yuvoy-mark-compact-on-dark.svg",
      "/brand/yuvoy-mark-compact-on-light.svg",
    ]);
  });
});
