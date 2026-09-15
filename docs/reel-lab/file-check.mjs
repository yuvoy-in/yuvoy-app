#!/usr/bin/env node
/*
  Proves the laboratory works the way it is delivered: opened off the
  filesystem, with no server and no network.

  That is not a formality. Three things here can only fail over `file://`, and
  all three would look like a broken design rather than a broken load:

    - the real Fraunces and Satoshi faces, which is why they are copied into
      `assets/` instead of linked across the repository,
    - the mark,
    - Concept 04's canvas read, which is same-origin for a data URI and tainted
      for anything else. `fallbacks: 0` is the assertion that matters.

  It also runs the whole thing under `prefers-reduced-motion: reduce`, where the
  drift standing in for playback must be neutralised by the global rule in
  `tokens.css` and not by any per-concept branch.

      node docs/reel-lab/file-check.mjs
*/
import { createRequire } from "node:module";
/*
  Resolved through a checkout that actually has an install.

  `pnpm` does not hoist, so `playwright` itself is not at the top level of
  `node_modules`; `@playwright/test` is, and it re-exports the browser types.
  A worktree has no `node_modules` at all, so `LAB_RESOLVE_FROM` points this at
  one that does:

      LAB_RESOLVE_FROM=/path/to/a/checkout/package.json node docs/reel-lab/audit.mjs
*/
const require = createRequire(
  process.env.LAB_RESOLVE_FROM
    ? pathToFileURL(process.env.LAB_RESOLVE_FROM).href
    : import.meta.url,
);
function load(...names) {
  for (const name of names) {
    try {
      return require(name);
    } catch (e) {
      if (e.code !== "MODULE_NOT_FOUND") throw e;
    }
  }
  throw new Error(
    `Install Playwright, or point LAB_RESOLVE_FROM at a checkout that has it. Tried: ${names.join(", ")}`,
  );
}
const { webkit } = load("playwright", "@playwright/test");
import { pathToFileURL } from "node:url";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const HERE = dirname(fileURLToPath(import.meta.url));
const LAB = pathToFileURL(resolve(HERE, "index.html")).href;
import { mkdirSync } from "node:fs";
/* Under `test-results/`, which `.gitignore` and `.prettierignore` already cover
   as regenerated tooling output. Override with LAB_SHOTS. */
const SHOTS = process.env.LAB_SHOTS || "./test-results/lab-shots";
mkdirSync(SHOTS, { recursive: true });

for (const reduced of [false, true]) {
  const browser = await webkit.launch();
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    deviceScaleFactor: 2,
    reducedMotion: reduced ? "reduce" : "no-preference",
  });
  const page = await ctx.newPage();
  const errs = [];
  page.on("pageerror", (e) => errs.push("pageerror: " + e.message));
  page.on("console", (m) => {
    if (m.type() === "error") errs.push("console: " + m.text());
  });
  await page.goto(LAB);
  await page.waitForTimeout(1200);

  const state = await page.evaluate(() => {
    const fontOk =
      document.fonts.check('16px "Fraunces Yuvoy"') &&
      document.fonts.check('16px "Satoshi"');
    const mark = document.querySelector(".masthead-mark");
    const poster = document.querySelector(".reel-poster");
    const anim = getComputedStyle(
      document.querySelector(".reel-media.is-running .reel-poster") ||
        document.body,
    ).animationDuration;
    return {
      concepts: document.querySelectorAll(".switch-item").length,
      cards: document.querySelectorAll(".reel-card").length,
      fontOk,
      markLoaded: mark ? mark.naturalWidth > 0 : false,
      posterLoaded: poster ? poster.naturalWidth > 0 : false,
      tokensLoaded: getComputedStyle(document.documentElement)
        .getPropertyValue("--forest")
        .trim(),
      driftDuration: anim,
    };
  });

  // Concept 04 relies on a canvas read of the poster. Over file:// a data URI is
  // still same-origin, so it must NOT fall back.
  await page.click('.switch-item[data-concept="04"]');
  await page.waitForTimeout(900);
  const rf = await page.evaluate(() => {
    const s = Array.from(document.querySelectorAll(".reel-surface"));
    return {
      fallbacks: s.filter((n) => n.classList.contains("rf-fallback")).length,
      zones: [...new Set(s.map((n) => n.getAttribute("data-zone")))],
    };
  });

  console.log(`\n--- reducedMotion=${reduced} over file:// ---`);
  console.log(JSON.stringify({ ...state, ...rf }, null, 1));
  console.log("errors:", errs.length ? errs.join(" | ") : "none");
  if (reduced)
    await page
      .locator(".device")
      .screenshot({ path: `${SHOTS}/reduced-motion.png` });
  await browser.close();
}
