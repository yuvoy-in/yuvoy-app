#!/usr/bin/env node
/**
 * The cutover check: every URL the marketing site publishes must have an
 * answer on the origin the app is about to take.
 *
 * ## Why this exists
 *
 * D-102 puts the app on `yuvoy.in` at launch and retires `yuvoy-web` to
 * redirects. The launch checklist (`docs/SEARCH_INDEXING.md`, yuvoy-app#12)
 * flips the indexing switch, moves `NEXT_PUBLIC_SITE_URL`, re-points the
 * audit and re-submits the sitemap — and every one of those steps is enforced
 * or documented. The step that was not: **what happens to the twelve URLs
 * Google already has for `yuvoy.in`.** On 3 September 2026 all of them except
 * `/` answered 404 on the app, and nothing in any repo would have said so.
 *
 * A 404 on a URL a search engine has indexed is silently wrong, not loudly
 * wrong: the page vanishes from results over weeks, and the first symptom is
 * a traffic graph. This check turns that into a command that fails before
 * the domain moves.
 *
 * ## What it checks
 *
 * The marketing sitemap is read from `--from` (path only — the sitemap is
 * absolute and names whatever host it was built for), plus the legal pages
 * that are deliberately not in it. Each path is then requested on `--to`:
 *
 *   - `200`                       answers. Fine.
 *   - one redirect, then `200`    answers by redirecting. Fine — a redirect
 *                                 to the marketing host, or to the app's own
 *                                 equivalent, is a legitimate answer.
 *   - a redirect to a redirect    a chain. Fails: the checklist says "no
 *                                 sitemap URL 30x-chains", and every hop is a
 *                                 hop a crawler may not take.
 *   - `404`, `5xx`, no response   no answer. Fails.
 *
 * ## When to run it
 *
 *   node scripts/check-cutover.mjs                 # today: yuvoy.in → app.yuvoy.in
 *   node scripts/check-cutover.mjs \
 *     --from https://staging.yuvoy.in \
 *     --to https://yuvoy.in                        # launch day, after the domain moves
 *
 * On launch day `yuvoy.in/sitemap.xml` is the APP's sitemap, so `--from` has
 * to be a host `yuvoy-web` still serves. Staging is one; the project's
 * `*.vercel.app` host is another.
 *
 * Deliberately NOT in `pnpm verify`: it needs the network, it is about two
 * deployments rather than this repository, and it is expected to fail until
 * the decision on yuvoy-app#12 is acted on.
 */

const DEFAULT_FROM = "https://yuvoy.in";
const DEFAULT_TO = "https://app.yuvoy.in";

/**
 * Linked from every marketing footer, kept out of the sitemap on purpose
 * while their copy is placeholder (`noindex`). A crawler may not have them;
 * a person following a footer link does, and a 404 there is a legal page
 * that vanished.
 */
const ALWAYS = ["/privacy", "/terms"];

const TIMEOUT_MS = 15_000;
const UA = "yuvoy-cutover-check (github.com/yuvoy-in/yuvoy-app)";

function arg(name, fallback) {
  const i = process.argv.indexOf(name);
  if (i === -1) return fallback;
  const v = process.argv[i + 1];
  if (!v || v.startsWith("--")) {
    console.error(`\n✗ ${name} needs a value, e.g. ${name} https://yuvoy.in\n`);
    process.exit(2);
  }
  return v;
}

function origin(raw, flag) {
  let u;
  try {
    u = new URL(raw);
  } catch {
    console.error(`\n✗ ${flag} is not a URL: "${raw}"\n`);
    process.exit(2);
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") {
    console.error(`\n✗ ${flag} must be http(s): "${raw}"\n`);
    process.exit(2);
  }
  return u.origin;
}

async function get(url, redirect = "manual") {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, {
      redirect,
      signal: ctrl.signal,
      headers: { "user-agent": UA, accept: "text/html,application/xml" },
    });
  } finally {
    clearTimeout(t);
  }
}

/** Paths from a sitemap, re-based: the sitemap is absolute and may name another host. */
async function marketingPaths(from) {
  const url = `${from}/sitemap.xml`;
  let res;
  try {
    res = await get(url, "follow");
  } catch (err) {
    console.error(`\n✗ could not fetch ${url}: ${err.message}\n`);
    process.exit(2);
  }
  if (res.status !== 200) {
    console.error(
      `\n✗ ${url} answered ${res.status}; nothing to check against.\n`,
    );
    process.exit(2);
  }
  const xml = await res.text();
  const paths = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => {
    try {
      return new URL(m[1].trim()).pathname;
    } catch {
      return m[1].trim();
    }
  });
  if (paths.length === 0) {
    console.error(
      `\n✗ ${url} lists no URLs. A marketing site with an empty sitemap is its own finding.\n`,
    );
    process.exit(2);
  }
  return paths;
}

/**
 * One path, on the new origin. Follows at most ONE redirect by hand so a
 * chain is visible rather than silently walked.
 */
async function probe(to, path) {
  const first = `${to}${path}`;
  let res;
  try {
    res = await get(first);
  } catch (err) {
    return {
      path,
      ok: false,
      note: `no response (${err.name === "AbortError" ? "timed out" : err.message})`,
    };
  }

  if (res.status === 200) return { path, ok: true, note: "200" };

  if (res.status >= 300 && res.status < 400) {
    const location = res.headers.get("location");
    if (!location)
      return { path, ok: false, note: `${res.status} with no Location` };
    const target = new URL(location, first).toString();

    let second;
    try {
      second = await get(target);
    } catch (err) {
      return {
        path,
        ok: false,
        note: `${res.status} → ${target} — no response (${err.message})`,
      };
    }
    if (second.status === 200) {
      return { path, ok: true, note: `${res.status} → ${target}` };
    }
    if (second.status >= 300 && second.status < 400) {
      return {
        path,
        ok: false,
        note: `${res.status} → ${target} → ${second.status} ${second.headers.get("location") ?? ""} — a chain`,
      };
    }
    return {
      path,
      ok: false,
      note: `${res.status} → ${target} → ${second.status}`,
    };
  }

  return { path, ok: false, note: `${res.status} — no answer` };
}

const from = origin(arg("--from", DEFAULT_FROM), "--from");
const to = origin(arg("--to", DEFAULT_TO), "--to");

const sitemap = await marketingPaths(from);
const paths = [...new Set([...sitemap, ...ALWAYS])];

console.log(
  `\ncutover check\n  from  ${from}  (${sitemap.length} sitemap URLs + ${ALWAYS.length} legal pages)\n  to    ${to}\n`,
);

const results = [];
for (const path of paths) results.push(await probe(to, path));

const width = Math.max(...results.map((r) => r.path.length));
for (const r of results) {
  console.log(`  ${r.ok ? "✓" : "✗"} ${r.path.padEnd(width)}  ${r.note}`);
}

const failed = results.filter((r) => !r.ok);
if (failed.length) {
  console.error(
    `\n✗ ${failed.length} of ${results.length} marketing URLs have no answer on ${to}.\n` +
      `  Each one is a page a search engine or a printed card already points at.\n` +
      `  Decide where these live (yuvoy-app#12), then make each answer with a 200 or ONE redirect.\n`,
  );
  process.exit(1);
}

console.log(
  `\n✓ every marketing URL answers on ${to} with at most one redirect\n`,
);
