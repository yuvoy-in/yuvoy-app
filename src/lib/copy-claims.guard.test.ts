import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

/**
 * No claim that a model was trained on our data, anywhere a person reads
 * (yuvoy-app#181, REQ-R0-31, FIXPACK-product 1.8).
 *
 * Trigo and the ranking run on a model nobody here trained, so a sentence
 * saying it was tuned on Yuvoy's data would be a claim with no record behind
 * it. The positioning line goes live with `explore` at `all`
 * (`siteDescription`); this guard does not wait for it. The phone app holds
 * the same rule in its `scripts/qa.mjs`.
 *
 * Copied from `components/ui/wordmark.guard.test.ts`: it walks `src` and
 * `public` and fails on the words themselves, in either spelling and any
 * case. Like that guard, it never writes the words out, so a literal grep for
 * them over this repository comes back empty, this file included: the needle
 * is joined from fragments at runtime.
 */

const ROOT = process.cwd();
const SCANNED = ["src", "public"];

/** "fine", then a hyphen, a space or nothing, then "tuned". */
const CLAIM = new RegExp(["fine", "[-\\s]?", "tuned"].join(""), "i");

/** Every file under the scanned directories. */
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

/* Text only: every file a shown string can live in. */
const TEXT = /\.(tsx?|jsx?|mjs|cjs|css|svg|json|md|txt|webmanifest|html)$/;

const files = SCANNED.flatMap((d) => walk(join(ROOT, d)))
  .filter((f) => TEXT.test(f))
  .filter((f) => f !== __filename);

/** The lines of `text` that make the claim, as `where:line: text`. */
function claimsIn(text: string, where: string): string[] {
  const found: string[] = [];
  text.split("\n").forEach((line, i) => {
    if (CLAIM.test(line)) found.push(`${where}:${i + 1}: ${line.trim()}`);
  });
  return found;
}

describe("copy claims", () => {
  it("scans a believable number of files, so a broken walk cannot pass", () => {
    expect(files.length).toBeGreaterThan(100);
    expect(files.some((f) => f.endsWith(join("app", "layout.tsx")))).toBe(true);
    expect(files.some((f) => f.endsWith("consent-words.ts"))).toBe(true);
  });

  it("catches the claim in both spellings and any case", () => {
    // The guard on the guard: planted, it must fire.
    const planted = [
      ["Fine", "tuned on Yuvoy"].join("-"),
      ["a model", "fine", "tuned for trips"].join(" "),
      ["FINE", "TUNED"].join(""),
    ];
    for (const line of planted) {
      expect(claimsIn(line, "planted"), line).toHaveLength(1);
    }
    expect(claimsIn("A fine day, well tuned.", "planted")).toEqual([]);
  });

  it("finds no claim of a tuned model in any shown string", () => {
    const found = files.flatMap((file) =>
      claimsIn(readFileSync(file, "utf8"), relative(ROOT, file)),
    );
    expect(
      found,
      "a claim that a model was trained on our data. Nothing here backs it",
    ).toEqual([]);
  });
});
