import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const SRC = join(process.cwd(), "src");

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

const read = (f: string) => stripComments(readFileSync(f, "utf8"));

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

  const paper = "#ffffff";
  const paperDeep = "#f7f5f1";
  const paperLine = "#edeae4";
  const forest = "#16362e";
  const abyss = "#0a100e";
  const terra = "#be7149";
  const terraSoft = "#d89772";

  /*
    The literals above, against the tokens they claim to be.

    Every number in this block is measured from these strings, so a token whose
    value changes without them keeps measuring a colour the app no longer
    paints — green suite, dead claim. That is precisely what v2.9 would have
    done to `#f4efe4`: renaming `cream` to `paper` made the stale literal a
    compile-visible edit, but a value-only change would have left this file
    passing and wrong, which is the failure this test exists to make
    impossible.
  */
  it("measures the colours the @theme block actually declares", () => {
    const css = readFileSync(join(SRC, "app/globals.css"), "utf8");
    const declared = (name: string) =>
      new RegExp(`--color-${name}:\\s*(#[0-9a-fA-F]{6})`)
        .exec(css)?.[1]
        ?.toLowerCase();

    for (const [name, literal] of [
      ["paper", paper],
      ["paper-deep", paperDeep],
      ["paper-line", paperLine],
      ["forest", forest],
      ["abyss", abyss],
      ["terra", terra],
      ["terra-soft", terraSoft],
    ] as const) {
      expect(declared(name), `--color-${name}`).toBe(literal);
    }
  });

  it("keeps the raised surface and the hairline off the canvas", () => {
    /*
      v2.9 preserved the SEPARATION, not the hue — these two steps are the
      entire reason a card still reads as raised and a divider still reads as a
      line once the canvas is #FFFFFF. They were 1.09:1 and 1.19:1 on cream and
      are 1.09:1 and 1.20:1 here.

      Nothing else in the suite would catch losing them. Every text pairing gets
      BETTER as the supports lighten, so a flattened surface ramp passes every
      contrast assertion in this file while the panels quietly disappear.
    */
    expect(ratio(paper, paperDeep)).toBeGreaterThanOrEqual(1.08);
    expect(ratio(paper, paperLine)).toBeGreaterThanOrEqual(1.18);
    // A hairline must still out-read the raised surface it divides, or a
    // bordered row inside a panel loses its edge.
    expect(ratio(paperDeep, paperLine)).toBeGreaterThanOrEqual(1.05);
  });

  it("keeps every documented pairing at or above its floor", () => {
    expect(ratio(paper, forest)).toBeGreaterThanOrEqual(13.1); // AAA body
    expect(ratio(paper, abyss)).toBeGreaterThanOrEqual(19.2); // AAA body
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
     * `paper` over the scrim over the highlight.
     *
     * Composited in sRGB, which is where a browser blends a translucent
     * gradient — blending in linear light gives a materially different answer
     * and would be measuring a scrim nobody will ever see.
     */
    function paperOverScrim(alpha: number, opacity = 1): number {
      const ch = (hex: string) =>
        [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
      const toHex = (rgb: number[]) =>
        "#" + rgb.map((c) => c.toString(16).padStart(2, "0")).join("");
      const ground = ch(HIGHLIGHT).map((c, i) =>
        Math.round(alpha * ch(abyss)[i] + (1 - alpha) * c),
      );
      // `paper/NN` is paper blended over whatever is under it, in sRGB too.
      const text = ch(paper).map((c, i) =>
        Math.round(opacity * c + (1 - opacity) * ground[i]),
      );
      return ratio(toHex(text), toHex(ground));
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
      expect(paperOverScrim(alphaAt(ramp, 40))).toBeGreaterThanOrEqual(7);
      expect(paperOverScrim(alphaAt(ramp, 58))).toBeGreaterThanOrEqual(4.5);
      /*
        And where the top edge really reaches. Measured on 4 Oct 2026 by
        `e2e/caption-contrast.spec.ts`: a three-line title (the clamp's
        limit) puts it at 61.5% on a 375 x 667 phone. Rounded up.
      */
      expect(paperOverScrim(alphaAt(ramp, 62))).toBeGreaterThanOrEqual(4.5);
    });

    it("keeps the caption's dimmer lines legible where they land", () => {
      /*
        The test above measured `paper`, and the line actually at the
        caption's top edge was the activity label at `paper/70`: 3.48:1 at
        58%, and 3.2:1 where a three-line title lifts it. The no-dates line
        was `paper/60`. Found by the colour audit of the redesign (4 Oct
        2026), with the positions measured by `e2e/caption-contrast.spec.ts`.

        The top line takes no opacity at all, because it is the one at the
        top edge. Every other dimmed line in the caption sits in the
        departure row, at most 30% up the scrim, and is measured there. The
        card's own classes are read so a dimmer line cannot come back
        unmeasured. Icons draw no words (3:1 is their floor), and the 3xl
        title on the poster's own placeholder sits on the solid media
        ground, not on the scrim.
      */
      const ramp = stops("feed-scrim");
      const card = read(join(SRC, "components/feed/experience-card.tsx"));
      const top = /<p className="label (text-paper[^\s"]*)/.exec(card)?.[1];
      expect(top, "the activity label at the top of the caption").toBe(
        "text-paper",
      );
      const used = new Set<number>();
      for (const line of card.split("\n")) {
        if (/Icon\b|text-3xl/.test(line)) continue;
        for (const m of line.matchAll(/text-paper\/(\d+)\b/g)) {
          used.add(Number(m[1]));
        }
      }
      for (const opacity of used) {
        expect(
          paperOverScrim(alphaAt(ramp, 30), opacity / 100),
          `text-paper/${opacity} in the departure row`,
        ).toBeGreaterThanOrEqual(4.5);
      }
    });

    it("keeps the checkout strip's caption legible over the brightest frame", () => {
      /*
        The strip's caption tops out at 81% of its height on the shortest strip
        (see `strip-scrim`). `paper` must clear 4.5:1 there, as body text, and
        it is measured, not assumed, so lightening the ramp fails here first.
      */
      const ramp = stops("strip-scrim");
      expect(paperOverScrim(alphaAt(ramp, 81))).toBeGreaterThanOrEqual(5.5);
      for (let i = 1; i < ramp.length; i++) {
        expect(
          ramp[i][1],
          "strip-scrim lightens then darkens",
        ).toBeLessThanOrEqual(ramp[i - 1][1]);
      }
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

    it("keeps the wordmark legible over the same frame", () => {
      /*
        The mark occupies 17%-43% of the top scrim: 18px to 46px of the
        masthead's 108px block, centred in the 64px row every tab root's header
        has. Login's pill hangs from 10px to 54px, down to 50%. The next test
        is what keeps that true.

        The band moved THREE times. On 14 Sep `LoginButton` joined the masthead
        at `size="md"`, which made the row 44px instead of the mark's own 28px
        and pushed the block to 140px without anybody updating the arithmetic
        here. Then the tail came down from 80px to 48px when the owner asked
        for less shade. Then (6 Oct) the row became the screen header's 64px,
        so a tab change from the feed stops moving the mark and Login, and the
        tail gave back 4px: still 108px, and everything in it sits higher, in
        darker ramp, than it did.

        The floor here is 3:1, not 4.5: the mark is a GRAPHIC and so is the edge
        of the Login pill beside it. The lower ends are checked against 3 for
        that reason (the pill's foot was never checked before, and sat lower),
        and the top against 7 because the top of the band is where the ramp is
        darkest and there is no excuse for it being tight there.
      */
      const ramp = stops("feed-scrim-top");
      expect(paperOverScrim(alphaAt(ramp, 17))).toBeGreaterThanOrEqual(7);
      expect(paperOverScrim(alphaAt(ramp, 43))).toBeGreaterThanOrEqual(3);
      expect(paperOverScrim(alphaAt(ramp, 50))).toBeGreaterThanOrEqual(3);
    });

    it("pins the masthead's height to the gradient measured against it", () => {
      /*
        The one above is a claim about a POSITION in a gradient, and the
        position is decided by the block's own box: the 64px row (the screen
        header's, with `LoginButton` at `size="md"` the tallest thing in it)
        and 44px of tail. 108px, and `feed-scrim-top`'s stops are percentages
        of exactly that. Change either without changing the stops and the mark
        slides into a lighter band with every contrast test still passing,
        which is the quietest possible way to break this.

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
      expect(masthead![0]).toContain("pb-11");
      expect(masthead![0], "the tail is the only padding").not.toMatch(
        /\bp[ty]-/,
      );
      // The row: the screen header's height and inset, centred.
      expect(strip).toMatch(
        /className="feed-scrim-top[^"]*">\s*<div className="flex h-16 items-center justify-between gap-3 px-4">/,
      );

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
   * A translucent paper fill under accent text, on the stage.
   *
   * The v2.7 chips wanted a `paper/10` tint behind `terra-soft` on forest.
   * Composited (sRGB, the way a browser blends it) the tint lifts the ground
   * enough to drop the pairing under AA, while paper text on the same tint
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
    const tint = over(paper, forest, 0.1);
    expect(ratio(terraSoft, tint)).toBeLessThan(4.5);
    expect(ratio(paper, tint)).toBeGreaterThanOrEqual(7.0);
  });
});
