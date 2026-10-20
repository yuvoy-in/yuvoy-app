import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import ts from "typescript";

/**
 * No screen names a place it does not know from data (yuvoy-app#181, R0-T5).
 *
 * Yuvoy is opening beyond the Andamans, so a generic screen may not name the
 * Andamans, Havelock, an island or a jetty: a page about a listing names its
 * market from `GET /places` (`lib/site/places.ts`). The words that stay are
 * the rows the spec keeps, each with its reason below, and nothing else.
 *
 * Shown strings only, read with the TypeScript parser: string literals,
 * template text and JSX text, never a comment, an import or an identifier.
 * A comment about Havelock's signal is history; a heading that says it is
 * copy. Tests and the generated contract are not shown to anybody.
 */

const ROOT = process.cwd();

/** The words, whole: "island" in "Islandwide" is not one of them. */
const PLACE = new RegExp(
  ["andamans?", "havelock", "islands?", "jett(y|ies)"]
    .map((w) => `\\b${w}\\b`)
    .join("|"),
  "i",
);

/** What may still name a place, file by file, and why. */
const KEPT: Record<string, { words: RegExp; why: string }> = {
  "src/app/guides/page.tsx": {
    words: /Andamans/,
    why: "the five guides are about the Andamans",
  },
  "src/app/llms.txt/route.ts": {
    words: /./,
    why: "describes today's product; rewritten when R2 reaches everyone",
  },
  "src/components/booking/booking-screen.tsx": {
    words: /\bjetty\b/,
    why: "only bookable markets sell, and the only one is Andaman (R0-T1)",
  },
  "src/components/booking/keep-booking.tsx": {
    words: /\bjetty\b/,
    why: "only bookable markets sell, and the only one is Andaman (R0-T1)",
  },
  "src/components/checkout/screening-fields.tsx": {
    words: /\bjetty\b/,
    why: "only bookable markets sell, and the only one is Andaman (R0-T1)",
  },
  "src/components/trips/next-up-pass.tsx": {
    words: /\bjetty\b/,
    why: "only bookable markets sell, and the only one is Andaman (R0-T1)",
  },
  "src/components/trips/island-days.tsx": {
    words: /^(island-days|Your island days)$/,
    why: "kept until a second bookable market exists (yuvoy-api#341)",
  },
  "src/lib/site/marketing-redirects.ts": {
    words: /^\/destinations\//,
    why: "an old marketing address, matched and redirected, never shown",
  },
  "src/lib/site/places.ts": {
    words: /^the Andaman Islands$/,
    why: "how the andaman market reads in a sentence, keyed by its key",
  },
};

/** Every shown string in one source file, as `line: text`. */
function shownPlaceWords(file: string, source: string): string[] {
  const tree = ts.createSourceFile(
    file,
    source,
    ts.ScriptTarget.Latest,
    true,
    file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const found: string[] = [];
  const visit = (node: ts.Node) => {
    const text =
      ts.isStringLiteral(node) ||
      ts.isNoSubstitutionTemplateLiteral(node) ||
      ts.isTemplateHead(node) ||
      ts.isTemplateMiddle(node) ||
      ts.isTemplateTail(node) ||
      ts.isJsxText(node)
        ? node.text.replace(/\s+/g, " ").trim()
        : null;
    const imported =
      ts.isImportDeclaration(node.parent ?? node) ||
      ts.isExportDeclaration(node.parent ?? node);
    if (text && !imported && PLACE.test(text)) {
      const { line } = tree.getLineAndCharacterOfPosition(node.getStart());
      found.push(`${line + 1}: ${text}`);
    }
    ts.forEachChild(node, visit);
  };
  visit(tree);
  return found;
}

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

const files = walk(join(ROOT, "src"))
  .filter((f) => /\.tsx?$/.test(f))
  .filter((f) => !/\.test\.tsx?$/.test(f) && !f.endsWith("schema.gen.ts"));

const scanned = files.map((file) => {
  const path = relative(ROOT, file).split("\\").join("/");
  return { path, words: shownPlaceWords(path, readFileSync(file, "utf8")) };
});

describe("place words in shown strings", () => {
  it("reads a believable number of files, and finds the rows it keeps", () => {
    // The guard on the guard: a walk that found nothing would pass forever.
    expect(files.length).toBeGreaterThan(200);
    expect(
      scanned.find((f) => f.path === "src/app/guides/page.tsx")?.words.length,
    ).toBeGreaterThan(0);
  });

  it("catches a place written into a heading, an attribute or a template", () => {
    const planted = [
      "const a = <h1>Experiences in the Andaman Islands</h1>;",
      'const b = <input placeholder="Diving, boats, Havelock…" />;',
      "const c = `${title} on the island`;",
      'const d = "Meet at the jetty";',
    ];
    for (const line of planted) {
      expect(shownPlaceWords("planted.tsx", line), line).toHaveLength(1);
    }
    // Comments and identifiers are not shown.
    expect(
      shownPlaceWords(
        "planted.tsx",
        "// Havelock signal\nconst IslandDays = 1; /* the jetty */",
      ),
    ).toEqual([]);
  });

  it("names no place outside the rows the spec keeps", () => {
    const strays = scanned.flatMap(({ path, words }) => {
      const kept = KEPT[path];
      return words
        .filter((hit) => !kept?.words.test(hit.replace(/^\d+: /, "")))
        .map((hit) => `${path}:${hit}`);
    });
    expect(
      strays,
      "a shown string names a place. Name it from GET /places " +
        "(lib/site/places.ts), or keep it here with the reason",
    ).toEqual([]);
  });

  it("keeps no row it no longer needs", () => {
    // A kept row whose words are gone is an exemption left open for later.
    const unused = Object.keys(KEPT).filter(
      (path) => !scanned.some((f) => f.path === path && f.words.length > 0),
    );
    expect(unused).toEqual([]);
  });
});
