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

/* --------------- 9. seeded query data must carry its own timestamp ------- */

/**
 * `initialData` without `initialDataUpdatedAt`.
 *
 * React Query treats seeded data with no timestamp as infinitely stale and
 * refetches it the moment the component mounts — so the server fetch that was
 * added to put content in the HTML is thrown away on hydration. Everything
 * still works, the tests still pass, and the only symptom is the LCP number
 * going back to where it was. Exactly the kind of regression nobody notices.
 */

for (const f of files) {
  const s = code(f);
  if (!/\binitialData\b\s*:/.test(s)) continue;
  if (!/\binitialDataUpdatedAt\b/.test(s)) {
    problems.push(
      `${rel(f)}: seeds initialData with no initialDataUpdatedAt — ` +
        `it will be refetched on hydration`,
    );
  }
}

/**
 * A robots.txt disallow rule and an app path describe the same route in two
 * dialects. robots.txt writes a star where the filesystem writes a bracketed
 * segment — a checkout URL is "/e/<star>/book" to a crawler and
 * "/e/[slug]/book" on disk. Both wildcards mean exactly one segment.
 *
 * (Written as <star> on purpose: the literal characters close this comment.)
 */
function coversRoute(rule, route) {
  const pattern = rule
    .replace(/\/$/, "")
    .split("*")
    .map((part) => part.replace(/[^a-zA-Z0-9/_-]/g, ""))
    .join("[^/]+");
  return new RegExp(`^${pattern}(/|$)`).test(
    route.replace(/\[[^\]]+\]/g, "SEGMENT"),
  );
}

/* ------------------- 10. indexing is decided in exactly one place -------- */

/**
 * A `robots:` metadata literal written anywhere but lib/site/indexing.ts.
 *
 * robots.txt and the `<meta name="robots">` tag are one decision expressed
 * twice, and they had drifted: robots.ts read NEXT_PUBLIC_ALLOW_INDEXING while
 * the root layout hardcoded `index: false`. Flipping the flag at the domain
 * cutover would have opened crawling on a site whose every page still said
 * noindex — crawled, unindexable, and indistinguishable from success until
 * somebody checked Search Console weeks later.
 *
 * Nothing about that is visible in either file on its own, which is why it is
 * a guard rather than a code-review habit.
 */

{
  const appFiles = walk(APP).filter((f) => /\.tsx?$/.test(f));

  for (const f of appFiles) {
    const src = code(f);
    if (/\brobots\s*:\s*\{/.test(src) || /\bindex\s*:\s*false\b/.test(src)) {
      problems.push(
        `${rel(f)}: writes a robots metadata literal — import robotsMeta ` +
          `(the app default, which flips at cutover) or privateRobotsMeta ` +
          `(never indexed) from @/lib/site/indexing`,
      );
    }
  }

  /**
   * A `verification:` metadata literal, or a verification token written into
   * the source at all.
   *
   * Same failure mode as the robots literal above, one step worse. A
   * verification token is **per property** — `yuvoy.in`, `app.yuvoy.in` and a
   * preview host each need a different one, and the value changes again at the
   * D-102 cutover — so a literal is wrong on at least one deployment the day
   * it is written, and its wrongness is invisible: the owner presses Verify,
   * is told no, and nothing anywhere explains it.
   *
   * It also must not be `NEXT_PUBLIC_`. That prefix inlines it into the client
   * bundle for no reason, and a `NEXT_PUBLIC_` variable marked Sensitive in
   * Vercel arrives at the build as the literal `[SENSITIVE]` — which this
   * project has already lost three production deploys to.
   */
  for (const f of appFiles) {
    const src = code(f);
    if (/\bverification\s*:\s*\{/.test(src)) {
      problems.push(
        `${rel(f)}: writes a verification metadata literal — import ` +
          `verificationMeta from @/lib/site/verification, which reads the ` +
          `token from the environment and validates it. A token is per ` +
          `property and changes at the domain cutover.`,
      );
    }
    if (/google-site-verification|msvalidate/.test(src)) {
      problems.push(
        `${rel(f)}: names a verification meta tag directly. That belongs in ` +
          `@/lib/site/verification, driven by the environment.`,
      );
    }
  }

  // The whole of src, not app twice: `walk(SRC)` already contains `appFiles`,
  // and concatenating them reported every finding under src/app twice.
  for (const f of walk(SRC).filter((x) => /\.tsx?$/.test(x))) {
    if (/lib[/\\]site[/\\]verification/.test(f)) continue;
    if (/NEXT_PUBLIC_(GOOGLE|BING)_SITE_VERIFICATION/.test(code(f))) {
      problems.push(
        `${rel(f)}: reads a NEXT_PUBLIC_ verification variable. These are ` +
          `server-read metadata, never client values — and a NEXT_PUBLIC_ ` +
          `variable marked Sensitive in Vercel reaches the build as ` +
          `"[SENSITIVE]".`,
      );
    }
  }

  // And the other direction: the disallow list and the noindex pages are one
  // list, so a private route present in only one of them is a route that is
  // private in only one way.
  const indexing = readFileSync(join(SRC, "lib/site/indexing.ts"), "utf8");
  const block = indexing.match(/PRIVATE_ROUTES = \[([^\]]*)\]/);
  const privateRoutes = block
    ? [...block[1].matchAll(/"([^"]+)"/g)].map((m) => m[1])
    : [];
  if (privateRoutes.length === 0) {
    problems.push("lib/site/indexing.ts: PRIVATE_ROUTES could not be read");
  }

  const marked = appFiles.filter((f) => /privateRobotsMeta/.test(code(f)));
  const markedRoutes = marked.map(
    (f) =>
      "/" +
      relative(APP, f)
        .replace(/[/\\]page\.tsx$/, "")
        .replace(/\\/g, "/"),
  );

  for (const r of privateRoutes) {
    if (!markedRoutes.some((m) => coversRoute(r, m))) {
      problems.push(
        `PRIVATE_ROUTES lists "${r}" but no page beneath it sets ` +
          `privateRobotsMeta — robots.txt would block it while the page ` +
          `stays indexable by anything that ignores robots.txt`,
      );
    }
  }

  for (const m of markedRoutes) {
    if (!privateRoutes.some((r) => coversRoute(r, m))) {
      problems.push(
        `${m} sets privateRobotsMeta but is not in PRIVATE_ROUTES — ` +
          `robots.txt will happily hand it to a crawler`,
      );
    }
  }

  // The exemption has to earn itself: a route excused from the noindex half
  // must actually render nothing.
  const nonPageBlock = indexing.match(/NON_PAGE_ROUTES = \[([^\]]*)\]/);
  const nonPageRoutes = nonPageBlock
    ? [...nonPageBlock[1].matchAll(/"([^"]+)"/g)].map((m) => m[1])
    : [];
  for (const r of nonPageRoutes) {
    const prefix = r.replace(/\/$/, "");
    const pages = appFiles.filter(
      (f) =>
        /[/\\]page\.tsx$/.test(f) &&
        ("/" + relative(APP, f).replace(/\\/g, "/")).startsWith(prefix + "/"),
    );
    if (pages.length === 0) {
      problems.push(`NON_PAGE_ROUTES lists "${r}" but no page lives there`);
    }
    for (const f of pages) {
      if (!/\bredirect\(/.test(code(f))) {
        problems.push(
          `${rel(f)}: is excused from privateRobotsMeta by NON_PAGE_ROUTES ` +
            `but does not redirect — it renders a document nothing noindexes`,
        );
      }
    }
  }
}

/* --------------- 11. every indexable route describes itself -------------- */

/**
 * A public page that does not build its metadata through `pageMetadata`.
 *
 * Routes used to set `title` and `description` and inherit the ROOT's Open
 * Graph, so every link shared from a guide, an experience or search previewed
 * as the homepage — right title in the tab, wrong everything in the preview.
 * The page looked correct; the surface people actually see did not, and
 * nothing renders an Open Graph tag where a developer would notice it missing.
 */

{
  const indexingSrc = readFileSync(join(SRC, "lib/site/indexing.ts"), "utf8");
  const excluded = [
    ...indexingSrc.matchAll(/PRIVATE_ROUTES = \[([^\]]*)\]/g),
    ...indexingSrc.matchAll(/NON_PAGE_ROUTES = \[([^\]]*)\]/g),
  ].flatMap((m) => [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]));

  for (const f of walk(APP)) {
    if (!/[/\\]page\.tsx$/.test(f)) continue;
    const route =
      "/" +
      relative(APP, f)
        .replace(/[/\\]page\.tsx$/, "")
        .replace(/\\/g, "/");
    if (excluded.some((r) => coversRoute(r, route))) continue;

    const s = code(f);
    if (!/pageMetadata\(/.test(s)) {
      problems.push(
        `${rel(f)}: public route with no pageMetadata() — it will inherit ` +
          `the root's Open Graph and preview as the homepage. ` +
          `See lib/site/metadata.ts`,
      );
    }
  }
}

/* ------------- 12. environment values are validated, not trusted -------- */

/**
 * A raw `process.env.NEXT_PUBLIC_SITE_URL` read outside its one owner.
 *
 * The first production deploy failed because this value came from a dashboard
 * and the code took it on trust: `new URL(env)` threw at module evaluation and
 * `next build` died collecting page data, with an input Next redacts as
 * `[SENSITIVE]`. The local build had been green throughout — the variable is
 * unset locally, so the fallback literal was what ran.
 *
 * `lib/site/metadata.ts` resolves it once: empty string, missing scheme and
 * outright garbage each get a defined answer. Four files used to read it raw,
 * and three of them would have emitted a broken sitemap rather than failing.
 */

for (const f of files) {
  if (/lib[/\\]site[/\\]metadata\.(ts|test\.ts)$/.test(f)) continue;
  if (/process\.env\.NEXT_PUBLIC_SITE_URL/.test(code(f))) {
    problems.push(
      `${rel(f)}: reads NEXT_PUBLIC_SITE_URL raw — import SITE_URL from ` +
        `@/lib/site/metadata, which validates and normalises it`,
    );
  }
}

/* --------------- 13. every public page is in the inventory --------------- */

/**
 * A public page route that is in neither the indexable inventory nor the
 * private list.
 *
 * The failure this catches is the quiet one: a page that exists, renders
 * perfectly and is in no sitemap. Nothing errors, no test fails, and the page
 * is simply never found. It used to be possible because the sitemap kept its
 * own hand-written array — now it derives from `lib/site/inventory.ts`, and
 * this check is what makes forgetting to add a route there loud.
 */

{
  const inventory = readFileSync(join(SRC, "lib/site/inventory.ts"), "utf8");
  const known = [
    ...inventory.matchAll(/path:\s*"([^"]+)"/g),
    ...inventory.matchAll(/^\s*"(\/[^"]+)",/gm),
  ].map((m) => m[1]);

  const indexingSrc = readFileSync(join(SRC, "lib/site/indexing.ts"), "utf8");
  const excluded = [
    ...indexingSrc.matchAll(/PRIVATE_ROUTES = \[([^\]]*)\]/g),
    ...indexingSrc.matchAll(/NON_PAGE_ROUTES = \[([^\]]*)\]/g),
  ].flatMap((m) => [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]));

  for (const f of walk(APP)) {
    if (!/[/\\]page\.tsx$/.test(f)) continue;
    const route =
      "/" +
      relative(APP, f)
        .replace(/[/\\]page\.tsx$/, "")
        .replace(/^page\.tsx$/, "")
        .replace(/\\/g, "/");

    if (known.includes(route)) continue;
    if (excluded.some((r) => coversRoute(r, route))) continue;

    problems.push(
      `${rel(f)}: route "${route}" is in neither INDEXABLE_FIXED_ROUTES / ` +
        `INDEXABLE_DYNAMIC_ROUTES (lib/site/inventory.ts) nor PRIVATE_ROUTES ` +
        `(lib/site/indexing.ts). A public page in no sitemap renders fine and ` +
        `is found by nobody.`,
    );
  }
}

/* --------------- 14. the availability window is computed once ------------ */

/**
 * Date-range arithmetic outside lib/booking/availability-window.ts.
 *
 * That module exists because these drifted once already, and its own comment
 * records what it cost: the picker asked 14 days and checkout 30, which
 * produced two differently-keyed queries for the same data, so opening
 * checkout refetched instead of reusing what the traveller had just been
 * shown — and the two could disagree about a seat count across one tap.
 *
 * It then drifted again, quietly: checkout went back to inline
 * `setDate(getDate() + 30)` with no reason attached. The 30 turned out to be
 * RIGHT — a `?slot=` URL can name a departure beyond the picker's 14 days —
 * but nothing said so, which is indistinguishable from an accident.
 *
 * So the arithmetic lives in one file and the constants carry their reasons.
 */

for (const f of files) {
  if (/lib[/\\]booking[/\\]availability-window\.ts$/.test(f)) continue;
  if (/\.test\.tsx?$/.test(f)) continue;
  const s = code(f);
  if (/\.setDate\(\s*\w+\.getDate\(\)\s*\+/.test(s)) {
    problems.push(
      `${rel(f)}: builds a date range by hand — use marketDateRange() from ` +
        `@/lib/booking/availability-window, and give the window a named ` +
        `constant if it differs from the picker's`,
    );
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
