#!/usr/bin/env node
/**
 * The cutover check: every URL the marketing site publishes must have an
 * answer on the origin this app takes.
 *
 * ## Why this exists
 *
 * D-102 puts the app on `yuvoy.in` at launch. The launch checklist
 * (`docs/SEARCH_INDEXING.md`, yuvoy-app#12) flips the indexing switch, moves
 * `NEXT_PUBLIC_SITE_URL`, re-points the audit and re-submits the sitemap — and
 * every one of those steps is enforced or documented. The step that was not:
 * **what happens to the URLs Google already has for `yuvoy.in`.** On
 * 3 September 2026 all of them except `/` answered 404 on the app, and nothing
 * in any repo would have said so.
 *
 * The answer (option A, decided the same day): the marketing site moves to
 * `www.yuvoy.in`, and this app forwards every marketing URL there with one
 * temporary redirect — `src/lib/site/marketing-redirects.ts`. This check is
 * what proves that table against the world, and it deliberately does not
 * import it: a wrong table must not be allowed to agree with itself.
 *
 * ## What it checks
 *
 * The marketing sitemap is read from `--from` (path only — the sitemap is
 * absolute and names whatever host it was built for), plus the paths below
 * that are deliberately not in it. Each path is then requested on `--to`:
 *
 *   - `200`                        answers. Its canonical must be on `--to`.
 *   - `410`                        gone, on purpose — the marketing site
 *                                  retired it, and a crawler should hear so.
 *   - one redirect → `200`/`410`   answers by redirecting. The landing page's
 *                                  canonical must be on the host that served
 *                                  it: a canonical still naming `yuvoy.in`
 *                                  means `NEXT_PUBLIC_SITE_URL` was not moved
 *                                  on the marketing project, and every
 *                                  marketing page is declaring the app's home
 *                                  as its own.
 *   - a redirect to itself         a loop. Fails.
 *   - a redirect to a redirect     a chain. Fails: every hop is a hop a
 *                                  crawler may not take.
 *   - `404`, `5xx`, no response    no answer. Fails.
 *
 * ## Before the domain moves
 *
 * The redirect rules are gated on `Host: yuvoy.in`, so against `app.yuvoy.in`
 * or a preview this check reports 404s — correctly: those hosts do not answer
 * for the root domain, and `www.yuvoy.in` still forwards to `yuvoy.in`, which
 * would make every forward a chain today. Pre-launch verification is a
 * production build and `curl -sI -H "Host: yuvoy.in"`; the steps are in
 * `docs/SEARCH_INDEXING.md`.
 *
 * ## When to run it
 *
 *   node scripts/check-cutover.mjs                       # today: yuvoy.in → app.yuvoy.in (red by design)
 *   node scripts/check-cutover.mjs \
 *     --from https://www.yuvoy.in --to https://yuvoy.in  # launch day, after the domain moves
 *
 * Deliberately NOT in `pnpm verify`: it needs the network, it is about two
 * deployments rather than this repository, and it is red by design until the
 * domain moves.
 */

const DEFAULT_FROM = "https://yuvoy.in";
const DEFAULT_TO = "https://app.yuvoy.in";

/**
 * URLs that exist in the wild but are not in the marketing sitemap — because
 * a redirect or a noindex page in a sitemap is crawl budget spent twice.
 * Kept here, not imported from the app's redirect table: see the header.
 */
const ALWAYS = [
  // Linked from every marketing footer; noindex while their copy is placeholder.
  "/privacy",
  "/terms",
  // Campaign QR landings. Printed on cards, never in a sitemap.
  "/go/ferry",
  "/go/kiosk",
  "/go/hotel",
  "/go/instagram",
  "/go/direct",
  // The marketing site's own redirects after its 2026-08-06 consolidation.
  "/how-it-works",
  "/travellers",
  "/experiences",
  "/destinations",
  "/destinations/neil",
  // Retired, and answered 410 on purpose.
  "/philosophy",
  "/experiences/any-retired-slug",
];

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
 * Whether a served page's canonical names the origin that served it.
 *
 * Returns the problem, or null. Only HTML is inspected; a page with no
 * canonical is not a failure here — the production audit owns that rule.
 */
async function canonicalProblem(res, servedUrl) {
  const type = res.headers.get("content-type") ?? "";
  if (!type.includes("text/html")) return null;
  const html = await res.text();
  const m =
    html.match(/<link[^>]+rel="canonical"[^>]+href="([^"]+)"/i) ??
    html.match(/<link[^>]+href="([^"]+)"[^>]+rel="canonical"/i);
  if (!m) return null;
  let canonical;
  try {
    canonical = new URL(m[1], servedUrl);
  } catch {
    return `canonical is not a URL: "${m[1]}"`;
  }
  const served = new URL(servedUrl);
  if (canonical.origin !== served.origin) {
    return (
      `canonical points at ${canonical.origin} while ${served.origin} served it — ` +
      `NEXT_PUBLIC_SITE_URL on that project was not moved`
    );
  }
  return null;
}

/** A terminal answer: 200 with a truthful canonical, or a deliberate 410. */
async function terminal(res, url, hop) {
  if (res.status === 410)
    return { ok: true, note: `${hop}410 — gone, on purpose` };
  if (res.status !== 200)
    return { ok: false, note: `${hop}${res.status} — no answer` };
  const problem = await canonicalProblem(res, url);
  if (problem) return { ok: false, note: `${hop}200, but ${problem}` };
  return { ok: true, note: `${hop}200` };
}

/**
 * One path, on the new origin. Follows at most ONE redirect by hand so a
 * chain or a loop is visible rather than silently walked.
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

  if (res.status < 300 || res.status >= 400) {
    return { path, ...(await terminal(res, first, "")) };
  }

  const location = res.headers.get("location");
  if (!location) {
    return { path, ok: false, note: `${res.status} with no Location` };
  }
  const target = new URL(location, first).toString();
  const hop = `${res.status} → ${target} → `;

  if (target.split("#")[0] === first) {
    return { path, ok: false, note: `${res.status} → itself — a loop` };
  }

  let second;
  try {
    second = await get(target);
  } catch (err) {
    return { path, ok: false, note: `${hop}no response (${err.message})` };
  }
  if (second.status >= 300 && second.status < 400) {
    return {
      path,
      ok: false,
      note: `${hop}${second.status} ${second.headers.get("location") ?? ""} — a chain`,
    };
  }
  return { path, ...(await terminal(second, target, hop)) };
}

const from = origin(arg("--from", DEFAULT_FROM), "--from");
const to = origin(arg("--to", DEFAULT_TO), "--to");

const sitemap = await marketingPaths(from);
const paths = [...new Set([...sitemap, ...ALWAYS])];

console.log(
  `\ncutover check\n  from  ${from}  (${sitemap.length} sitemap URLs + ${ALWAYS.length} that are never in a sitemap)\n  to    ${to}\n`,
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
      `  If ${to} is not yet the root domain, this is expected: the rules are gated on Host: yuvoy.in.\n` +
      `  Otherwise: docs/SEARCH_INDEXING.md, "The cutover checklist".\n`,
  );
  process.exit(1);
}

console.log(
  `\n✓ every marketing URL answers on ${to} with at most one redirect, and every landing page's canonical is its own\n`,
);
