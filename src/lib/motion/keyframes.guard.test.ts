import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import ts from "typescript";
import { arriveFrom } from ".";

/**
 * No animation in this app plays backwards because of how it was written.
 *
 * Web Animations reads a lone keyframe with no `offset` as the END of the
 * animation and starts from the element's own value, so `[{ opacity: 0 }]`
 * draws the element whole, fades it out and draws it whole again
 * (`arriveFrom` in `./index.ts` has the measurements). Eleven arrivals were
 * written that way, in five files, and every test of them passed: they
 * checked the keyframes each call was given, and the keyframes were exactly
 * what the code meant to write. The owner found it on the Trips tabs
 * (7 Oct 2026).
 *
 * So this reads the code itself. Every `.animate()` call in `src` is parsed
 * (comments and strings are not code, so a sentence about the rule cannot
 * trip it) and fails when its keyframes could be a lone one with no offset:
 *
 *   - an array of one keyframe, unless that keyframe says `offset: 0`;
 *   - an array of one ANYTHING else (`[from]`): its offset cannot be read
 *     here, and this was the exact shape of the defect;
 *   - keyframes by property (`{ opacity: 0 }`) with any value that is not a
 *     list of two or more;
 *   - a name, a condition or a parenthesis that leads to one of those within
 *     the file.
 *
 * A call made through a function (`arriveFrom`, a helper) is that function's
 * business, and `arriveFrom` is tested below.
 */

const ROOT = process.cwd();

interface Finding {
  file: string;
  line: number;
  code: string;
}

/** Properties of a keyframe object that are not animated values. */
const TIMING_KEYS = new Set(["offset", "easing", "composite"]);

function propertyName(p: ts.ObjectLiteralElementLike): string | null {
  if (!p.name) return null;
  if (ts.isIdentifier(p.name) || ts.isStringLiteral(p.name)) return p.name.text;
  return null;
}

/** `{ ..., offset: 0 }`, written as a literal. */
function startsAtZero(keyframe: ts.Expression): boolean {
  if (!ts.isObjectLiteralExpression(keyframe)) return false;
  return keyframe.properties.some(
    (p) =>
      ts.isPropertyAssignment(p) &&
      propertyName(p) === "offset" &&
      ts.isNumericLiteral(p.initializer) &&
      Number(p.initializer.text) === 0,
  );
}

function unwrap(node: ts.Expression): ts.Expression {
  let at = node;
  while (
    ts.isParenthesizedExpression(at) ||
    ts.isAsExpression(at) ||
    ts.isSatisfiesExpression(at) ||
    ts.isNonNullExpression(at)
  )
    at = at.expression;
  return at;
}

/** Every `.animate()` call in `source` whose keyframes could play backwards. */
function loneKeyframes(source: string, file = "inline.tsx"): Finding[] {
  const sf = ts.createSourceFile(
    file,
    source,
    ts.ScriptTarget.Latest,
    true,
    file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );

  // What each name in the file is ever set to, for `animate(frames, …)`.
  const values = new Map<string, ts.Expression[]>();
  const note = (name: string, value: ts.Expression) =>
    values.set(name, [...(values.get(name) ?? []), value]);
  const collect = (node: ts.Node) => {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.initializer
    )
      note(node.name.text, node.initializer);
    if (
      ts.isBinaryExpression(node) &&
      node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
      ts.isIdentifier(node.left)
    )
      note(node.left.text, node.right);
    ts.forEachChild(node, collect);
  };
  collect(sf);

  const backwards = (arg: ts.Expression, seen = new Set<string>()): boolean => {
    const at = unwrap(arg);
    if (ts.isArrayLiteralExpression(at)) {
      if (at.elements.length !== 1) return false;
      const only = at.elements[0];
      return ts.isSpreadElement(only) || !startsAtZero(only);
    }
    if (ts.isObjectLiteralExpression(at)) {
      return at.properties.some((p) => {
        const name = propertyName(p);
        if (name !== null && TIMING_KEYS.has(name)) return false;
        if (!ts.isPropertyAssignment(p)) return true;
        const value = unwrap(p.initializer);
        return !ts.isArrayLiteralExpression(value) || value.elements.length < 2;
      });
    }
    if (ts.isConditionalExpression(at))
      return backwards(at.whenTrue, seen) || backwards(at.whenFalse, seen);
    if (ts.isIdentifier(at) && !seen.has(at.text)) {
      const next = new Set(seen).add(at.text);
      return (values.get(at.text) ?? []).some((v) => backwards(v, next));
    }
    return false;
  };

  const found: Finding[] = [];
  const visit = (node: ts.Node) => {
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      node.expression.name.text === "animate" &&
      node.arguments.length > 0 &&
      backwards(node.arguments[0])
    ) {
      found.push({
        file,
        line: sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1,
        code: node.getText(sf).split("\n")[0],
      });
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
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

describe("arriveFrom", () => {
  it("pins its keyframe at the start, so the element's own style is the end", () => {
    expect(arriveFrom({ opacity: 0 })).toEqual([{ opacity: 0, offset: 0 }]);
    expect(arriveFrom({ opacity: 0, transform: "translateY(8px)" })).toEqual([
      { opacity: 0, transform: "translateY(8px)", offset: 0 },
    ]);
  });

  it("leaves the keyframe it was given alone", () => {
    const start = { opacity: 0 };
    arriveFrom(start);
    expect(start).toEqual({ opacity: 0 });
  });
});

describe("what the scan calls backwards", () => {
  const count = (code: string) => loneKeyframes(code).length;

  it.each([
    ["one keyframe", "el.animate([{ opacity: 0 }], { duration: 150 });"],
    ["through `?.`", 'el?.animate([{ transform: "translateY(12px)" }], {});'],
    ["one name in a list", "el.animate([from], { duration: 150 });"],
    ["one spread", "el.animate([...frames], { duration: 150 });"],
    ["by property", "el.animate({ opacity: 0 }, 150);"],
    ["by property, one value", "el.animate({ opacity: [0] }, 150);"],
    ["through a name", "const f = [{ opacity: 0 }];\nel.animate(f, {});"],
    [
      "in either branch",
      "el.animate(r ? [{ opacity: 0 }] : [{ opacity: 0 }, { opacity: 1 }]);",
    ],
    ["a later assignment", "let f = a;\nf = [{ opacity: 0 }];\nel.animate(f);"],
    ["the wrong offset", "el.animate([{ opacity: 0, offset: 1 }], {});"],
  ])("%s", (_, code) => expect(count(code)).toBe(1));

  it.each([
    ["two keyframes", "el.animate([{ opacity: 0 }, { opacity: 1 }], {});"],
    ["arriveFrom", "el.animate(arriveFrom({ opacity: 0 }), {});"],
    ["offset 0 by hand", "el.animate([{ opacity: 0, offset: 0 }], {});"],
    ["a list of values", "el.animate({ opacity: [0, 1], easing: 'x' }, 150);"],
    [
      "a name set to two",
      "let f: Keyframe[];\nif (a) f = [{ x: 0 }, { x: 1 }];\nelse f = [{ y: 0 }, { y: 1 }];\nel.animate(f);",
    ],
    ["a comment", "// el.animate([{ opacity: 0 }])\nconst x = 1;"],
    ["a string", 'const s = "el.animate([{ opacity: 0 }])";'],
    ["something else's animate", "animate([{ opacity: 0 }]);"],
  ])("not %s", (_, code) => expect(count(code)).toBe(0));
});

describe("the app's own animations", () => {
  const files = walk(join(ROOT, "src")).filter(
    (f) => /\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(f),
  );

  it("reads the code it means to", () => {
    // A scan that found nothing to scan would pass for the wrong reason.
    expect(files.length).toBeGreaterThan(100);
    const calls = files.reduce(
      (n, f) =>
        n + (readFileSync(f, "utf8").match(/\.animate\(/g)?.length ?? 0),
      0,
    );
    expect(calls).toBeGreaterThan(20);
  });

  it("starts every lone keyframe where its arrival starts", () => {
    const found = files.flatMap((f) =>
      loneKeyframes(readFileSync(f, "utf8"), relative(ROOT, f)),
    );
    expect(
      found.map((f) => `${f.file}:${f.line}  ${f.code}`),
      "a lone keyframe with no offset is where the animation ENDS: use arriveFrom()",
    ).toEqual([]);
  });
});
