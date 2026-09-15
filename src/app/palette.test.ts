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
      /*
        The listing's gallery and its full-screen view — yuvoy-app#32. The
        strip's ground behind a poster that has not loaded, and the lightbox's
        ground behind an `object-contain` frame. Both are the sanctioned media
        usage: `forest` letterboxes in a visibly green frame and tints dark
        underwater footage, which is the same reasoning §1 records for the
        feed.
      */
      "src/components/experience/gallery.tsx",
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
      /*
        Within ONE declaration, not across the file.

        `[^"'`]*` was meant to span a single class string and in a `.tsx` it
        does. In `globals.css` it spans everything between two quotes, which is
        most of the file: a `font-display` in one `@apply` matched a `font-bold`
        forty lines and six utilities later, and the rule reported a violation
        that did not exist. Excluding `;` and the braces bounds it to the
        declaration it is actually about, and a real offender (`font-display
        font-bold` in one string or one `@apply`) still has nothing between
        them to stop it.
      */
      return /font-display[^"'`;{}]*font-(medium|bold|black)/.test(s);
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
        The caption's top edge lands between 40% and 58% of the scrim's height.

        Both ends are measured rather than assumed. 40% is a one-line title on a
        standard phone; 58% is the worst case, which is a NARROW phone, where the
        operator-written title wraps to two lines and lifts the whole caption
        roughly a line higher into the ramp. That case is why the scrim grows to
        64% of the frame below 400px: at 52% it put the activity line at 3.17:1.

        The band moved from 50%-62% when the scrim was cut from 67% of the frame
        to 52% and the type came down a step (yuvoy-app#36, owner 14 Sep). The
        numbers are re-derived, not relaxed: the floor at the top of the caption
        is still 4.5 and it still clears it with margin.
      */
      const ramp = stops("feed-scrim");
      expect(creamOverScrim(alphaAt(ramp, 40))).toBeGreaterThanOrEqual(7);
      expect(creamOverScrim(alphaAt(ramp, 58))).toBeGreaterThanOrEqual(4.5);
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

    it("keeps every transition inside its own budget", () => {
      /*
        §3 of the design system splits motion in two: interaction feedback
        (≤250ms, `--ease-interaction`) and entrances (~1100ms,
        `--ease-cinematic`). Getting the pairing wrong is easy and the symptom
        is vague — the feed's retract shipped at 460ms of the cinematic curve,
        a fifth of a second of lag on a movement a traveller triggered with
        every swipe, and the marketing site's sliding header already had a
        ruling against exactly that.

        ## This test was scoped to one CSS block, and that was the bug in it

        It read `@layer components` in globals.css, because that is where the
        retract lived. yuvoy-app#36 deleted the retract and the assertion went
        from "four transitions, all inside budget" to "zero transitions, all
        inside budget" — which passes. A scoped check over an empty set is the
        quietest way for a rule to stop being enforced, so the
        `toBeGreaterThan` below is doing real work and is the only reason the
        deletion was noticed at all.

        It now reads where the rule can actually be broken: the Tailwind pairs
        in component source, which is every transition in the app bar one, and
        any `Nms var(--ease-…)` still written by hand in CSS.
      */
      const budget: [string, number, string][] = [];

      for (const file of FILES.filter((f) => f.endsWith(".tsx"))) {
        const src = read(file);
        // Each class-ish string literal, so a `duration-` is only ever paired
        // with an ease in the SAME className.
        for (const [literal] of src.matchAll(/"[^"\n]*"|`[^`\n]*`/g)) {
          const ease = /\bease-(interaction|cinematic)\b/.exec(literal);
          const ms = /\bduration-(\d+)\b/.exec(literal);
          if (ease && ms) budget.push([rel(file), Number(ms[1]), ease[1]]);
        }
      }

      for (const [whole, ms, ease] of read(
        join(SRC, "app/globals.css"),
      ).matchAll(/(\d+)ms var\(--ease-([a-z]+)\)/g)) {
        budget.push([whole, Number(ms), ease]);
      }

      expect(
        budget.length,
        "no transitions found to check — the scan is looking in the wrong place",
      ).toBeGreaterThan(3);

      for (const [where, ms, ease] of budget) {
        if (ease === "interaction") {
          expect(
            ms,
            `${where}: interaction motion over budget`,
          ).toBeLessThanOrEqual(250);
        } else if (ease === "cinematic") {
          /*
            An entrance. Anything this slow answering a gesture is the defect
            above; anything this fast arriving on first paint is not an
            entrance and should be on the interaction curve instead.
          */
          expect(
            ms,
            `${where}: cinematic motion too brief to be an entrance`,
          ).toBeGreaterThan(250);
        }
      }
    });

    it("keeps the wordmark legible over the same frame", () => {
      /*
        The mark occupies 22%-48% of the top scrim: 24px to 52px of the
        masthead's 108px block. The next test is what keeps that true.

        The band moved TWICE and only the second move was deliberate. On 14 Sep
        `LoginButton` joined the masthead at `size="md"`, which made the row 44px
        instead of the mark's own 28px and pushed the block to 140px without
        anybody updating the arithmetic here. Then the tail came down from 80px
        to 48px when the owner asked for less shade. 108px is both of those
        accounted for.

        The floor here is 3:1, not 4.5: the mark is a GRAPHIC and so is the edge
        of the Login pill beside it. The lower end is checked against 3 for that
        reason, and the upper against 7 because the top of the band is where the
        ramp is darkest and there is no excuse for it being tight there.
      */
      const ramp = stops("feed-scrim-top");
      expect(creamOverScrim(alphaAt(ramp, 22))).toBeGreaterThanOrEqual(7);
      expect(creamOverScrim(alphaAt(ramp, 48))).toBeGreaterThanOrEqual(3);
    });

    it("pins the masthead's height to the gradient measured against it", () => {
      /*
        The one above is a claim about a POSITION in a gradient, and the
        position is decided by the block's own box: 16px above the row, a 44px
        row (`LoginButton` at `size="md"` is the tallest thing in it), and 48px
        of tail. 108px, and `feed-scrim-top`'s stops are percentages of exactly
        that. Change any of the three without changing
        the stops and the mark slides into a lighter band with every contrast
        test still passing, which is the quietest possible way to break this.

        All three are pinned here, on the ONE component both reel surfaces use
        (yuvoy-app#36 — the feed and a shared reel had each begun to carry
        their own copy of it).

        `h-7`, not the lockup's `h-9`. The ensō is ~70% of the delivered
        drawing's height and ~95% of the compact one, so keeping `h-9` would
        have made the mark itself a third larger and pushed the block to 132px.
      */
      const strip = readFileSync(
        join(SRC, "components/feed/reel-strip.tsx"),
        "utf8",
      );
      const masthead = /className="feed-scrim-top[^"]*"/.exec(strip);
      expect(
        masthead,
        "the masthead no longer wears its own scrim",
      ).not.toBeNull();
      expect(masthead![0]).toContain("pt-4");
      expect(masthead![0]).toContain("pb-12");

      const marks = [...strip.matchAll(/<Wordmark ([^/]*)\/>/g)];
      expect(marks.length, "no Wordmark in the masthead").toBeGreaterThan(0);
      for (const [, props] of marks) {
        /*
          This used to assert `variant="compact"`. The prop is gone: on 14 Sep
          the owner asked for the tagline off every page, so the `lockup`
          variant was deleted rather than left as a default somebody could
          pass again (yuvoy-app#36). Asserting its ABSENCE is what keeps the
          deletion, since re-adding the variant would have to re-add the prop.
        */
        expect(props, "the deleted lockup variant is back").not.toContain(
          "variant",
        );
        expect(props, "the mark's height decides the block's").toContain(
          'className="h-7"',
        );
      }
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
