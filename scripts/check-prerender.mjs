#!/usr/bin/env node
/**
 * What Next actually prerendered, checked against a list we signed off.
 *
 * Static generation is opt-OUT in the App Router: a page with no `dynamic`,
 * no `revalidate` and no server fetch is silently baked at build time. That is
 * usually right and occasionally a bug you cannot see in the source, because
 * nothing in the file says "static" — the absence of something does.
 *
 * It bit `/search`. The screen reads the wall clock during render (the day
 * pills are "today" and the nine days after it, in Asia/Kolkata), so a build
 * shipped on 1 September served HTML that said "Today" over 1 September for
 * as long as that deploy lived, until hydration quietly rewrote it. A green
 * build, a green test suite, and a wrong date on the screen.
 *
 * So the build output is asserted, not the source. Every statically
 * prerendered route is listed below with the reason it is safe to freeze.
 * A route that starts or stops being prerendered fails this check, and the
 * fix is either to opt it out or to add it here with a reason.
 *
 * Runs after `next build`, inside `pnpm verify`.
 */
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const MANIFEST = join(process.cwd(), ".next/prerender-manifest.json");

/**
 * Routes it is correct to bake at build time.
 *
 * The bar for being on this list: the HTML does not depend on when it was
 * generated, and does not depend on data that changes between deploys.
 */
const ALLOWED = {
  "/_global-error": "Static error shell.",
  "/_not-found": "Static 404.",
  "/account": "Settings and consent. All state is client-side and per-device.",
  "/apple-icon.png": "Build asset.",
  "/favicon.ico": "Build asset.",
  "/help":
    "The Help Center. Its answers are a module in the repo, so the HTML " +
    "changes only on deploy. Same class as /guides.",
  "/guides": "Guide registry — MDX in the repo, so it changes only on deploy.",
  "/guides/diving-in-havelock": "MDX in the repo.",
  "/guides/getting-to-the-andamans": "MDX in the repo.",
  "/guides/permits-for-the-andamans": "MDX in the repo.",
  "/guides/when-to-visit-the-andamans": "MDX in the repo.",
  "/guides/which-andaman-island": "MDX in the repo.",
  "/icon.png": "Build asset.",
  "/icon.svg": "Build asset.",
  "/llms.txt": "Derived from the guide registry — deploy-time content.",
  "/manifest.webmanifest": "Static PWA manifest.",
  "/offline": "The service worker's fallback. Must be static by definition.",
  "/opengraph-image": "Build asset.",
  "/robots.txt": "Static, gated on NEXT_PUBLIC_ALLOW_INDEXING at build time.",
  "/saved":
    "The wishlist. Reads IndexedDB in the browser, same as /trips. The shell " +
    "carries no data and no clock.",
  "/sitemap.xml": "revalidate=3600 — ISR, not frozen. lastModified refreshes.",
  "/trips": "Reads IndexedDB in the browser. The shell carries no data.",
  "/trips/recover": "A form. No server data, no clock.",
};

/**
 * Routes that MUST NOT be prerendered, with the reason, so an accidental
 * opt-in is caught as loudly as an accidental opt-out.
 */
const MUST_BE_DYNAMIC = {
  "/": "The feed is the freshest surface in the product.",
  "/search": "Reads the wall clock during render — see the day pills.",
};

/*
  `/saved` is the only entry either list moves, and only one way. The other
  four gated routes (`/`, `/search`, `/search/r/[id]`, `/e/[slug]/book`) are
  already dynamic with the gate off, for reasons of their own.
*/

/**
 * The invite gate (yuvoy-api#195) moves a route between the two lists.
 *
 * With `NEXT_PUBLIC_INVITE_ONLY=true`, a gated route reads the session cookie
 * during render, so Next renders it per request and `/saved` stops being
 * prerendered. That is correct and it is the whole risk the gate carries: the
 * SAME build with the switch off must go back to static, or every traveller
 * pays a server render for a page that holds no server data.
 *
 * So the sign-off is read per build rather than written once. Run this with
 * the same environment as the `next build` it is checking — `pnpm verify`
 * does, and so does Vercel, where both read the project's variables.
 */
const INVITE_ONLY = process.env.NEXT_PUBLIC_INVITE_ONLY === "true";

if (INVITE_ONLY) {
  delete ALLOWED["/saved"];
  MUST_BE_DYNAMIC["/saved"] =
    "Behind the invite gate, which reads the session cookie per request.";
}

if (!existsSync(MANIFEST)) {
  console.error(
    `\n✗ ${MANIFEST} is missing. Run \`pnpm build\` before this check.\n`,
  );
  process.exit(1);
}

const manifest = JSON.parse(readFileSync(MANIFEST, "utf8"));
const prerendered = new Set(Object.keys(manifest.routes ?? {}));

const problems = [];

for (const route of prerendered) {
  if (route in ALLOWED) continue;
  if (route in MUST_BE_DYNAMIC) {
    problems.push(
      `"${route}" was prerendered and must not be — ${MUST_BE_DYNAMIC[route]}\n` +
        `      Add \`export const dynamic = "force-dynamic"\` to its page.`,
    );
    continue;
  }
  problems.push(
    `"${route}" is newly prerendered and nobody signed off on freezing it.\n` +
      `      If its HTML is the same whenever it is built, add it to ALLOWED\n` +
      `      in this file with the reason. If it reads the clock, live data or\n` +
      `      anything per-request, opt it out instead.`,
  );
}

for (const route of Object.keys(ALLOWED)) {
  if (!prerendered.has(route)) {
    problems.push(
      `"${route}" is no longer prerendered. That is a performance regression\n` +
        `      unless it was deliberate — remove it from ALLOWED if it was.`,
    );
  }
}

if (problems.length) {
  console.error(`\n✗ ${problems.length} prerender problem(s)\n`);
  for (const p of problems) console.error(`  ✗ ${p}`);
  console.error("");
  process.exit(1);
}

console.log(
  `\n✓ prerender manifest matches sign-off (${prerendered.size} routes)\n`,
);
