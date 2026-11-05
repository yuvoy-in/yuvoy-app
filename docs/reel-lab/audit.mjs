#!/usr/bin/env node
/*
  The laboratory's own audit.

  It is in the repository rather than in a scratch directory for the reason this
  project applies to every fix: the check that would have caught a defect ships
  beside the fix, or the next version of the defect goes unnoticed. Four real
  problems came out of this file rather than out of looking at the screen, and
  every one of them was invisible in a screenshot:

    1. A centred play control ate the second tap of Concept 05's double tap.
    2. `display: block` on a concept title overrode `-webkit-box` and silently
       unclamped every long title.
    3. Concept 03's sheet clipped its own call to action under the bar on an
       iPhone SE.
    4. The sound control sat inside an `aria-hidden` masthead, which is a
       serious violation and one a screen cannot show you.

  ## Running it

      npx playwright install webkit          # once per machine
      python3 -m http.server 8777            # from the repository root
      node docs/reel-lab/audit.mjs

  WebKit on purpose: it is the Safari engine, which is most of this product's
  traffic, and it is the browser the standing rule for this workspace names.

  ## Why it is served rather than opened

  The laboratory opens straight off the filesystem and that is the point of it.
  The AUDIT cannot: axe fetches every stylesheet to run colour-contrast, and a
  `file://` stylesheet is cross-origin to it. Over `file://` the contrast rule
  does not fail, it does not run, and a clean report would mean nothing.
  `file-check` covers the filesystem path separately.

  Set `LAB_URL` to point it somewhere else.
*/
/*
  Audits the reel laboratory in a real WebKit browser.
  WebKit on purpose: it is the Safari engine, which is most of this product's traffic.
*/
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { mkdirSync } from "node:fs";
import { auditConcepts } from "./audit-concepts.mjs";
import { OPENER, auditColumn } from "./audit-column.mjs";
import { auditColumnStates } from "./audit-column-states.mjs";

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
const AxeBuilder = load("@axe-core/playwright").default;

// Served over http for the audit only.
//
// The laboratory itself opens straight off the filesystem, which is the point
// of it, but axe fetches every stylesheet to run colour-contrast and a
// `file://` stylesheet is cross-origin to it. Over `file://` the contrast rule
// does not fail, it does not RUN, and a clean report would mean nothing.
const LAB =
  process.env.LAB_URL || "http://127.0.0.1:8777/docs/reel-lab/index.html";
/* Under `test-results/`, which `.gitignore` and `.prettierignore` already cover
   as regenerated tooling output. Override with LAB_SHOTS. */
/*
  Screenshots disable animations.

  The poster drifts continuously on the active card, standing in for playback,
  so `.device` never reports itself stable and Playwright waits the full thirty
  seconds before failing the run. It is not a finding about the design and it
  killed an otherwise clean audit.
*/
const SHOTS = process.env.LAB_SHOTS || "./test-results/lab-shots";
mkdirSync(SHOTS, { recursive: true });

const problems = [];
const note = (m) => problems.push(m);

const browser = await webkit.launch();
// A context rather than browser.newPage(): axe-core requires one.
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
  deviceScaleFactor: 2,
});
const page = await context.newPage();

/*
  Reported the moment they happen, not only in the summary at the end.

  A dangling reference to a deleted element threw inside a state machine, which
  stopped the fetch that the next assertion was waiting on, which timed out and
  killed the run before the summary printed. The cause was in hand the whole
  time and invisible. A crash must never be able to hide the thing that caused
  it.
*/
const errors = [];
function record(line) {
  errors.push(line);
  console.error("   !! " + line);
}
page.on("pageerror", (e) => record("pageerror: " + e.message));
page.on("console", (m) => {
  if (m.type() === "error") record("console: " + m.text());
});

await page.goto(LAB);
await page.waitForTimeout(900);

const CONCEPTS = ["01", "02", "03", "04", "05", "06", "07", "08", "09"];
const DEVICES = ["se", "std", "max", "android"];

async function pick(concept) {
  await page.click(`.switch-item[data-concept="${concept}"]`);
  await page.waitForTimeout(500);
}
async function device(id) {
  await page.click(`.device-item[data-device="${id}"]`);
  await page.waitForTimeout(300);
}

/*
  The sections, in their old order, each starting on the concept and phone the
  one before it left. They live in audit-concepts.mjs, audit-column.mjs and
  audit-column-states.mjs so that no file runs past 500 lines (yuvoy-app#243).
*/
const lab = { page, note, pick, device, SHOTS, CONCEPTS, DEVICES };
await auditConcepts(lab);
await auditColumn(lab);
await auditColumnStates(lab);

// ---- accessibility, per concept --------------------------------------------
await device("std");
for (const c of CONCEPTS) {
  await pick(c);
  await page.waitForTimeout(1600); // let concept 03 reach its peek detent
  // Open whatever a concept hides, so axe measures the states people see. The
  // opener differs by concept, and using the wrong one on 06 would navigate.
  await page.evaluate((sel) => {
    const opener = sel
      ? document.querySelector(`.reel-card[data-feed-index="0"] ${sel}`)
      : null;
    if (opener) opener.click();
  }, OPENER[c] || null);
  await page.waitForTimeout(450);
  const res = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .include("#screen")
    .analyze();
  if (res.violations.length) {
    res.violations.forEach((v) =>
      note(
        `[${c}] axe ${v.id} (${v.impact}): ${v.nodes.length} node(s) ${v.nodes[0].target}`,
      ),
    );
  } else {
    console.log(`[a11y] concept ${c}: clean`);
  }
}

console.log("\n=== console/page errors ===");
console.log(errors.length ? errors.join("\n") : "none");
console.log("\n=== audit problems ===");
console.log(problems.length ? problems.join("\n") : "none");
await browser.close();

process.exitCode = problems.length || errors.length ? 1 : 0;
