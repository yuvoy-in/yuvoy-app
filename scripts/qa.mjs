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

/* --------- 7b. a server file may import a client COMPONENT, not a value -- */

/**
 * A Server Component importing a plain value out of a `"use client"` module.
 *
 * This shipped, and it is the quietest failure this repo has had.
 *
 * A `"use client"` boundary turns every export of that module into a client
 * REFERENCE — including a constant. `page.tsx` imported `REELS_LIMIT` from
 * `use-reels.ts` and did not get `60`; it got a stub that throws "Attempted to
 * call REELS_LIMIT() from the server". Interpolated into a query string, the
 * stub stringified to its own error text, so the homepage asked the API for
 * `?limit=function(){throw Error(…)}`, took a `400`, swallowed it by design,
 * and served a loading skeleton to every traveller while the browser refetched.
 *
 * It typechecked. It built. All 265 unit tests passed. The production audit
 * passed. The only symptom was LCP — the exact number the server-side prefetch
 * exists to protect.
 *
 * Importing a client COMPONENT is normal and necessary, which is what makes
 * this hard to see: `import { Feed } from "…/feed"` is correct, and
 * `import { REELS_LIMIT } from "…/use-reels"` is not, and they look identical.
 * PascalCase is the line — the same convention React itself uses to tell an
 * element from a call.
 *
 * Type-only imports are erased before any of this matters and are allowed.
 */

const declaresUseClient = (f) =>
  /^\s*["']use client["']/m.test(readFileSync(f, "utf8"));

/** `import { a, type B, C }` → the bindings that survive to runtime. */
function valueImportsFrom(source, spec) {
  const named = [
    ...source.matchAll(
      new RegExp(
        `import\\s+([^;]*?)\\s+from\\s+["']${spec.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["']`,
        "g",
      ),
    ),
  ];
  const bindings = [];
  for (const [, clause] of named) {
    // `import type { … }` is erased wholesale.
    if (/^\s*type\s/.test(clause)) continue;
    const braces = clause.match(/\{([^}]*)\}/)?.[1] ?? "";
    for (const part of braces.split(",")) {
      const name = part
        .trim()
        .split(/\s+as\s+/)[0]
        .trim();
      if (!name || /^type\s/.test(name)) continue;
      bindings.push(name.replace(/^type\s+/, ""));
    }
    // A default or namespace import outside the braces.
    const outside = clause
      .replace(/\{[^}]*\}/, "")
      .replace(/,/g, "")
      .trim();
    if (outside && !/^\*\s+as/.test(outside)) bindings.push(outside);
  }
  return bindings;
}

for (const file of files) {
  if (/\.test\.tsx?$/.test(file)) continue;
  if (declaresUseClient(file)) continue;
  // Server Components live under src/app. A shared lib with no directive is
  // not necessarily server-executed, so it is not the subject here.
  if (!rel(file).startsWith(join("src", "app"))) continue;

  const source = code(file);
  for (const spec of importsOf(file)) {
    const target = resolveImport(file, spec);
    if (!target || !declaresUseClient(target)) continue;

    for (const binding of valueImportsFrom(source, spec)) {
      // PascalCase is a component, which a Server Component may render.
      if (/^[A-Z][A-Za-z0-9]*$/.test(binding)) continue;
      problems.push(
        `${rel(file)}: imports the value \`${binding}\` from "${spec}", which ` +
          `is a "use client" module. A client boundary turns every export into ` +
          `a client reference, so the server gets a stub that throws rather ` +
          `than the value — silently, at runtime. Move \`${binding}\` into a ` +
          `module with no "use client", or import it as a type.`,
      );
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
 * the root layout hardcoded `index: false`. Flipping the flag at launch
 * would have opened crawling on a site whose every page still said
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
          `(the app default, which flips at launch) or privateRobotsMeta ` +
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
   * preview host each need a different one, and it would change again if the
   * app ever took the root domain — so a literal is wrong on at least one deployment the day
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
          `property and would change with the host.`,
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

/* ------------- 15. a mutation's outcome is rendered or handled ----------- */

/**
 * A `useMutation` whose success nobody reads.
 *
 * The Pay button shipped like this: `order.error` was rendered and
 * `order.data` was never touched, so the contract's `200 coming_soon` — the
 * answer production gives today, carrying a message the screen is told to
 * render — produced nothing at all. The button returned to "Pay" with the
 * hold clock running, and every test was green because the mock answered
 * the one shape that WAS rendered.
 *
 * For each `const NAME = useMutation(...)`, the module must read `NAME.data`
 * or `NAME.isSuccess`, drive the flow through `NAME.mutateAsync` (the caller
 * then owns the result), or handle `onSuccess` / `onSettled` inside the call.
 * Per mutation, not per file.
 */
for (const f of files) {
  if (/\.test\.tsx?$/.test(f)) continue;
  const s = code(f);
  for (const m of s.matchAll(/const\s+(\w+)\s*=\s*useMutation\(/g)) {
    const name = m[1];
    const close = s.indexOf("\n  });", m.index);
    const call = s.slice(m.index, close === -1 ? undefined : close + 6);
    const handled = /\bon(Success|Settled)\s*:/.test(call);
    const read = new RegExp(
      `\\b${name}\\.(data|isSuccess|mutateAsync)\\b`,
    ).test(s);
    if (!handled && !read) {
      problems.push(
        `${rel(f)}: \`${name}\` is a useMutation whose success is never ` +
          `rendered or handled. Read \`${name}.data\` / \`${name}.isSuccess\`, ` +
          `use \`${name}.mutateAsync\`, or add onSuccess — a response the ` +
          `screen discards is a tap that does nothing.`,
      );
    }
  }
}

/**
 * A WIRE ENUM MUST NOT BE RENDERED AT A TRAVELLER.
 *
 * Account shipped `<Chip size="sm">{b.state}</Chip>`, so somebody waiting on
 * an operator read `awaiting_operator` and somebody who missed the boat read
 * `no_show` (yuvoy-app#26). Trips had the full label map two directories away
 * and this screen bypassed it. The same class of defect appeared again on the
 * cancellation reason, where `CREDENTIAL_LAPSE` would have been shouted in
 * capitals at a customer (yuvoy-app#22 §2).
 *
 * These fields are OUR tokens: closed sets in our own tables, in
 * SCREAMING_SNAKE or lower_snake, that grow by INSERT without a deploy here.
 * There is no phrasing of them that is English.
 *
 * The rule is narrow on purpose — it fires only on a whole JSX CHILD that is
 * exactly one of these property reads. Passing one to a component that maps
 * it (`<StateChip state={b.state} />`) is the fix, not the defect, and sits
 * in prop position, so it is not matched.
 */
const RAW_ENUM_FIELDS = ["state", "reasonCode", "bookingMode"];
const RAW_ENUM_ALLOWED = new Set(["src/components/booking/state-chip.tsx"]);
for (const f of files) {
  if (/\.test\.tsx?$/.test(f)) continue;
  if (RAW_ENUM_ALLOWED.has(rel(f))) continue;
  const s = code(f);
  const pattern = new RegExp(
    // Not preceded by `=`, so `state={b.state}` (prop position) is exempt,
    // nor by `$`, so `${response.status}` in a template literal is not JSX.
    String.raw`(^|[^=$])\{\s*([A-Za-z_$][\w$]*(?:\??\.[\w$]+)*\??\.(?:` +
      RAW_ENUM_FIELDS.join("|") +
      String.raw`))\s*\}`,
    "gm",
  );
  for (const m of s.matchAll(pattern)) {
    problems.push(
      `${rel(f)}: renders \`${m[2]}\` straight into the page. That is a wire ` +
        `enum — a token from one of our own tables — and it reaches a reader ` +
        `as \`awaiting_operator\` or \`CREDENTIAL_LAPSE\`. Map it to a ` +
        `sentence, with a fallback for a value that has not been seen before.`,
    );
  }
}

/**
 * A REQUIRED CONDITION WHOSE CONTROL IS CONDITIONAL — yuvoy-app#28.
 *
 * Checkout required acceptance of the cancellation policy unconditionally,
 * and rendered the checkbox that accepts it only inside
 * `{experience.cancellationPolicy ? … : null}`. The field is `omitempty` and
 * was populated by nothing, so it was absent from every response — and every
 * listing on `app.yuvoy.in` got a permanently dead submit button asking for a
 * control that was not on the page. Nothing could be booked, by anybody, from
 * launch until 9 Sep 2026.
 *
 * Neither half looks wrong alone. The blocker is a correct requirement, and
 * refusing to display terms we did not send is a correct refusal. Only the
 * PAIR is the defect — which is why no test, no type and no response-shape
 * validation caught it, and why the check has to be about the pair.
 *
 * The rule: **if a requirement is unconditional, the control that clears it
 * must be unconditional too.** A requirement gated on the same response field
 * as its control is fine, and is how the screening fields already work.
 * Wanting the control absent is fine too — refuse the whole screen with a
 * reason (`checkoutRefusal`), never leave a dead button.
 */
const REQUIREMENT_DATA_ROOTS = ["experience", "safety", "slot"];
const DATA_ROOT_RE = new RegExp(
  String.raw`\b(?:${REQUIREMENT_DATA_ROOTS.join("|")})\b`,
);

/** The balanced `{…}` or `(…)` run starting at `open`. */
function balanced(s, open, [lhs, rhs]) {
  let depth = 0;
  for (let i = open; i < s.length; i++) {
    if (s[i] === lhs) depth++;
    else if (s[i] === rhs && --depth === 0) return s.slice(open, i + 1);
  }
  return s.slice(open);
}

/** Conditions of every `if (…) {` block still open at each index of `body`. */
function enclosingConditions(body, at) {
  const open = [];
  let depth = 0;
  for (let i = 0; i < at; i++) {
    if (body[i] === "{") depth++;
    else if (body[i] === "}") {
      depth--;
      while (open.length && open[open.length - 1].depth > depth) open.pop();
    } else if (body.startsWith("if", i) && /[^\w$]/.test(body[i - 1] ?? " ")) {
      const paren = body.indexOf("(", i);
      if (paren === -1) continue;
      const cond = balanced(body, paren, ["(", ")"]);
      const rest = body.slice(paren + cond.length);
      // Only a braced `if` encloses anything; `if (x) out.push(…)` does not.
      if (/^\s*\{/.test(rest)) open.push({ depth: depth + 1, cond });
      i = paren + cond.length - 1;
    }
  }
  return open.map((o) => o.cond);
}

for (const f of files) {
  if (/\.test\.tsx?$/.test(f)) continue;
  const s = code(f);
  const memo = /const\s+blockers\s*=\s*useMemo\s*\(/.exec(s);
  if (!memo) continue;

  const bodyStart = memo.index + memo[0].length - 1;
  const body = balanced(s, bodyStart, ["(", ")"]);
  const markupFrom = bodyStart + body.length;

  /*
    Every JSX region gated on a field of the response. A control reachable
    ONLY from inside one of these is a control that can fail to render.
  */
  const gated = [];
  for (const g of s.matchAll(
    new RegExp(
      String.raw`\{\s*(?:${REQUIREMENT_DATA_ROOTS.join("|")})\??\.[\w$?.]+\s*\?`,
      "g",
    ),
  )) {
    gated.push([g.index, g.index + balanced(s, g.index, ["{", "}"]).length]);
  }
  const isGated = (i) => gated.some(([a, b]) => i >= a && i < b);

  for (const push of body.matchAll(/out\.push\s*\(/g)) {
    const guards = enclosingConditions(body, push.index);
    // The `if (…) out.push(…)` on the same statement, if it is one.
    const line = body.slice(body.lastIndexOf("\n", push.index) + 1, push.index);
    const inline = /if\s*\(([\s\S]*)\)\s*$/.exec(line);
    if (inline) guards.push(inline[1]);

    // A requirement gated on the response is ALLOWED a gated control: the
    // two conditions agree, which is exactly what the fix asks for.
    if (guards.some((c) => DATA_ROOT_RE.test(c))) continue;

    for (const id of new Set(
      guards.join(" ").match(/[A-Za-z_$][\w$]*/g) ?? [],
    )) {
      const setter = `set${id[0].toUpperCase()}${id.slice(1)}`;
      const declared = new RegExp(
        String.raw`const\s*\[\s*${id}\s*,\s*${setter}\s*\]`,
      ).test(s);
      if (!declared) continue;

      /*
        Two spellings of "a control on the page can set this".

        `setName(` is the setter called inline, in an `onChange`. `={setName}`
        is the setter HANDED to a component that owns the input, which is what
        `<ContactFields onNameChange={setName} />` does since yuvoy-app#32
        pulled the shared who-is-booking block out of both forms.

        The second spelling is deliberately narrow. Matching a bare `setName`
        anywhere would count a mention in a comment, a dependency array or a
        `useCallback` body, and the whole value of this check is that it fails
        when nothing can actually set the field.
      */
      const spellings = [`${setter}(`, `={${setter}}`];
      let found = false;
      let unconditional = false;
      for (const call of spellings) {
        for (
          let i = s.indexOf(call, markupFrom);
          i !== -1;
          i = s.indexOf(call, i + 1)
        ) {
          found = true;
          if (!isGated(i)) unconditional = true;
        }
      }

      if (!found) {
        problems.push(
          `${rel(f)}: \`${id}\` is required unconditionally in \`blockers\`, ` +
            `and \`${setter}\` is never called in the markup — the traveller ` +
            `is asked for something no control on the page can give.`,
        );
      } else if (!unconditional) {
        problems.push(
          `${rel(f)}: \`${id}\` is required unconditionally in \`blockers\`, ` +
            `but \`${setter}\` is only reachable inside a region gated on the ` +
            `response. When that field is absent the traveller is asked to ` +
            `clear a blocker whose control never renders, and the submit ` +
            `button can never enable. Render the control unconditionally and ` +
            `refuse the screen with a reason when the data is missing — see ` +
            `\`checkoutRefusal\` in src/lib/booking/checkout-readiness.ts.`,
        );
      }
    }
  }
}

/**
 * A LOOKUP KEYED BY A WIRE STATE MUST HAVE A FALLBACK — yuvoy-app#29.
 *
 * `STATE_COPY[status.state]` was dereferenced three lines into the booking
 * screen's render. `paid_pending_ops` — the state a cash booking sits in until
 * the operator records the money — is not in `BookingStatus.state`'s enum: the
 * contract declares it only on `CashBooking`, and the API returns it anyway.
 * So the map returned `undefined`, `copy.eyebrow` threw, and the whole booking
 * screen went to the error boundary **for somebody who had just committed to
 * paying at a jetty**. There is no worse place in this product to crash.
 *
 * The type system cannot help here and never could: these enums grow by INSERT
 * on the server, a pinned contract states what an API WILL send rather than
 * what it does, and `Record<Enum, T>` indexes as `T` while the value at runtime
 * is `T | undefined`.
 *
 * So every lookup keyed by a state needs a fallback in the same breath —
 * `MAP[state] ?? something`, or an assignment followed by a null check. This
 * is the same lesson as the wire-enum check below it, one layer up: that one
 * stops a raw token reaching a reader, this one stops an unknown token taking
 * the screen down.
 */
for (const f of files) {
  if (/\.test\.tsx?$/.test(f)) continue;
  const s = code(f);
  /*
    `NAME[...state]` — a bracket index whose key is a state. Deliberately not
    every bracket index: an array index or a lookup by id is a different thing
    with a different failure, and a check that fired on all of them would be
    turned off.
  */
  for (const m of s.matchAll(
    /\b([A-Z_][A-Z0-9_]*|[a-z][\w$]*)\[\s*([\w$.?]*\bstate)\s*(?:as[^\]]*)?\]/g,
  )) {
    const [whole, map, key] = m;
    const after = s.slice(m.index + whole.length, m.index + whole.length + 240);

    // `MAP[state] ?? fallback`, on the spot.
    if (/^\s*\?\?/.test(after)) continue;

    /*
      Or assigned and then checked: `const label = MAP[state];` followed by
      `if (!label)`. The booking screen had neither, which is what made it a
      crash rather than a blank.
    */
    const before = s.slice(Math.max(0, m.index - 80), m.index);
    const assigned = /(?:const|let)\s+([\w$]+)\s*(?::[^=]+)?=\s*$/.exec(before);
    if (
      assigned &&
      new RegExp(String.raw`if\s*\(\s*!\s*${assigned[1]}\b`).test(after)
    )
      continue;

    problems.push(
      `${rel(f)}: \`${map}[${key}]\` is a lookup keyed by a wire state with ` +
        `no fallback. These enums grow by INSERT on the server and a pinned ` +
        `contract says what the API WILL send, not what it does — ` +
        `\`paid_pending_ops\` reached the booking screen before it was ever ` +
        `in \`BookingStatus.state\`, and the unguarded read took the page ` +
        `down for somebody who had just committed money. Add \`?? fallback\`, ` +
        `or assign it and handle the missing case.`,
    );
  }
}

/* --------- 16. a form control may not be typeset under 16px -------------- */

/**
 * `text-xs`, `text-sm` or an explicit sub-16px size on an `input`, `select`
 * or `textarea`.
 *
 * iOS Safari zooms the entire page in when a focused form control computes
 * below 16px, and does not zoom back out. It shipped as `text-sm` on the
 * safety screener's age select — 14px, in checkout — and reached the owner on
 * their own phone (yuvoy-app#35).
 *
 * There are three guards and each catches what the others cannot. The base
 * layer in `globals.css` sets an absolute floor for a control that states no
 * size of its own. `e2e/ios-input-zoom.spec.ts` measures what WebKit actually
 * computed, on a real WebKit iPhone, which is the only thing that can catch a
 * size arriving by inheritance. This one catches the mistake at the moment
 * somebody writes it, in the diff, by name — a Tailwind type utility sits in a
 * later cascade layer than the base floor and beats it, so writing the class
 * really does undo the fix.
 *
 * Checkboxes and radios are exempt: they render no text and WebKit does not
 * zoom for them.
 */

{
  const TOO_SMALL = /^text-(xs|sm)$/;
  /** `text-[13px]`, `text-[0.8rem]` — anything arbitrary and under 16px. */
  const arbitraryUnder16 = (cls) => {
    const m = /^text-\[(\d*\.?\d+)(px|rem|em)\]$/.exec(cls);
    if (!m) return false;
    const n = Number(m[1]);
    return m[2] === "px" ? n < 16 : n < 1;
  };

  /**
   * The open tag starting at `<`, as source text.
   *
   * Not `/<select[^>]*>/`. A JSX prop routinely contains a bare `>`: every
   * arrow function does (`onChange={(e) => …}`), and so does any comparison
   * inside a brace. That regex stops at the first one, hands back a fragment
   * with no `className` in it, and the check silently passes on exactly the
   * elements most likely to be wrong. It did, on the first draft of this
   * check, against the very select that prompted it.
   *
   * So: walk forward, count `{}` depth, skip over quoted strings and template
   * literals, and take the first `>` at depth zero.
   */
  const openTag = (src, from) => {
    let depth = 0;
    for (let i = from; i < src.length; i++) {
      const c = src[i];
      if (c === "{") depth++;
      else if (c === "}") depth--;
      else if (c === '"' || c === "'" || c === "`") {
        const quote = c;
        i++;
        while (i < src.length && src[i] !== quote) {
          if (src[i] === "\\") i++;
          i++;
        }
      } else if (c === ">" && depth === 0) {
        return src.slice(from, i + 1);
      }
    }
    return src.slice(from);
  };

  /** The class strings inside a tag's own `className` value, and no other. */
  const classTokens = (attrs) => {
    const at = attrs.indexOf("className=");
    if (at === -1) return [];
    let v = attrs.slice(at + "className=".length);

    if (v[0] === '"' || v[0] === "'") {
      const end = v.indexOf(v[0], 1);
      v = end === -1 ? v.slice(1) : v.slice(1, end);
    } else if (v[0] === "{") {
      // The balanced brace run, so the value stops where the prop stops.
      let depth = 0;
      let end = v.length;
      for (let i = 0; i < v.length; i++) {
        const c = v[i];
        if (c === "{") depth++;
        else if (c === "}" && --depth === 0) {
          end = i;
          break;
        } else if (c === '"' || c === "'" || c === "`") {
          const quote = c;
          i++;
          while (i < v.length && v[i] !== quote) {
            if (v[i] === "\\") i++;
            i++;
          }
        }
      }
      v = v.slice(1, end);
    } else {
      return [];
    }

    return [
      ...new Set(
        [...v.matchAll(/"([^"]*)"|'([^']*)'|`([^`$]*)`/g)]
          .flatMap((c) => (c[1] ?? c[2] ?? c[3] ?? "").split(/\s+/))
          .concat(v.split(/\s+/)) // the bare `className="a b"` form
          .filter(Boolean),
      ),
    ];
  };

  for (const f of files) {
    const src = code(f);
    for (const m of src.matchAll(/<(input|select|textarea)[\s/>]/g)) {
      const tag = m[1];
      const attrs = openTag(src, m.index);
      if (tag === "input" && /type=["'](checkbox|radio|hidden)["']/.test(attrs))
        continue;

      /*
        Every class token the tag could ever apply.

        `className` is rarely a bare string here. The shared `Field` writes
        `className={cn("…", cond && "…", shape === "pill" ? "…" : "…")}`, and
        that is the input almost every text field in the app is made of — so a
        matcher that only understood `className="…"` would pass the single most
        important file in this check. It did, on the second draft.

        So: take the whole `className=` value, however it is written, and pull
        every string and template literal out of it. A conditional branch
        counts, because it can apply. A string that is not a class at all —
        the `"pill"` in a comparison — tokenises to something no rule matches,
        so it costs nothing.
      */
      /*
        Every class token the tag could ever apply.

        `className` is rarely a bare string here. The shared `Field` writes
        `className={cn("…", cond && "…", shape === "pill" ? "…" : "…")}`, and
        that is the input almost every text field in the app is made of — so a
        matcher that only understood `className="…"` would pass the single most
        important file in this check. It did, on the second draft.

        So: take the `className` value alone, however it is written, and pull
        every string and template literal out of it. A conditional branch
        counts, because it can apply. A string that is not a class at all — the
        `"pill"` in a comparison — tokenises to something no rule matches, so
        it costs nothing. The value is delimited exactly rather than read to
        the end of the tag, or a `placeholder="…"` after it would be scanned
        as if it were classes.
      */
      const classes = classTokens(attrs);
      const bad = classes.filter(
        (c) => TOO_SMALL.test(c) || arbitraryUnder16(c),
      );
      if (bad.length) {
        problems.push(
          `${rel(f)}: <${tag}> is typeset ${bad.join(" ")} — iOS Safari zooms ` +
            `the whole page in when a focused control computes under 16px, and ` +
            `never zooms back out. Use text-base or larger. This shipped once ` +
            `as text-sm on the screener's age select, in checkout ` +
            `(yuvoy-app#35).`,
        );
      }
    }
  }
}

/* --------- 17. every contract error code is one the client recognises ---- */

/**
 * A code in the contract's `ErrorCode` enum that is missing from
 * `ERROR_CODES` in `src/lib/api/errors.ts`.
 *
 * This is the one drift the typechecker structurally cannot see. `ERROR_CODES`
 * is a hand-written mirror of the enum, and `YuvoyError` narrows anything it
 * does not recognise to `unknown_error`. So a code the API really returns and
 * the client has never heard of does not fail to compile, does not fail a
 * test, and does not throw. It renders "Something went wrong. It is us, not
 * you, and trying again often fixes it." with a retry button, over a refusal
 * that is frequently not an error at all and that retrying cannot change.
 *
 * It shipped exactly that way: `POST /bookings/review` split `conflict` into
 * `not_reviewable_yet`, `already_reviewed` and `review_window_closed` on
 * 2026-09-13. All three were in the contract on the ref this app was pinned
 * to. None was in `ERROR_CODES`. A traveller who had already reviewed their
 * trip read a crash message and was invited to retry forever
 * (yuvoy-app#53).
 *
 * The check runs one way on purpose. A code in `ERROR_CODES` that is NOT in
 * the contract is fine and is sometimes required: the API may stop RETURNING
 * a code long before the enum drops it, and a deployment behind the current
 * document still answers the old one. `conflict` is live proof of both halves.
 */

{
  const contract = readFileSync(join(ROOT, "contracts/openapi.yaml"), "utf8");

  /*
    The enum entries under `ErrorCode:`, stopping at the next schema. Read off
    the text rather than a YAML parser, which this repo does not depend on,
    and anchored on the two-space schema indent the document uses throughout.
  */
  const block = /^ {4}ErrorCode:\n([\s\S]*?)(?=^ {4}\w+:\n)/m.exec(contract);
  if (!block) {
    problems.push(
      `contracts/openapi.yaml: no ErrorCode schema found. The error-code ` +
        `drift check cannot run, which means it is silently passing.`,
    );
  } else {
    const declared = [...block[1].matchAll(/^ {8}- ([a-z_]+)$/gm)].map(
      (m) => m[1],
    );
    if (declared.length < 20) {
      problems.push(
        `scripts/qa.mjs: only ${declared.length} ErrorCode entries parsed out ` +
          `of the contract. The enum has dozens, so the parse is broken and ` +
          `the drift check is passing over almost nothing.`,
      );
    }

    const errorsTs = readFileSync(join(SRC, "lib/api/errors.ts"), "utf8");
    const arr = /export const ERROR_CODES = \[([\s\S]*?)\n\] as const;/.exec(
      errorsTs,
    );
    if (!arr) {
      problems.push(
        `src/lib/api/errors.ts: ERROR_CODES array not found. The error-code ` +
          `drift check cannot run, which means it is silently passing.`,
      );
    } else {
      // String literals only, so a code named inside a comment does not count.
      const known = new Set(
        [...arr[1].matchAll(/^ *"([a-z_]+)",$/gm)].map((m) => m[1]),
      );
      const missing = declared.filter((c) => !known.has(c));
      if (missing.length) {
        problems.push(
          `src/lib/api/errors.ts: ERROR_CODES is missing ${missing.join(", ")}` +
            `, which the pinned contract declares. YuvoyError narrows an ` +
            `unrecognised code to unknown_error, so describeError says ` +
            `"Something went wrong" and offers a retry over a refusal that ` +
            `retrying cannot fix. Add each one and give it a sentence ` +
            `(yuvoy-app#53).`,
        );
      }
    }
  }
}

/* ------- 18. the session token must never come back to the browser ------- */

/**
 * Two ways the HttpOnly session could leak into script, and both are silent.
 *
 * yuvoy-app#57 moved the traveller's session into a cookie the browser cannot
 * read, so that an injected script cannot lift it. That property is not one
 * the typechecker can hold: it is a statement about what a route WRITES and
 * about which upstream answers a credentialed proxy is willing to forward.
 *
 * ## 18a. The proxy must not forward a response that contains a credential
 *
 * `/api/v1/[...path]` attaches the cookie and hands the API's answer back
 * verbatim. Add `POST /me/sign-in/verify` to the allowlist and the proxy
 * cheerfully returns `{ sessionToken: "..." }` to the page, undoing the whole
 * change in one line that reviews as "allow one more endpoint".
 *
 * So the allowlist is checked against the CONTRACT, not against a memory of
 * which endpoints are sensitive: any path whose own block mentions
 * `sessionToken` is refused, `$ref`s resolved one level.
 *
 * `statusToken` is deliberately NOT in that test, and the first draft of this
 * check got it wrong: it flagged `/me` and `/me/bookings`, both correctly
 * allowlisted. A status token is a per-booking credential the app is SUPPOSED
 * to receive and keep, which is how a trip booked on another phone opens on
 * this one, and #57 says in as many words that per-booking tokens are out of
 * scope. Only the session token has to stay server-side.
 *
 * The `security:` block is stripped before the scan for the same reason the
 * first draft failed: it names the auth SCHEMES a path accepts, one of which
 * is literally `statusToken`, and a scheme name is not a response field.
 *
 * ## 18b. A session route must not put the token in its own answer
 *
 * `/api/session` and `/api/session/adopt` hold the token in a local and must
 * hand back a boolean. Every argument to `NextResponse.json(...)` under
 * `src/app/api/` is extracted with a brace-aware scan and refused if it names
 * the token. `answer.body` is allowed only where it cannot carry one, which
 * 18a is what establishes.
 */

{
  const contract = readFileSync(join(ROOT, "contracts/openapi.yaml"), "utf8");
  const allowlistSrc = readFileSync(
    join(SRC, "lib/auth/proxied-paths.ts"),
    "utf8",
  );

  /* -- 18a -- */

  const listed = [
    ...allowlistSrc.matchAll(
      /\{\s*method:\s*"([A-Z]+)",\s*pattern:\s*"([^"]+)"\s*\}/g,
    ),
  ].map((m) => ({ method: m[1], pattern: m[2] }));

  if (listed.length === 0) {
    problems.push(
      `src/lib/auth/proxied-paths.ts: no proxied paths parsed. The proxy ` +
        `credential check cannot run, which means it is silently passing.`,
    );
  }

  /** A path's own YAML block, `  /x:` up to the next top-level path. */
  const blockFor = (p) => {
    const start = contract.indexOf(`\n  ${p}:\n`);
    if (start < 0) return null;
    const rest = contract.slice(start + 1);
    const next = rest.slice(1).search(/\n {2}\/[a-z]/i);
    return next < 0 ? rest : rest.slice(0, next + 1);
  };

  /** A component schema's own block, for one level of `$ref` resolution. */
  const schemaFor = (name) => {
    const start = contract.indexOf(`\n    ${name}:\n`);
    if (start < 0) return "";
    const rest = contract.slice(start + 1);
    const next = rest.slice(1).search(/\n {4}\w+:/);
    return next < 0 ? rest : rest.slice(0, next + 1);
  };

  const CREDENTIALS = /sessionToken/;

  for (const { method, pattern } of listed) {
    const block = blockFor(pattern);
    if (!block) {
      problems.push(
        `src/lib/auth/proxied-paths.ts: proxies ${method} ${pattern}, which ` +
          `the pinned contract does not have. A proxied path the API lacks is ` +
          `a 404 nobody can act on.`,
      );
      continue;
    }

    /*
      Strip `security:` first. It lists the auth schemes a path accepts, and
      one of them is spelled `statusToken`, so scanning it would flag every
      authenticated path as leaking a credential.
    */
    let text = block.replace(/\n {4}security:[\s\S]*?(?=\n {4}\w)/g, "\n");
    for (const ref of block.matchAll(/#\/components\/schemas\/(\w+)/g)) {
      text += schemaFor(ref[1]);
    }

    if (CREDENTIALS.test(text)) {
      problems.push(
        `src/lib/auth/proxied-paths.ts: proxies ${method} ${pattern}, whose ` +
          `contract response carries a credential. The proxy hands the API's ` +
          `answer to the browser verbatim, so this would put the session ` +
          `token back in reach of script and undo yuvoy-app#57. Give it its ` +
          `own route that keeps the token server-side.`,
      );
    }
  }

  /* -- 18b -- */

  const apiRoutes = walk(join(APP, "api")).filter((f) =>
    /route\.tsx?$/.test(f),
  );
  if (apiRoutes.length === 0) {
    problems.push(
      `src/app/api: no route handlers found. The session-leak check cannot ` +
        `run, which means it is silently passing.`,
    );
  }

  for (const f of apiRoutes) {
    const s = code(f);
    for (const m of s.matchAll(/NextResponse\.json\(/g)) {
      const open = m.index + m[0].length - 1;
      let depth = 0;
      let end = open;
      let quote = null;
      for (let i = open; i < s.length; i += 1) {
        const c = s[i];
        if (quote) {
          if (c === "\\") i += 1;
          else if (c === quote) quote = null;
          continue;
        }
        if (c === '"' || c === "'" || c === "`") quote = c;
        else if (c === "(") depth += 1;
        else if (c === ")") {
          depth -= 1;
          if (depth === 0) {
            end = i;
            break;
          }
        }
      }
      const args = s.slice(open + 1, end);
      if (/sessionToken/.test(args)) {
        problems.push(
          `${rel(f)}: hands \`sessionToken\` to NextResponse.json. The whole ` +
            `point of yuvoy-app#57 is that no browser code can reach the ` +
            `session. Answer a boolean and keep the token in the cookie.`,
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
