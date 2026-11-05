import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * The design system, enforced rather than asserted.
 *
 * Every rule here has been broken at least once on the marketing site, which
 * is why each is a test and not a paragraph in a document.
 *
 * Its rules are split across palette.test.ts, palette-type.test.ts,
 * palette-contrast.test.ts and palette-motion.test.ts (yuvoy-app#243).
 */

const SRC = join(process.cwd(), "src");
/**
 * mocks/ is scanned too. An off-palette fixture is exactly how #0D3B3E — the
 * retired `teal` — reached the feed and was reported by the owner: the colour
 * lived in a data-URI in a fixture, which no `src`-only scan would ever see.
 */
const MOCKS = join(process.cwd(), "mocks");

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory()
      ? walk(full)
      : /\.(tsx?|css)$/.test(name) && !name.endsWith(".gen.ts")
        ? [full]
        : [];
  });
}

/**
 * Scan CODE, not prose.
 *
 * Comments in this codebase name the banned things constantly — the whole
 * point of a rule is that it is written down next to the thing it forbids.
 * A scanner that reads them flags every file that documents the rule, which
 * trains everyone to weaken the rule rather than obey it.
 */
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "") // block and JSDoc
    .replace(/(^|[^:])\/\/.*$/gm, "$1"); // line, but not a URL's //
}

const FILES = [...walk(SRC), ...walk(MOCKS)].filter(
  (f) => !/\.test\.tsx?$/.test(f),
);
const read = (f: string) => stripComments(readFileSync(f, "utf8"));
const rel = (f: string) => f.replace(process.cwd() + "/", "");

describe("palette", () => {
  it("has exactly one near-black, and it is abyss", () => {
    const css = read(join(SRC, "app/globals.css"));
    expect(css).toContain("--color-abyss: #0a100e");
    // The v2.6 rename: `device` must not survive alongside it, or the site has
    // two indistinguishable darks again (measured 1.01:1 apart).
    expect(css).not.toContain("--color-device");
  });

  it("paints bg-abyss only on the media ground", () => {
    // `abyss` is a ground and an object's colour, never a surface. The moment
    // a content section takes it, the one-dark rule is dead. Since v2.7 the
    // stage is `forest`, so the list is the feed, the two poster grounds
    // that stand in for media on a sheet, and the token block itself.
    const ALLOWED = [
      "src/components/feed/",
      "src/components/experience/experience-detail.tsx",
      /*
        The listing's gallery and its full-screen view — yuvoy-app#32. The
        strip's ground behind a poster that has not loaded, and the lightbox's
        ground behind an `object-contain` frame. Both are the sanctioned media
        usage: `forest` letterboxes in a visibly green frame and tints dark
        underwater footage, which is the same reasoning §1 records for the
        feed.
      */
      "src/components/experience/gallery.tsx",
      /*
        The listing's picture over the top of checkout and of a booking (the
        approved redesign, 3 Oct 2026), and the ground it holds while either
        loads: the same media use as the gallery's, a ground behind a poster.
      */
      "src/components/chrome/picture-strip.tsx",
      "src/components/search/search-screen.tsx",
      /*
        The operator page's poster grounds — the profile's logo tile and photo
        grid, and a listing card's thumbnail. Same use as the two above: a
        ground standing in for media on a sheet, never a surface.

        Listed FILE BY FILE, not as `src/components/operator/`. The directory
        prefix would be one character shorter and would sign a blank cheque for
        every screen added to it — and two were added in the same change that
        split `listing-card.tsx` out of the screen (yuvoy-app#33), neither of
        which had been reviewed for this rule.
      */
      "src/components/operator/operator-screen.tsx",
      "src/components/operator/listing-card.tsx",
      "src/app/globals.css",
    ];

    const offenders = FILES.filter((f) => /\bbg-abyss\b/.test(read(f)))
      .map(rel)
      .filter((f) => !ALLOWED.some((a) => f.startsWith(a)));

    expect(offenders).toEqual([]);
  });

  it("never uses font-semibold: the type system has three weights", () => {
    // 400, 500 and 700, and nothing between. The text face is variable, so a
    // 600 would render rather than be synthesised; it is banned so the three
    // stay three instead of drifting into a continuum.
    const offenders = FILES.filter((f) => /font-semibold/.test(read(f))).map(
      rel,
    );
    expect(offenders).toEqual([]);
  });

  it("uses no raw hex outside the token block", () => {
    // Two sanctioned locations, both documented: the @theme block, and the
    // single literal Next needs for viewport.themeColor before CSS exists.
    const ALLOWED = [
      "src/app/globals.css",
      "src/lib/site/theme.ts",
      // The fixture posters. Their literals are asserted to BE tokens below,
      // which is stronger than banning them.
      "mocks/fixtures.ts",
      // The OG card renders through Satori, outside the CSS pipeline, so a
      // custom property cannot reach it. Asserted to be tokens below.
      "src/app/opengraph-image.tsx",
      // The booking pass, for the same reason and with the same assertion
      // (yuvoy-app#61). Both render through `next/og`.
      "src/app/api/booking-pass/route.tsx",
    ];
    const offenders = FILES.filter((f) => /#[0-9a-fA-F]{6}\b/.test(read(f)))
      .map(rel)
      .filter((f) => !ALLOWED.includes(f));
    expect(offenders).toEqual([]);
  });

  it("builds fixture posters from real tokens and nothing else", () => {
    // The reported bug: the reel posters used #0D3B3E (`teal`, retired in
    // v2.1) and a near-black that was not `abyss`.
    const css = readFileSync(join(SRC, "app/globals.css"), "utf8");
    const tokens = new Set(
      [...css.matchAll(/--color-[a-z-]+:\s*(#[0-9a-fA-F]{6})/g)].map((m) =>
        m[1].toLowerCase(),
      ),
    );

    // stripComments matters here: the file names the retired colour in a
    // comment explaining why it must never return. Reading comments would
    // flag the file for documenting its own rule.
    const fixtures = stripComments(
      readFileSync(join(MOCKS, "fixtures.ts"), "utf8"),
    );
    const used = [...fixtures.matchAll(/#[0-9a-fA-F]{6}/g)].map((m) =>
      m[0].toLowerCase(),
    );

    expect(used.length).toBeGreaterThan(0);
    for (const hex of used) expect(tokens).toContain(hex);
    // The retired dark, by name, so it can never come back.
    expect(used).not.toContain("#0d3b3e");
  });

  it("builds the OG card from real tokens too", () => {
    // A share card travels further than the page it came from; an off-palette
    // one is the most visible possible place to be off-brand.
    const css = readFileSync(join(SRC, "app/globals.css"), "utf8");
    const tokens = new Set(
      [...css.matchAll(/--color-[a-z-]+:\s*(#[0-9a-fA-F]{6})/g)].map((m) =>
        m[1].toLowerCase(),
      ),
    );
    /*
      Both Satori surfaces, not just the OG card. The booking pass is the one a
      traveller keeps in Photos and shows at a jetty, so it is the last place
      an off-brand colour should be able to appear unnoticed.
    */
    for (const file of [
      "app/opengraph-image.tsx",
      "app/api/booking-pass/route.tsx",
    ]) {
      const source = stripComments(readFileSync(join(SRC, file), "utf8"));
      const used = [...source.matchAll(/#[0-9a-fA-F]{6}/g)].map((m) =>
        m[0].toLowerCase(),
      );
      expect(used.length, file).toBeGreaterThan(0);
      for (const hex of used) expect(tokens, `${file}: ${hex}`).toContain(hex);
    }
  });

  it("keeps THEME_COLOR equal to the forest token", () => {
    const css = readFileSync(join(SRC, "app/globals.css"), "utf8");
    const theme = readFileSync(join(SRC, "lib/site/theme.ts"), "utf8");
    const forest = /--color-forest:\s*(#[0-9a-fA-F]{6})/.exec(css)?.[1];
    const declared = /THEME_COLOR = "(#[0-9a-fA-F]{6})"/.exec(theme)?.[1];
    expect(declared).toBe(forest);
  });

  it("never puts text below the documented opacity floor", () => {
    /*
      §1's opacity ladder, enforced. axe found 45 places using /40, /50 and
      /60 for real text — 2.83:1 at worst, against a 4.5:1 requirement.

        Body/secondary on paper   forest/70   5.14:1
        Labels + small on paper   forest/75   6.00:1
        Body on dark              paper/60    5.78:1

      Anything below those is DECORATION ONLY. Borders and fills are exempt,
      which is why this matches `text-` specifically.
    */
    const offenders = FILES.filter((f) =>
      /text-forest\/(0|5|10|15|20|25|30|35|40|45|50|55|60|65)\b|text-paper\/(0|5|10|15|20|25|30|35|40|45|50|55)\b/.test(
        read(f),
      ),
    ).map(rel);
    expect(offenders).toEqual([]);
  });

  it("keeps labels at forest/75 or more", () => {
    /*
      The same ladder's second rung. A label is 13/18, smaller than body
      text, so its floor is forest/75 (6.00:1), not body's forest/70. The
      check reads each class string: one holding `label` or `text-label`
      beside `text-forest/70` or less fails (yuvoy-app#223).
    */
    const offenders = FILES.flatMap((f) =>
      (read(f).match(/"[^"\n]*"|'[^'\n]*'|`[^`]*`/g) ?? [])
        .map((s) => s.slice(1, -1).split(/\s+/))
        .filter(
          (t) =>
            t.some((c) => c === "label" || c === "text-label") &&
            t.some((c) => {
              const n = /^text-forest\/(\d+)$/.exec(c)?.[1];
              return n !== undefined && Number(n) <= 70;
            }),
        )
        .map((t) => `${rel(f)}: ${t.join(" ")}`),
    );
    expect(offenders).toEqual([]);
  });

  it("keeps the marketing near-square out of the app's controls (v2.7)", () => {
    // The app is rounded. A 2px control here is the marketing site's tell,
    // and the four radius tokens plus the pill cover every shape a screen
    // needs. The token survives only for the guide's inline code and for
    // parity with the operator portal's copy of the block.
    const offenders = FILES.filter((f) => /rounded-edge/.test(read(f))).map(
      rel,
    );
    expect(offenders).toEqual([]);
  });

  it("maps every radius to a token", () => {
    // An arbitrary radius is a value between tokens. The one exception is
    // the concentric calc — an inner corner derived from a token and the
    // padding between them — which is a token by another route.
    const offenders = FILES.filter((f) => {
      const s = read(f);
      const arbitrary =
        s.match(/\brounded(?:-[trblse]{1,2})?-\[[^\]]*\]/g) ?? [];
      return arbitrary.some((v) => !v.includes("calc(var(--radius-"));
    }).map(rel);
    expect(offenders).toEqual([]);
  });

  it("declares the v2.7 radius scale, and nothing between its steps", () => {
    const css = read(join(SRC, "app/globals.css"));
    for (const token of [
      "--radius-tile: 0.75rem",
      "--radius-control: 1rem",
      "--radius-card: 1.5rem",
      "--radius-sheet: 2rem",
    ]) {
      expect(css).toContain(token);
    }
  });

  /**
   * The brand marks drawn for a dark surface, against the canvas token.
   *
   * These are the one part of the palette that lives in a file format no
   * stylesheet reaches, and every one of them is DERIVED from yuvoy-web's
   * delivered art — which is still drawn in `cream`, and will stay that way.
   * So the failure mode is specific and quiet: somebody re-copies a mark after
   * a brand redelivery, the drawing is right, the geometry is right, and the
   * only thing wrong is a colour that was correct last year.
   *
   * It matters because a cream mark beside white text measures 1.15:1. That is
   * the "two whites" version of the failure v2.1 fixed when it merged `teal`
   * and `ink`, and it reads as a dirty logo rather than as a bug, which is
   * exactly why nobody files it.
   *
   * `#0d3b3e` is pinned by name elsewhere in this file for the same reason.
   */
  it("draws every mark for a dark surface in the canvas token", () => {
    const css = readFileSync(join(SRC, "app/globals.css"), "utf8");
    const paper = /--color-paper:\s*(#[0-9a-fA-F]{6})/.exec(css)?.[1];
    expect(paper, "--color-paper").toBeDefined();

    const MARKS = [
      "public/brand/yuvoy-mark-compact-on-dark.svg",
      "public/brand/yuvoy-mark-vector-paper.svg",
      "docs/reel-lab/assets/yuvoy-mark-compact-on-dark.svg",
      // The favicon tile: a paper ensō on forest, generated by `pnpm icons`.
      "src/app/icon.svg",
    ];

    for (const mark of MARKS) {
      const svg = readFileSync(join(process.cwd(), mark), "utf8").toLowerCase();
      expect(svg, `${mark} does not use the canvas token`).toContain(paper!);
      expect(svg, `${mark} is still drawn in the retired cream`).not.toContain(
        "#f4efe4",
      );
    }
  });

  /**
   * The reel laboratory's token copy, against this one.
   *
   * `docs/reel-lab/css/tokens.css` opens from `file://` with no build step, so
   * it cannot import `@theme` — it restates it longhand, and its own header
   * promises every value is "lifted verbatim". Nothing held it to that promise.
   *
   * That is not a documentation nit. The lab is where screens are judged
   * before they are built, and a lab drawn in adjacent colours is a lab whose
   * verdicts do not transfer — the same reasoning `mocks/fixtures.ts` already
   * carries, and the reason a retired `teal` was once found in a fixture. v2.9
   * moved all three surface tokens at once and the lab would have kept
   * rendering cream indefinitely, so the promise is a test now.
   *
   * The two font tokens are deliberately excluded: `@theme` points them at
   * `next/font` variables that do not exist over `file://`, so the lab names
   * the faces directly. Every other shared token must match exactly.
   */
  it("keeps the reel laboratory's token copy honest", () => {
    const theme = readFileSync(join(SRC, "app/globals.css"), "utf8");
    const lab = readFileSync(
      join(process.cwd(), "docs/reel-lab/css/tokens.css"),
      "utf8",
    );

    /** `--name: value;` pairs, whitespace and trailing comments normalised. */
    const declarations = (css: string) =>
      new Map(
        [...css.matchAll(/(--[a-z0-9-]+):\s*([^;]+);/g)].map(
          ([, name, value]) => [
            name,
            value
              .replace(/\/\*[\s\S]*?\*\//g, "")
              .trim()
              .toLowerCase(),
          ],
        ),
      );

    const mine = declarations(theme);
    const theirs = declarations(lab);

    /*
      The lab drops the `color-` prefix (it is plain CSS, not a Tailwind
      namespace), so a colour is matched by its bare name and everything else
      by the name itself.
    */
    const PREFIXES = [
      "--color-",
      "--radius-",
      "--ease-",
      "--tracking-",
      "--container-",
    ];
    const EXCLUDED = ["--font-display", "--font-sans"];

    const checked: string[] = [];
    for (const [name, value] of mine) {
      if (EXCLUDED.includes(name)) continue;
      if (!PREFIXES.some((p) => name.startsWith(p))) continue;
      const bare = name.replace("--color-", "--");
      const found = theirs.get(name) ?? theirs.get(bare);
      if (found === undefined) continue; // the lab need not restate every token
      checked.push(name);
      expect(found, `${name} drifted in docs/reel-lab/css/tokens.css`).toBe(
        value,
      );
    }

    // A scoped check over an empty set is the quietest way for a rule to stop
    // being enforced — the same trap this file already records for the motion
    // budget. The lab restates at least the palette and the radius scale.
    expect(
      checked.length,
      "no shared tokens found — the scan is looking in the wrong place",
    ).toBeGreaterThan(10);
  });
});
