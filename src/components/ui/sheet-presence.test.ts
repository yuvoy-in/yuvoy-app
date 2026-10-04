import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
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
 * root, found by reading the files that import it, so a new sheet is covered
 * the day it is written. A screen that holds a `<Sheet` inside it is checked
 * through that `<Sheet`.
 */

const SRC = join(process.cwd(), "src");

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

const SOURCES = walk(SRC).filter(
  (f) => f.endsWith(".tsx") && !/\.test\.tsx$/.test(f),
);

/** `Sheet`, and each component that returns one as its root. */
function sheetComponents(): Set<string> {
  const names = new Set(["Sheet"]);
  for (const file of SOURCES) {
    const src = readFileSync(file, "utf8");
    if (!/from "@\/components\/ui\/sheet"/.test(src)) continue;
    const starts = [...src.matchAll(/^(?:export )?function ([A-Z]\w*)\(/gm)];
    starts.forEach((m, i) => {
      const body = src.slice(m.index, starts[i + 1]?.index ?? src.length);
      if (/return \(\s*<Sheet\b/.test(body)) names.add(m[1]);
    });
  }
  return names;
}

describe("sheets are mounted through SheetPresence", () => {
  const sheets = sheetComponents();

  it("knows which components are sheets", () => {
    // If this ever finds only `Sheet`, the scan is reading the wrong thing.
    expect(sheets.size).toBeGreaterThan(4);
    expect(sheets).toContain("FilterSheet");
  });

  it.each(SOURCES.map((f) => [relative(process.cwd(), f), f]))(
    "%s mounts no sheet behind a conditional",
    (_, file) => {
      const src = readFileSync(file, "utf8");
      const conditional = new RegExp(
        String.raw`(\?|&&)\s*\(?\s*<(${[...sheets].join("|")})\b`,
        "g",
      );
      const found = [...src.matchAll(conditional)].map(
        (m) => `<${m[2]}> at line ${src.slice(0, m.index).split("\n").length}`,
      );
      expect(
        found,
        "a sheet mounted by a conditional loses its exit: render <SheetPresence open={…}> around it instead",
      ).toEqual([]);
    },
  );
});
