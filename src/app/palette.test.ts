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
   * The feed's scrims, recomputed from the stops rather than from the prose.
   *
   * Every other rule in this file is a shape or a name. This one is a NUMBER
   * a person typed into a comment once, in a file where the number is the
   * whole justification for the design — and the number that was there
   * (8.9:1, attached to the 62% stop) did not survive being recomputed. It
   * corresponds to roughly 76% abyss. So the comment no longer holds the
   * claim: this does, out of the gradient the browser will actually paint.
   *
   * The reference ground is the palest surf highlight in the fixture set. A
   * scrim is sized against the BRIGHTEST pixel a clip can show, because video
   * moves — a frame that is dark when the poster loads can be white water two
   * seconds later.
   */
  describe("the feed's scrims", () => {
    const css = readFileSync(join(SRC, "app/globals.css"), "utf8");

    /** The palest thing a clip has been measured showing. */
    const HIGHLIGHT = "#e8e2d4";

    /** Reads one gradient's abyss-percentage stops straight out of the CSS. */
    function stops(utility: string): [number, number][] {
      const block = new RegExp(
        `@utility ${utility} \\{([\\s\\S]*?)\\n\\}`,
      ).exec(css);
      if (!block) throw new Error(`no @utility ${utility}`);

      const found: [number, number][] = [];
      for (const line of block[1].split("\n")) {
        const mixed =
          /color-mix\(in srgb, var\(--color-abyss\) (\d+)%, transparent\)\s+(\d+)%/.exec(
            line,
          );
        if (mixed) {
          found.push([Number(mixed[2]), Number(mixed[1])]);
          continue;
        }
        const solid = /var\(--color-abyss\)\s+(\d+)%/.exec(line);
        if (solid) {
          found.push([Number(solid[1]), 100]);
          continue;
        }
        const clear = /transparent\s+(\d+)%/.exec(line);
        if (clear) found.push([Number(clear[1]), 0]);
      }
      return found.sort((a, b) => a[0] - b[0]);
    }

    /** The scrim's opacity part-way along it, the way a browser reads it. */
    function alphaAt(ramp: [number, number][], at: number): number {
      for (let i = 0; i < ramp.length - 1; i++) {
        const [p0, a0] = ramp[i];
        const [p1, a1] = ramp[i + 1];
        if (at >= p0 && at <= p1) {
          return (a0 + ((a1 - a0) * (at - p0)) / (p1 - p0)) / 100;
        }
      }
      throw new Error(`${at}% is outside the ramp`);
    }

    /**
     * `cream` over the scrim over the highlight.
     *
     * Composited in sRGB, which is where a browser blends a translucent
     * gradient — blending in linear light gives a materially different answer
     * and would be measuring a scrim nobody will ever see.
     */
    function creamOverScrim(alpha: number): number {
      const ch = (hex: string) =>
        [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
      const ground = ch(HIGHLIGHT).map((c, i) =>
        Math.round(alpha * ch(abyss)[i] + (1 - alpha) * c),
      );
      const hex =
        "#" + ground.map((c) => c.toString(16).padStart(2, "0")).join("");
      return ratio(cream, hex);
    }

    it("keeps the caption legible over the brightest frame a clip can show", () => {
      /*
        The caption's top edge lands between 50% and 62% of the scrim's height
        — 50% for a one-line title, 62% for the longest that fits with an
        activity line under it. Both ends are checked, because "it passes
        where the copy usually starts" is not the claim being made.
      */
      const ramp = stops("feed-scrim");
      expect(creamOverScrim(alphaAt(ramp, 50))).toBeGreaterThanOrEqual(7);
      expect(creamOverScrim(alphaAt(ramp, 62))).toBeGreaterThanOrEqual(4.5);
    });

    it("only ever gets lighter on the way up", () => {
      // A scrim safe at the top of the caption is safe through all of it —
      // which is only true while the ramp is monotone. A stop out of order is
      // a band of sky in the middle of the copy.
      for (const utility of ["feed-scrim", "feed-scrim-top"]) {
        const ramp = stops(utility);
        expect(
          ramp.length,
          `${utility} has too few stops to be smooth`,
        ).toBeGreaterThan(6);
        for (let i = 1; i < ramp.length; i++) {
          expect(
            ramp[i][1],
            `${utility} lightens then darkens`,
          ).toBeLessThanOrEqual(ramp[i - 1][1]);
        }
      }
    });

    it("ends rather than stopping, at both ends of the feed", () => {
      // The seam this replaced: the old ramp hit `transparent` with its slope
      // still at −1.48, which draws a line across moving footage. A gradient
      // whose last step is small has no edge to catch.
      for (const utility of ["feed-scrim", "feed-scrim-top"]) {
        const ramp = stops(utility);
        const last = ramp[ramp.length - 1];
        const before = ramp[ramp.length - 2];
        expect(last[1], `${utility} does not reach transparent`).toBe(0);
        expect(
          before[1],
          `${utility} falls off a cliff at the top`,
        ).toBeLessThanOrEqual(5);
      }
    });

    it("keeps the feed's chrome inside the interaction budget", () => {
      /*
        §3 of the design system splits motion in two, and this is the half
        that is easy to get wrong: the retract ANSWERS A GESTURE, so it is
        interaction feedback (≤250ms, `--ease-interaction`) and not an
        entrance (~1100ms, `--ease-cinematic`).

        It shipped at 460ms of the cinematic curve first. That is a fifth of a
        second of lag on a movement a traveller triggers with every swipe —
        and the same mistake the marketing site's sliding header already had a
        ruling against, which is what this test is here to remember.

        Comments are stripped first: the block explains the budget it obeys,
        and a scanner that read the explanation would fail the file for
        documenting its own rule.
      */
      const chrome = /@layer components \{([\s\S]*?)\n\}/.exec(
        read(join(SRC, "app/globals.css")),
      );
      expect(chrome, "the feed's chrome layer is gone").not.toBeNull();

      const timings = [
        ...chrome![1].matchAll(/(\d+)ms var\(--ease-([a-z]+)\)/g),
      ];
      expect(timings.length, "no transitions found to check").toBeGreaterThan(
        3,
      );

      for (const [whole, ms, ease] of timings) {
        expect(Number(ms), whole).toBeLessThanOrEqual(250);
        expect(ease, whole).toBe("interaction");
      }
    });

    it("keeps the wordmark legible over the same frame", () => {
      // The mark occupies 12%–39% of the top scrim, which is 16px to 52px of
      // the masthead's 132px block. The next test is what keeps that true.
      const ramp = stops("feed-scrim-top");
      expect(creamOverScrim(alphaAt(ramp, 12))).toBeGreaterThanOrEqual(7);
      expect(creamOverScrim(alphaAt(ramp, 39))).toBeGreaterThanOrEqual(4.5);
    });

    it("pins the masthead's height to the gradient measured against it", () => {
      /*
        The one above is a claim about a POSITION in a gradient, and the
        position is decided by the block's padding — 16px above the mark, 36px
        of mark, 80px of tail. Change the padding without changing the stops
        and the mark slides into a lighter band with every contrast test still
        passing, which is the quietest possible way to break this.
      */
      const feed = readFileSync(join(SRC, "components/feed/feed.tsx"), "utf8");
      const masthead = /className="feed-scrim-top feed-masthead[^"]*"/.exec(
        feed,
      );
      expect(
        masthead,
        "the masthead no longer wears its own scrim",
      ).not.toBeNull();
      expect(masthead![0]).toContain("pt-4");
      expect(masthead![0]).toContain("pb-20");
      expect(feed).toContain(
        '<Wordmark tone="cream" className="h-9" priority />',
      );
    });
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
