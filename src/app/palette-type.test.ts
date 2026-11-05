import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { twMerge } from "tailwind-merge";
import { cn } from "@/lib/cn";

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
    // `line-clamp` and `truncate` clip at the box, and at a headline's
    // leading the ink overhangs the line. Gotu's tallest accents (Å, Ś, Ǻ)
    // rise up to 0.26em above a 1.08 line and 0.17em above a 1.25 one
    // (fonts.test.ts), its descenders fall below a 1.0 line, and the display
    // cut's below a 1.08 one. So a clamped headline in the host's voice takes
    // `pt-[0.26em]`, with a margin that puts the words back, and never
    // `leading-none`; a clamped Yuvoy headline never takes either.
    rule: "a clamped headline that cuts its own ink",
    broken: (t) => {
      if (!t.some((c) => /^(line-clamp-\d+|truncate)$/.test(c))) return false;
      const none = t.includes("leading-none");
      const tight = t.some((c) => /^leading-(display|tight)$/.test(c));
      if (t.includes("font-display"))
        return none || t.includes("leading-display");
      if (t.includes("voice-host"))
        return none || (tight && !t.includes("pt-[0.26em]"));
      return false;
    },
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
  {
    // Machine text keeps the monospace's own even spacing, which is what
    // makes a code legible. The one tracking it takes is a code input's
    // `tracking-[0.4em]` (the portal's), spacing the digits as they are
    // typed. `tracking-ref` is for references set in Anek, not for this.
    rule: "machine text, tracked",
    broken: (t) =>
      t.includes("font-mono") &&
      t.some(
        (c) =>
          /^tracking-/.test(c) &&
          c !== "tracking-[0.4em]" &&
          c !== "tracking-normal",
      ),
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
    ["tracking-ref mt-8 font-mono text-[10px]", "machine text, tracked"],
    [
      "text-forest/80 tracking-ref mt-2 font-mono text-sm",
      "machine text, tracked",
    ],
    [
      "voice-host text-paper leading-display line-clamp-3 text-3xl text-balance",
      "a clamped headline that cuts its own ink",
    ],
    [
      "voice-host leading-tight truncate text-lg",
      "a clamped headline that cuts its own ink",
    ],
    [
      "voice-host leading-none line-clamp-2 pt-[0.26em] text-xl",
      "a clamped headline that cuts its own ink",
    ],
    [
      "font-display tracking-display leading-display line-clamp-2 text-2xl text-balance",
      "a clamped headline that cuts its own ink",
    ],
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
    "voice-host text-paper leading-display -mt-[0.26em] line-clamp-3 pt-[0.26em] text-3xl text-balance",
    "voice-host mt-2 line-clamp-2 block text-sm leading-snug text-balance",
    "voice-host truncate",
    "voice-host text-forest/70 leading-body mt-3 max-w-prose text-sm text-pretty",
    "text-forest/70 text-body mt-3 max-w-prose text-pretty",
    "label text-forest/75",
    "eyebrow text-terra-deep",
    "text-button font-bold",
    "tracking-ref text-lg font-bold slashed-zero tabular-nums",
    "mt-2 font-mono uppercase",
    "mt-2 font-mono text-2xl tracking-[0.4em]",
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
