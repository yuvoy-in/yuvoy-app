import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { twMerge } from "tailwind-merge";
import { cn } from "@/lib/cn";

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

/* ------------------------------------------------------------------ type */

/**
 * Brand Kit v3.2, three voices, enforced on every class string.
 *
 * A class string is a string literal in code (comments are already gone, see
 * `read`) or one `@apply` in a stylesheet, so a rule is judged within ONE
 * declaration and never across a file: a `font-display` in one utility once
 * matched a `font-bold` forty lines and six utilities later in globals.css,
 * and the old rule reported a violation that did not exist. Variant prefixes
 * are dropped, so `sm:text-lg` is still a size.
 */
function classStrings(src: string): string[][] {
  return classLiterals(src).map((s) =>
    s
      .split(/\s+/)
      .map((token) => token.replace(/^(?:[^[\]:]*:)+/, ""))
      .filter(Boolean),
  );
}

/** The same declarations as written, `${...}` blanked and variants kept. */
function classLiterals(src: string): string[] {
  const literals = [...src.matchAll(/"([^"\n]*)"|'([^'\n]*)'|`([^`]*)`/g)].map(
    (m) => m[1] ?? m[2] ?? m[3] ?? "",
  );
  const applies = [...src.matchAll(/@apply\s+([^;]+);/g)].map((m) => m[1]);
  return [...literals, ...applies].map((s) => s.replace(/\$\{[^}]*\}/g, " "));
}

const WEIGHT =
  /^font-(thin|extralight|light|medium|semibold|bold|extrabold|black)$/;
const FACE = /^font-(sans|serif|mono|display|board|host)$/;
const TRACKING = /^tracking-/;
const CASE = /^(uppercase|lowercase|capitalize)$/;
const NUMERIC =
  /^(normal-nums|ordinal|slashed-zero|lining-nums|oldstyle-nums|proportional-nums|tabular-nums|diagonal-fractions|stacked-fractions)$/;
const SIZE = /^text-(xs|sm|base|lg|xl|[2-9]xl|\[[^\]]+\]|button|body)(\/\S+)?$/;

/**
 * The type classes a merge took out of one class string. cn() is
 * tailwind-merge, and a class it drops is dropped silently: under the stock
 * rule a size removed any `leading-*` before it, and the prettier plugin,
 * which does not know the theme, sorts `leading-display` ahead of `text-3xl`
 * in every headline (src/lib/cn.ts).
 */
function typeLosses(s: string, merge: (s: string) => string = cn): string[] {
  const kept = new Set(merge(s).split(/\s+/));
  return s.split(/\s+/).filter((token) => {
    const c = token.replace(/^(?:[^[\]:]*:)+/, "");
    return (
      (/^(leading|tracking|font)-/.test(c) || SIZE.test(c)) && !kept.has(token)
    );
  });
}

const TYPE_RULES: { rule: string; broken: (t: string[]) => boolean }[] = [
  {
    // Each cut is ONE baked instance registered at 400 (src/lib/fonts.ts): a
    // weight class makes the browser synthesise a bolder copy of a bold face.
    rule: "a baked cut at a weight class",
    broken: (t) =>
      t.some((c) => c === "font-display" || c === "font-board") &&
      t.some((c) => WEIGHT.test(c)),
  },
  {
    // The board is untracked. `tracking-normal` is that zero, written on a
    // figure inside a tracked headline, so it is the one tracking allowed.
    rule: "a figure on the board without tabular figures, or tracked",
    broken: (t) =>
      t.includes("font-board") &&
      (!t.includes("tabular-nums") ||
        t.some((c) => TRACKING.test(c) && c !== "tracking-normal")),
  },
  {
    rule: "a Yuvoy headline without its leading and its balance",
    broken: (t) =>
      t.includes("font-display") &&
      !(t.includes("leading-display") && t.includes("text-balance")),
  },
  {
    rule: "the headline leading without balance",
    broken: (t) => t.includes("leading-display") && !t.includes("text-balance"),
  },
  {
    rule: "running text without its pretty last line",
    broken: (t) =>
      (t.includes("leading-body") || t.includes("text-body")) &&
      !t.includes("text-pretty"),
  },
  {
    // `voice-host` pins Gotu's one weight, turns synthesis off, and sets its
    // own spacing, case and figures. Anything beside it is our voice leaking
    // into the host's words.
    rule: "the host's words in our weight, face, spacing, case or figures",
    broken: (t) =>
      t.includes("voice-host") &&
      t.some(
        (c) =>
          WEIGHT.test(c) ||
          FACE.test(c) ||
          TRACKING.test(c) ||
          CASE.test(c) ||
          NUMERIC.test(c),
      ),
  },
  {
    rule: "the host's face without voice-host",
    broken: (t) => t.includes("font-host"),
  },
  {
    // A label is 13/18 at every use, so it never sits beside a size: in the
    // cascade the size would win and the label would quietly change.
    rule: "a label or eyebrow resized",
    broken: (t) =>
      (t.includes("label") || t.includes("eyebrow")) &&
      t.some((c) => SIZE.test(c)),
  },
  {
    // A label is weight 500 at every use, as it is 13/18: a weight beside it
    // wins in the cascade and turns the label back into a heading.
    rule: "a label or eyebrow at another weight",
    broken: (t) =>
      (t.includes("label") || t.includes("eyebrow")) &&
      t.some((c) => WEIGHT.test(c)),
  },
  {
    // `uppercase` on machine text in `font-mono` (a code, typed in either
    // case) is the data's own case rather than a voice, and it is never
    // tracked.
    rule: "tracked capitals",
    broken: (t) =>
      t.some((c) => /^tracking-(wide|wider|widest|label)$/.test(c)) ||
      (t.includes("uppercase") && !t.includes("font-mono")),
  },
];

describe("type", () => {
  it("keeps the three voices in every class string", () => {
    const offenders = FILES.flatMap((f) =>
      classStrings(read(f)).flatMap((tokens) =>
        TYPE_RULES.filter(({ broken }) => broken(tokens)).map(
          ({ rule }) => `${rel(f)}: ${rule}: "${tokens.join(" ")}"`,
        ),
      ),
    );
    expect(offenders).toEqual([]);
  });

  /*
    Each rule, shown firing on the defect it exists for and quiet on the
    shape it allows, so a rule that stops matching fails here rather than
    passing silently over the whole tree.
  */
  it.each([
    [
      "font-display tracking-display leading-display text-balance font-bold",
      "a baked cut at a weight class",
    ],
    [
      "font-board text-3xl leading-none tabular-nums font-bold",
      "a baked cut at a weight class",
    ],
    [
      "font-board text-3xl leading-none",
      "a figure on the board without tabular figures, or tracked",
    ],
    [
      "font-board tracking-display text-3xl tabular-nums",
      "a figure on the board without tabular figures, or tracked",
    ],
    [
      "font-display tracking-display text-3xl leading-tight",
      "a Yuvoy headline without its leading and its balance",
    ],
    [
      "voice-host leading-display text-3xl",
      "the headline leading without balance",
    ],
    [
      "text-forest/70 text-body mt-3",
      "running text without its pretty last line",
    ],
    ["voice-host leading-body", "running text without its pretty last line"],
    [
      "voice-host text-base font-bold",
      "the host's words in our weight, face, spacing, case or figures",
    ],
    [
      "voice-host font-display text-3xl",
      "the host's words in our weight, face, spacing, case or figures",
    ],
    [
      "voice-host tracking-wide text-sm",
      "the host's words in our weight, face, spacing, case or figures",
    ],
    [
      "voice-host tabular-nums",
      "the host's words in our weight, face, spacing, case or figures",
    ],
    ["font-host text-sm", "the host's face without voice-host"],
    ["label text-forest/75 text-xs", "a label or eyebrow resized"],
    ["eyebrow text-terra-deep sm:text-sm", "a label or eyebrow resized"],
    ["label text-[11px] font-bold", "a label or eyebrow resized"],
    ["label text-forest/75 font-bold", "a label or eyebrow at another weight"],
    [
      "eyebrow text-terra-deep font-medium",
      "a label or eyebrow at another weight",
    ],
    ["text-xs font-bold uppercase", "tracked capitals"],
    ["label tracking-wider", "tracked capitals"],
    ["font-mono text-sm tracking-wider", "tracked capitals"],
    ["font-mono uppercase tracking-widest", "tracked capitals"],
  ])("fires on %j: %s", (planted, rule) => {
    const fired = classStrings(`"${planted}"`).flatMap((tokens) =>
      TYPE_RULES.filter(({ broken }) => broken(tokens)).map((r) => r.rule),
    );
    expect(fired).toContain(rule);
  });

  it.each([
    "font-display tracking-display leading-display text-3xl text-balance sm:text-4xl",
    "font-board mt-2 text-3xl leading-tight tabular-nums",
    "font-board tracking-normal tabular-nums",
    "voice-host text-paper leading-display line-clamp-3 text-3xl text-balance",
    "voice-host text-forest/70 leading-body mt-3 max-w-prose text-sm text-pretty",
    "text-forest/70 text-body mt-3 max-w-prose text-pretty",
    "label text-forest/75",
    "eyebrow text-terra-deep",
    "text-button font-bold",
    "tracking-ref text-lg font-bold slashed-zero tabular-nums",
    "mt-2 font-mono uppercase",
  ])("allows %j", (allowed) => {
    const fired = classStrings(`"${allowed}"`).flatMap((tokens) =>
      TYPE_RULES.filter(({ broken }) => broken(tokens)).map((r) => r.rule),
    );
    expect(fired).toEqual([]);
  });

  it("keeps every type class in a string that passes through cn", () => {
    const offenders = FILES.filter((f) => !f.endsWith(".css")).flatMap((f) =>
      classLiterals(read(f)).flatMap((s) =>
        typeLosses(s).map((lost) => `${rel(f)}: "${s.trim()}" loses ${lost}`),
      ),
    );
    expect(offenders).toEqual([]);
  });

  it("would catch the stock merge dropping a headline's leading", () => {
    const headline = "font-display leading-tight text-3xl text-balance";
    expect(typeLosses(headline, twMerge)).toEqual(["leading-tight"]);
    expect(typeLosses(headline)).toEqual([]);
    expect(typeLosses("text-sm sm:text-base leading-body text-pretty")).toEqual(
      [],
    );
  });

  it("sets no tracked capitals in a stylesheet either", () => {
    const offenders = FILES.filter((f) => f.endsWith(".css"))
      .filter((f) =>
        /text-transform:\s*uppercase|--tracking-label\b/.test(read(f)),
      )
      .map(rel);
    expect(offenders).toEqual([]);
  });

  it("reads class strings from code and from @apply, one declaration each", () => {
    expect(
      classStrings(
        '<p className="label text-xs">\n@apply font-board tabular-nums;',
      ),
    ).toEqual([
      ["label", "text-xs"],
      ["font-board", "tabular-nums"],
    ]);
    expect(
      classStrings('cn("text-body", `sm:${x} hover:text-pretty`)'),
    ).toEqual([["text-body"], ["text-pretty"]]);
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
          const ease = /\bease-(interaction|cinematic|move|exit)\b/.exec(
            literal,
          );
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
        if (ease === "interaction" || ease === "move" || ease === "exit") {
          /*
            Answering, moving between two places on screen, and leaving
            (the motion system, approved 4 Oct 2026) all live in the
            interaction budget.
          */
          expect(
            ms,
            `${where}: ${ease} motion over budget`,
          ).toBeLessThanOrEqual(250);
        } else if (ease === "cinematic") {
          /*
            Travel: a screen or a picture going somewhere (350ms) or the one
            authored moment in a flow (450ms). Anything this slow answering a
            gesture is the defect above; anything this fast is not travel and
            belongs on the interaction curve; anything slower than the moment
            budget is a drag (the owner's spatial budget, 4 Oct 2026).
          */
          expect(
            ms,
            `${where}: cinematic motion too brief to be travel`,
          ).toBeGreaterThan(250);
          expect(
            ms,
            `${where}: cinematic motion over the moment budget`,
          ).toBeLessThanOrEqual(450);
        }
      }
    });

    it("lets every press animate the property it presses with", () => {
      /*
        Tailwind 4 writes `active:scale-*` to the standalone `scale` property.
        Every press in the app used to sit beside a transition list naming
        only `transform`, so all of them snapped in and snapped back, and no
        test noticed because each class string looked right on its own
        (found by the motion study, 4 Oct 2026). A press must share its
        string with a list that names `scale`: one of the motion utilities,
        `transition-transform` (which covers translate, scale and rotate in
        Tailwind 4), or an explicit list.
      */
      let presses = 0;
      for (const file of FILES.filter((f) => f.endsWith(".tsx"))) {
        const src = read(file);
        for (const [literal] of src.matchAll(/"[^"\n]*"|`[^`\n]*`/g)) {
          if (!/\bactive:scale-/.test(literal)) continue;
          presses += 1;
          const animates =
            /\bmotion-(control|disc)\b/.test(literal) ||
            /\btransition-transform\b/.test(literal) ||
            /\btransition-\[[^\]]*\bscale\b/.test(literal);
          expect(
            animates,
            `${rel(file)}: "${literal.slice(1, 80)}" presses with a scale nothing animates`,
          ).toBe(true);
        }
      }
      expect(
        presses,
        "no presses found: the scan is looking in the wrong place",
      ).toBeGreaterThan(2);
    });

    it("loops only where something is honestly still working", () => {
      /*
        "No loops but honest progress" (the motion system, approved 4 Oct
        2026). Three things in the app turn or breathe until they are done:
        a skeleton, a working button's ring and a slow reel's ring, each
        drawn only while its wait lasts. Anything else that loops is
        decoration that never stops, which is how `animate-spin` and the
        skeleton's repainting sweep shipped before the study. A new loop is
        added here, by name and on purpose, or not at all.
      */
      const allowed = new Set([
        "skeleton-breath",
        "button-ring-turn",
        "feed-ring-turn",
      ]);
      const keywords = new Set([
        "linear",
        "ease",
        "ease-in",
        "ease-out",
        "ease-in-out",
        "step-start",
        "step-end",
        "infinite",
        "none",
        "both",
        "forwards",
        "backwards",
        "normal",
        "reverse",
        "alternate",
        "alternate-reverse",
        "running",
        "paused",
        "auto",
      ]);
      /** A list's members, split at the commas outside any parentheses. */
      const members = (value: string) => {
        const out: string[] = [];
        let depth = 0;
        let from = 0;
        for (let i = 0; i < value.length; i++) {
          if (value[i] === "(") depth += 1;
          else if (value[i] === ")") depth -= 1;
          else if (value[i] === "," && depth === 0) {
            out.push(value.slice(from, i));
            from = i + 1;
          }
        }
        return [...out, value.slice(from)];
      };
      const css = read(join(SRC, "app/globals.css"));
      const loops = [...css.matchAll(/\banimation:\s*([^;]+);/g)]
        .flatMap(([, value]) => members(value))
        .filter((one) => /\binfinite\b/.test(one))
        .map(
          (one) =>
            one
              .trim()
              .split(/\s+/)
              .find((t) => /^[a-z][a-z0-9-]*$/.test(t) && !keywords.has(t)) ??
            one.trim(),
        );
      expect(
        loops.length,
        "no loops found: the scan is looking in the wrong place",
      ).toBeGreaterThan(2);
      for (const name of loops)
        expect(allowed.has(name), `globals.css: "${name}" loops`).toBe(true);

      for (const file of FILES.filter(
        (f) => /\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(f),
      )) {
        const src = read(file);
        expect(
          /\banimate-(spin|pulse|ping|bounce)\b/.test(src),
          `${rel(file)}: a Tailwind loop`,
        ).toBe(false);
        expect(
          /\biterations:\s*Infinity\b/.test(src),
          `${rel(file)}: a scripted loop`,
        ).toBe(false);
        expect(
          /\banimation[A-Za-z]*\s*:\s*["'`][^"'`]*\binfinite\b/.test(src),
          `${rel(file)}: an inline loop`,
        ).toBe(false);
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
      expect(paperOverScrim(alphaAt(ramp, 22))).toBeGreaterThanOrEqual(7);
      expect(paperOverScrim(alphaAt(ramp, 48))).toBeGreaterThanOrEqual(3);
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
