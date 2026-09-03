import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * The design system, enforced rather than asserted.
 *
 * Every rule here has been broken at least once on the marketing site, which
 * is why each is a test and not a paragraph in a document.
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
      "src/components/search/search-screen.tsx",
      "src/app/globals.css",
    ];

    const offenders = FILES.filter((f) => /\bbg-abyss\b/.test(read(f)))
      .map(rel)
      .filter((f) => !ALLOWED.some((a) => f.startsWith(a)));

    expect(offenders).toEqual([]);
  });

  it("never uses font-semibold — Satoshi ships no 600", () => {
    // The browser would synthesise it, which is the exact tell the type
    // system was rebuilt to remove.
    const offenders = FILES.filter((f) => /font-semibold/.test(read(f))).map(
      rel,
    );
    expect(offenders).toEqual([]);
  });

  it("never puts a display face at a weight other than 400 or the turn", () => {
    const offenders = FILES.filter((f) => {
      const s = read(f);
      return /font-display[^"'`]*font-(medium|bold|black)/.test(s);
    }).map(rel);
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
    const og = stripComments(
      readFileSync(join(SRC, "app/opengraph-image.tsx"), "utf8"),
    );
    const used = [...og.matchAll(/#[0-9a-fA-F]{6}/g)].map((m) =>
      m[0].toLowerCase(),
    );
    expect(used.length).toBeGreaterThan(0);
    for (const hex of used) expect(tokens).toContain(hex);
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

        Body/secondary on cream   forest/70   4.77:1
        Labels + small on cream   forest/75   5.55:1
        Body on dark              cream/60    5.15:1

      Anything below those is DECORATION ONLY. Borders and fills are exempt,
      which is why this matches `text-` specifically.
    */
    const offenders = FILES.filter((f) =>
      /text-forest\/(0|5|10|15|20|25|30|35|40|45|50|55|60|65)\b|text-cream\/(0|5|10|15|20|25|30|35|40|45|50|55)\b/.test(
        read(f),
      ),
    ).map(rel);
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
});

describe("measured contrast", () => {
  const lin = (c: number) => {
    const v = c / 255;
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  const L = (hex: string) => {
    const h = hex.replace("#", "");
    const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
    return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  };
  const ratio = (a: string, b: string) => {
    const [x, y] = [L(a), L(b)].sort((p, q) => q - p);
    return (x + 0.05) / (y + 0.05);
  };

  const cream = "#f4efe4";
  const forest = "#16362e";
  const abyss = "#0a100e";
  const terra = "#be7149";
  const terraSoft = "#d89772";

  it("keeps every documented pairing at or above its floor", () => {
    expect(ratio(cream, forest)).toBeGreaterThanOrEqual(11.4); // AAA body
    expect(ratio(cream, abyss)).toBeGreaterThanOrEqual(16.7); // AAA body
    expect(ratio(terraSoft, abyss)).toBeGreaterThanOrEqual(7.0); // AAA
    expect(ratio(terraSoft, forest)).toBeGreaterThanOrEqual(4.5); // AA
  });

  it("keeps abyss and forest far enough apart to read as depth", () => {
    // If these ever converge the site is back to two darks nobody can tell
    // apart, which is what the teal/ink merge fixed.
    expect(ratio(abyss, forest)).toBeGreaterThan(1.3);
  });

  it("records that terra becomes body-safe on abyss and is not on forest", () => {
    expect(ratio(terra, abyss)).toBeGreaterThanOrEqual(4.5); // AA at body size
    expect(ratio(terra, forest)).toBeLessThan(4.5); // large text only
  });

  /**
   * A translucent cream fill under accent text, on the stage.
   *
   * The v2.7 chips wanted a `cream/10` tint behind `terra-soft` on forest.
   * Composited (sRGB, the way a browser blends it) the tint lifts the ground
   * enough to drop the pairing under AA, while cream text on the same tint
   * keeps AAA. So on a dark surface the accent chip is outline-only and the
   * neutral chip may be filled — and this is why, so the fill cannot creep
   * back on a hunch.
   */
  it("shows why accent chips on the stage are outline-only", () => {
    const over = (fg: string, bg: string, alpha: number) => {
      const ch = (hex: string) =>
        [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
      const mixed = ch(fg).map((c, i) =>
        Math.round(alpha * c + (1 - alpha) * ch(bg)[i]),
      );
      return "#" + mixed.map((c) => c.toString(16).padStart(2, "0")).join("");
    };
    const tint = over(cream, forest, 0.1);
    expect(ratio(terraSoft, tint)).toBeLessThan(4.5);
    expect(ratio(cream, tint)).toBeGreaterThanOrEqual(7.0);
  });
});
