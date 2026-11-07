import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * No sheet is mounted by a conditional (T06 A, approved 4 Oct 2026).
 *
 * A sheet leaves the way it came, and the dialog closes only once its exit has
 * run. A caller that writes `{open ? <FilterSheet … /> : null}` unmounts the
 * sheet on the frame it closes, so it vanishes in one frame again, and nothing
 * else notices: every test of the sheet itself still passes. So every caller
 * renders `<SheetPresence open={…}>` around it instead, and this reads the
 * source for the shape that undoes that.
 *
 * "A sheet" is `Sheet` itself and every component that returns one as its
 * root, found by reading the files, so a new sheet is covered the day it is
 * written. A screen that holds a `<Sheet` inside it is checked through that
 * `<Sheet`.
 *
 * A sheet is known by its file and its name, and a tag by what the file it is
 * written in imports under that name. Two components may share a name in
 * different files (two `ReportSheet`s did, on 29 Oct 2026), and only the one
 * that is a sheet counts.
 */

const SRC = join(process.cwd(), "src");
const SHEET = `${join(SRC, "components/ui/sheet.tsx")}#Sheet`;

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

/** Source by absolute path. */
type Files = Map<string, string>;

/** The file an import names, if it is one of `files`. */
function resolveImport(files: Files, from: string, spec: string) {
  const base = spec.startsWith("@/")
    ? join(SRC, spec.slice(2))
    : spec.startsWith(".")
      ? join(dirname(from), spec)
      : null;
  if (!base) return null;
  return (
    [`${base}.tsx`, join(base, "index.tsx")].find((f) => files.has(f)) ?? null
  );
}

/** Each name a file can write as a tag, as "file#Name" of what it is. */
function scope(files: Files, file: string): Map<string, string> {
  const src = files.get(file)!;
  const names = new Map<string, string>();
  for (const m of src.matchAll(/^(?:export )?function ([A-Z]\w*)\(/gm)) {
    names.set(m[1], `${file}#${m[1]}`);
  }
  for (const m of src.matchAll(/import\s*\{([^}]*)\}\s*from\s*"([^"]+)"/g)) {
    const target = resolveImport(files, file, m[2]);
    if (!target) continue;
    for (const part of m[1].split(",")) {
      const [name, local = name] = part
        .replace(/^\s*type\s+/, "")
        .split(/\s+as\s+/)
        .map((s) => s.trim());
      if (/^[A-Z]\w*$/.test(local)) names.set(local, `${target}#${name}`);
    }
  }
  return names;
}

/** `Sheet`, and each component that returns a sheet as its root. */
function sheetComponents(files: Files): Set<string> {
  const sheets = new Set([SHEET]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const [file, src] of files) {
      const names = scope(files, file);
      const starts = [...src.matchAll(/^(?:export )?function ([A-Z]\w*)\(/gm)];
      starts.forEach((m, i) => {
        const key = `${file}#${m[1]}`;
        if (sheets.has(key)) return;
        const body = src.slice(m.index, starts[i + 1]?.index ?? src.length);
        const root = /return \(\s*<([A-Z]\w*)\b/.exec(body)?.[1];
        const of = root && names.get(root);
        if (of && sheets.has(of)) {
          sheets.add(key);
          grew = true;
        }
      });
    }
  }
  return sheets;
}

/** Each sheet `file` mounts behind `?` or `&&`, as "<Name> at line n". */
function conditionalSheets(
  files: Files,
  sheets: Set<string>,
  file: string,
): string[] {
  const src = files.get(file)!;
  const local = [...scope(files, file)]
    .filter(([, of]) => sheets.has(of))
    .map(([name]) => name);
  if (local.length === 0) return [];
  const conditional = new RegExp(
    String.raw`(\?|&&)\s*\(?\s*<(${local.join("|")})\b`,
    "g",
  );
  return [...src.matchAll(conditional)].map(
    (m) => `<${m[2]}> at line ${src.slice(0, m.index).split("\n").length}`,
  );
}

const FILES: Files = new Map(
  walk(SRC)
    .filter((f) => f.endsWith(".tsx") && !/\.test\.tsx$/.test(f))
    .map((f) => [f, readFileSync(f, "utf8")]),
);

describe("sheets are mounted through SheetPresence", () => {
  const sheets = sheetComponents(FILES);

  it("knows which components are sheets", () => {
    // If this ever finds only `Sheet`, the scan is reading the wrong thing.
    expect(sheets.size).toBeGreaterThan(4);
    expect(sheets).toContain(
      `${join(SRC, "components/search/filter-sheet.tsx")}#FilterSheet`,
    );
  });

  it("tells apart two components of one name in different files", () => {
    const at = (path: string) => join(SRC, path);
    const files: Files = new Map([
      [at("components/ui/sheet.tsx"), "export function Sheet() {}"],
      [
        at("a/panel.tsx"),
        'import { Sheet } from "@/components/ui/sheet";\n' +
          "export function Panel() {\n  return (\n    <Sheet open />\n  );\n}",
      ],
      [
        at("b/panel.tsx"),
        "export function Panel() {\n  return (\n    <div />\n  );\n}",
      ],
      [
        at("b/uses-b.tsx"),
        'import { Panel } from "./panel";\nconst x = open ? <Panel /> : null;',
      ],
      [
        at("c/uses-a.tsx"),
        'import { Panel as P } from "@/a/panel";\nconst x = open && <P />;',
      ],
    ]);
    const known = sheetComponents(files);
    expect(known).toContain(`${at("a/panel.tsx")}#Panel`);
    expect(known).not.toContain(`${at("b/panel.tsx")}#Panel`);
    expect(conditionalSheets(files, known, at("b/uses-b.tsx"))).toEqual([]);
    expect(conditionalSheets(files, known, at("c/uses-a.tsx"))).toEqual([
      "<P> at line 2",
    ]);
  });

  it.each([...FILES.keys()].map((f) => [relative(process.cwd(), f), f]))(
    "%s mounts no sheet behind a conditional",
    (_, file) => {
      expect(
        conditionalSheets(FILES, sheets, file),
        "a sheet mounted by a conditional loses its exit: render <SheetPresence open={…}> around it instead",
      ).toEqual([]);
    },
  );
});
