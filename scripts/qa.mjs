#!/usr/bin/env node
/**
 * Static QA sweep.
 *
 * Catches the class of defect that typechecks, lints and unit-tests all pass:
 * a link to a route that does not exist, a screen missing a state, a debug
 * statement left in, a nav entry with no page. None of these fail a build;
 * all of them are visible to a traveller.
 */
import { readdirSync, statSync, readFileSync, existsSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();
const SRC = join(ROOT, "src");
const APP = join(SRC, "app");

const problems = [];
const notes = [];

function walk(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((n) => {
    const full = join(dir, n);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

const files = walk(SRC).filter(
  (f) => /\.tsx?$/.test(f) && !f.endsWith(".gen.ts"),
);
const code = (f) =>
  readFileSync(f, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
const rel = (f) => relative(ROOT, f);

/* ---------------------------------------------- 1. routes that exist ----- */

const routes = new Set(["/"]);
for (const f of walk(APP)) {
  if (!/[/\\]page\.tsx$/.test(f)) continue;
  const r =
    "/" +
    relative(APP, f)
      .replace(/[/\\]page\.tsx$/, "")
      .replace(/^page\.tsx$/, "")
      .replace(/\\/g, "/");
  routes.add(r === "/" ? "/" : r.replace(/\/\(.*?\)/g, ""));
}

function routeMatches(href) {
  const path = href.split("?")[0].split("#")[0];
  if (path === "" || path.startsWith("http") || path.startsWith("mailto"))
    return true;
  if (routes.has(path)) return true;
  // Dynamic segments.
  for (const r of routes) {
    if (!r.includes("[")) continue;
    const re = new RegExp(
      "^" +
        r.replace(/\[\.\.\..+?\]/g, ".+").replace(/\[.+?\]/g, "[^/]+") +
        "$",
    );
    if (re.test(path)) return true;
  }
  return false;
}

for (const f of files) {
  const s = code(f);
  for (const m of s.matchAll(/href=\{?["'`](\/[^"'`}\s]*)["'`]/g)) {
    if (!routeMatches(m[1])) {
      problems.push(`${rel(f)}: links to "${m[1]}" — no such route`);
    }
  }
  // Template-literal hrefs with a leading static segment.
  for (const m of s.matchAll(/href=\{`(\/[a-z-]+)\//gi)) {
    const base = m[1];
    if (![...routes].some((r) => r.startsWith(base))) {
      problems.push(`${rel(f)}: links under "${base}/" — no route beneath it`);
    }
  }
}

/* ------------------------------------------ 2. nav registry has pages ---- */

const nav = readFileSync(join(SRC, "lib/site/nav.ts"), "utf8");
for (const m of nav.matchAll(/href:\s*"([^"]+)"/g)) {
  if (!routeMatches(m[1])) {
    problems.push(`nav.ts: registry names "${m[1]}" but no page ships it`);
  }
}

/* ------------------------------------------------- 3. debug leftovers ---- */

for (const f of files) {
  const s = code(f);
  if (/console\.(log|debug|table)\(/.test(s)) {
    problems.push(`${rel(f)}: console.log left in`);
  }
  if (/\.only\(/.test(s)) {
    problems.push(
      `${rel(f)}: a focused test (.only) would silently skip the rest`,
    );
  }
  if (/\bdebugger\b/.test(s)) problems.push(`${rel(f)}: debugger statement`);
  if (/TODO|FIXME|XXX/.test(s)) {
    notes.push(`${rel(f)}: carries a TODO/FIXME`);
  }
}

/* -------------------------------------------- 4. screens have states ----- */

// Any component that runs a query must render loading AND error.
for (const f of files) {
  if (/\.test\.tsx?$/.test(f)) continue;
  const s = code(f);
  const queries = /useQuery\(|useInfiniteQuery\(/.test(s);
  // Hooks in lib/ return state; the COMPONENT renders it. Only check the
  // things that actually paint.
  if (!queries || /[/\\]lib[/\\]/.test(f)) continue;
  const hasLoading = /isPending|isLoading|LoadingState|Skeleton/.test(s);
  const hasError = /isError|ErrorState/.test(s);
  if (!hasLoading)
    problems.push(`${rel(f)}: queries but renders no loading state`);
  if (!hasError) problems.push(`${rel(f)}: queries but renders no error state`);
}

/* ------------------------------------------------- 5. a11y basics -------- */

for (const f of files) {
  if (/\.test\.tsx?$/.test(f)) continue;
  const s = code(f);
  // An <input> with neither a bound label nor an accessible name.
  for (const m of s.matchAll(/<input\b[^>]*>/g)) {
    const tag = m[0];
    if (/type="(hidden|radio|checkbox)"/.test(tag)) continue;
    // A <label> wrapping the input also names it — but only when nothing
    // ELSE inside that label contributes text, which is the bug this catches.
    if (!/(aria-label|aria-labelledby|\bid=)/.test(tag)) {
      problems.push(
        `${rel(f)}: <input> with no id or aria-label — use <Field>`,
      );
    }
  }
  // Icon-only buttons need a name.
  for (const m of s.matchAll(/<button\b[^>]*>\s*\{?["'`]?[−+×✕]/g)) {
    const tag = m[0];
    if (!/aria-label/.test(tag)) {
      problems.push(`${rel(f)}: symbol-only <button> with no aria-label`);
    }
  }
}

/* ------------------------------------------- 6. money + time discipline -- */

for (const f of files) {
  if (/\.test\.tsx?$/.test(f) || /lib\/format\//.test(f)) continue;
  const s = code(f);
  if (/amountMinor\s*\/\s*100/.test(s)) {
    problems.push(`${rel(f)}: divides paise by hand — use formatMoney()`);
  }
  if (/toLocaleTimeString|toLocaleDateString/.test(s)) {
    problems.push(`${rel(f)}: toLocale* on a date — use the market's zone`);
  }
}

/* ------------------------------- 7. client code must stay browser-safe --- */

/**
 * A client component that transitively reaches a Node-only module.
 *
 * This shipped once: mocks/start.ts held both the browser and the server MSW
 * starts, so the bundler traced msw/node — and therefore `async_hooks` — into
 * the client graph. `next build` passed. `pnpm dev` failed with a
 * module-not-found in the browser.
 *
 * A dynamic `await import()` does NOT save you: the bundler still follows it.
 * Keeping the two sides in separate files is the only thing that does.
 */

const NODE_ONLY = [
  /^node:/,
  /^(async_hooks|fs|path|os|crypto|child_process|worker_threads|http|https|net|tls|zlib|stream)$/,
  /^msw\/node$/,
];

function resolveImport(fromFile, spec) {
  let base;
  if (spec.startsWith("@/")) base = join(SRC, spec.slice(2));
  else if (spec.startsWith(".")) base = join(fromFile, "..", spec);
  else return null; // bare package — checked by NODE_ONLY, not resolved
  for (const ext of [".ts", ".tsx", "/index.ts", "/index.tsx", ""]) {
    const candidate = base + ext;
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  }
  return null;
}

function importsOf(file) {
  const s = code(file);
  const specs = [];
  for (const m of s.matchAll(/from\s+["']([^"']+)["']/g)) specs.push(m[1]);
  for (const m of s.matchAll(/import\s*\(\s*["']([^"']+)["']\s*\)/g))
    specs.push(m[1]);
  for (const m of s.matchAll(/require\(\s*["']([^"']+)["']\s*\)/g))
    specs.push(m[1]);
  return specs;
}

// Every file that is, or is reached from, a "use client" module.
const clientRoots = files.filter(
  (f) =>
    /^\s*["']use client["']/m.test(readFileSync(f, "utf8")) &&
    !/\.test\.tsx?$/.test(f),
);

const visited = new Map(); // file -> path taken to reach it
for (const root of clientRoots) {
  const queue = [[root, [rel(root)]]];
  while (queue.length) {
    const [file, trail] = queue.shift();
    if (visited.has(file)) continue;
    visited.set(file, trail);

    for (const spec of importsOf(file)) {
      if (NODE_ONLY.some((re) => re.test(spec))) {
        problems.push(
          `client graph reaches Node-only "${spec}"\n      via ${trail.join(" → ")}`,
        );
        continue;
      }
      const next = resolveImport(file, spec);
      if (next && !visited.has(next)) queue.push([next, [...trail, rel(next)]]);
    }
  }
}

/* ------------------------- 8. mocks may not invent endpoints ------------- */

/**
 * Every path a handler serves must exist in the contract.
 *
 * A mock for an endpoint the API does not have is worse than no mock: it is
 * how a deleted feature gets rebuilt against a shape that exists only on one
 * laptop. This caught /auth/otp/* still being served after the traveller
 * sign-in was removed upstream.
 */
{
  const contract = readFileSync(join(ROOT, "contracts/openapi.yaml"), "utf8");
  const contractPaths = [...contract.matchAll(/^ {2}(\/[a-z][^:]*):/gim)].map(
    (m) => m[1],
  );

  const toRegex = (p) =>
    new RegExp(
      "^" + p.replace(/\{[^}]+\}/g, "[^/]+").replace(/\//g, "\\/") + "$",
    );
  const known = contractPaths.map(toRegex);

  for (const f of walk(join(ROOT, "mocks"))) {
    if (!/\.ts$/.test(f)) continue;
    const s = code(f);
    for (const m of s.matchAll(/url\("([^"]+)"\)/g)) {
      const served = m[1].replace(/:[a-zA-Z]+/g, "{x}");
      if (!known.some((re) => re.test(served))) {
        problems.push(
          `${rel(f)}: mocks "${m[1]}", which the contract does not have`,
        );
      }
    }
  }
}

/* --------------------------------------------------------------- report -- */

console.log(`\nroutes: ${[...routes].sort().join("  ")}\n`);
if (notes.length) {
  console.log("notes");
  for (const n of notes) console.log(`  · ${n}`);
  console.log("");
}
if (problems.length) {
  console.error(`✗ ${problems.length} QA problem(s)\n`);
  for (const p of problems) console.error(`  ✗ ${p}`);
  console.error("");
  process.exit(1);
}
console.log("✓ QA sweep clean\n");
