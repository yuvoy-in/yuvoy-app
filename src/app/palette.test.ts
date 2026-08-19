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

const FILES = walk(SRC).filter((f) => !/\.test\.tsx?$/.test(f));
const read = (f: string) => stripComments(readFileSync(f, "utf8"));
const rel = (f: string) => f.slice(SRC.length + 1);

describe("palette", () => {
  it("has exactly one near-black, and it is abyss", () => {
    const css = read(join(SRC, "app/globals.css"));
    expect(css).toContain("--color-abyss: #0a100e");
    // The v2.6 rename: `device` must not survive alongside it, or the site has
    // two indistinguishable darks again (measured 1.01:1 apart).
    expect(css).not.toContain("--color-device");
  });

  it("paints bg-abyss only on the media ground and the shell", () => {
    // `abyss` is a ground and an object's colour, never a surface. The moment
    // a content section takes it, the one-dark rule is dead.
    const ALLOWED = [
      "components/feed/",
      "components/chrome/app-shell.tsx",
      "components/states/",
      "app/layout.tsx",
      "app/error.tsx",
      "app/not-found.tsx",
      "app/globals.css",
      "app/search/page.tsx",
      "app/trips/page.tsx",
      "app/account/page.tsx",
      "components/experience/experience-detail.tsx",
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
    const ALLOWED = ["app/globals.css", "lib/site/theme.ts"];
    const offenders = FILES.filter((f) => /#[0-9a-fA-F]{6}\b/.test(read(f)))
      .map(rel)
      .filter((f) => !ALLOWED.includes(f));
    expect(offenders).toEqual([]);
  });

  it("keeps THEME_COLOR equal to the forest token", () => {
    const css = readFileSync(join(SRC, "app/globals.css"), "utf8");
    const theme = readFileSync(join(SRC, "lib/site/theme.ts"), "utf8");
    const forest = /--color-forest:\s*(#[0-9a-fA-F]{6})/.exec(css)?.[1];
    const declared = /THEME_COLOR = "(#[0-9a-fA-F]{6})"/.exec(theme)?.[1];
    expect(declared).toBe(forest);
  });

  it("has no pills — the brand is rectangular at 2px", () => {
    // `rounded-full` is reserved for hardware depictions, of which the app
    // currently has none.
    const offenders = FILES.filter((f) => /rounded-full/.test(read(f))).map(
      rel,
    );
    expect(offenders).toEqual([]);
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
});
