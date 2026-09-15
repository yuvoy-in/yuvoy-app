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

// ---- geometry audit --------------------------------------------------------
for (const c of CONCEPTS) {
  await pick(c);
  for (const d of DEVICES) {
    await device(d);
    await page.waitForTimeout(250);

    const report = await page.evaluate(() => {
      const screen = document.getElementById("screen");
      const sRect = screen.getBoundingClientRect();
      const idx = window.__auditIndex || 0;
      const card = screen.querySelector(`.reel-card[data-feed-index="${idx}"]`);
      const bar = screen.querySelector(".tabbar-pill");
      const barRect = bar.getBoundingClientRect();

      const out = {
        overlaps: [],
        overflow: null,
        smallTargets: [],
        unnamed: [],
        clipped: [],
        barTop: barRect.top - sRect.top,
        screenH: sRect.height,
      };

      // Anything the caption draws must clear the bar.
      const texts = card.querySelectorAll(
        "h2, .reel-title, p, dd, dt, a, button, span",
      );
      texts.forEach((n) => {
        const r = n.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) return;
        if (n.closest(".tabbar") || n.closest(".rf-debug")) return;
        // horizontal overlap with the bar, and vertical intrusion
        const onScreen = r.top < sRect.bottom - 2 && r.bottom > sRect.top + 2;
        const hOverlap = r.left < barRect.right && r.right > barRect.left;
        if (
          onScreen &&
          hOverlap &&
          r.bottom > barRect.top + 1 &&
          r.top < barRect.bottom
        ) {
          out.overlaps.push({
            cls: n.className.toString().slice(0, 40),
            tag: n.tagName,
            bottom: Math.round(r.bottom - sRect.top),
            barTop: Math.round(barRect.top - sRect.top),
          });
        }
        if (r.right > sRect.right + 1 || r.left < sRect.left - 1) {
          out.clipped.push({
            cls: n.className.toString().slice(0, 40),
            tag: n.tagName,
            left: Math.round(r.left - sRect.left),
            right: Math.round(r.right - sRect.left),
          });
        }
      });

      // Tap targets: SC 2.5.8 asks 24px. The app's own controls are 44.
      card.querySelectorAll("a, button").forEach((n) => {
        if (n.hasAttribute("hidden") || n.offsetParent === null) return;
        const r = n.getBoundingClientRect();
        if (r.height === 0) return;
        if (r.top > sRect.bottom || r.bottom < sRect.top) return; // parked off-frame
        if (r.height < 24 || r.width < 24)
          out.smallTargets.push({
            cls: n.className.toString().slice(0, 40),
            w: Math.round(r.width),
            h: Math.round(r.height),
          });
        const named = n.getAttribute("aria-label") || n.textContent.trim();
        if (!named) out.unnamed.push(n.className.toString().slice(0, 40));
      });

      // The clamp. A title that outgrows its own line budget is unclamped,
      // which is what `display: block` over `-webkit-box` silently did.
      out.unclamped = [];
      screen.querySelectorAll(".reel-title, .fn-title").forEach((n) => {
        const r = n.getBoundingClientRect();
        if (!r.height) return;
        const cs = getComputedStyle(n);
        const lines = Number(cs.webkitLineClamp || cs.lineClamp || 0);
        if (!lines) {
          out.unclamped.push({
            cls: n.className.toString().slice(0, 24),
            why: "no clamp",
          });
          return;
        }
        const lh = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.05;
        if (r.height > lh * lines + 2) {
          out.unclamped.push({
            cls: n.className.toString().slice(0, 24),
            h: Math.round(r.height),
            max: Math.round(lh * lines),
          });
        }
      });

      out.overflow =
        screen.scrollWidth > screen.clientWidth
          ? screen.scrollWidth - screen.clientWidth
          : 0;
      return out;
    });

    if (report.overlaps.length)
      note(
        `[${c}/${d}] overlaps the tab bar: ${JSON.stringify(report.overlaps)}`,
      );
    if (report.clipped.length)
      note(
        `[${c}/${d}] extends past the screen: ${JSON.stringify(report.clipped.slice(0, 4))}`,
      );
    if (report.smallTargets.length)
      note(
        `[${c}/${d}] tap target under 24px: ${JSON.stringify(report.smallTargets)}`,
      );
    if (report.unnamed.length)
      note(
        `[${c}/${d}] control with no accessible name: ${JSON.stringify(report.unnamed)}`,
      );
    if (report.overflow)
      note(`[${c}/${d}] horizontal overflow ${report.overflow}px`);
    if (report.unclamped && report.unclamped.length)
      note(
        `[${c}/${d}] title is not clamped: ${JSON.stringify(report.unclamped.slice(0, 3))}`,
      );

    if (d === "std") {
      await page.locator(".device").screenshot({
        animations: "disabled",
        path: `${SHOTS}/c${c}-${d}.png`,
      });
    }
  }
}

// ---- long title + bright frame, on the smallest phone ----------------------
await device("se");
for (const c of CONCEPTS) {
  await pick(c);
  // Button order in the panel: Long title, No price, No dates, Unclassified,
  // Bright frame, Dark frame, No clip, No location.
  for (const [label, button] of [
    ["longtitle", 0],
    ["bright", 4],
    ["nodates", 2],
  ]) {
    await page.evaluate(
      (i) => document.querySelectorAll(".stress-item")[i].click(),
      button,
    );
    await page.waitForTimeout(600);
    await page.locator(".device").screenshot({
      animations: "disabled",
      path: `${SHOTS}/c${c}-se-${label}.png`,
    });
  }
}

// ---- concept 04: does the engine actually move the type? -------------------
await device("std");
await pick("04");
await page.waitForTimeout(800);
const zones = await page.evaluate(() =>
  Array.from(document.querySelectorAll(".reel-card"))
    .slice(0, 12)
    .map((c, i) => {
      const s = c.querySelector(".reel-surface");
      return {
        i,
        zone: s.getAttribute("data-zone"),
        veil: s.style.getPropertyValue("--rf-caption-veil"),
        fallback: s.classList.contains("rf-fallback"),
      };
    }),
);
console.log("\n[04] per-frame placement:");
zones.forEach((z) =>
  console.log(
    `   reel ${String(z.i).padStart(2)}  zone=${String(z.zone).padEnd(9)} veil=${z.veil}${z.fallback ? "  FALLBACK" : ""}`,
  ),
);
const distinct = new Set(zones.map((z) => z.zone));
if (distinct.size < 2)
  note(
    "[04] every frame chose the same zone: the engine is not discriminating",
  );
if (zones.some((z) => z.fallback))
  note("[04] some frames fell back: the canvas read failed");

// ---- concept 03: dwell, peek, sheet ceiling --------------------------------
await pick("03");
await page.waitForTimeout(1800);
const peek = await page.evaluate(() => {
  const s = document.querySelector(
    '.reel-card[data-feed-index="0"] .reel-surface',
  );
  return s.getAttribute("data-detent");
});
if (peek !== "peek")
  note(`[03] after 1.8s of dwell the detent is "${peek}", expected "peek"`);
await page.click('.reel-card[data-feed-index="0"] .td-peek');
await page.waitForTimeout(450);
const sheet = await page.evaluate(() => {
  const screen = document.getElementById("screen").getBoundingClientRect();
  const s = document.querySelector(
    '.reel-card[data-feed-index="0"] .reel-surface',
  );
  const sh = document
    .querySelector('.reel-card[data-feed-index="0"] .td-sheet')
    .getBoundingClientRect();
  return {
    detent: s.getAttribute("data-detent"),
    coverPct: Math.round(((screen.bottom - sh.top) / screen.height) * 100),
  };
});
if (sheet.detent !== "open")
  note(`[03] the peek did not open the sheet (detent "${sheet.detent}")`);
if (sheet.coverPct > 54)
  note(
    `[03] the sheet covers ${sheet.coverPct}% of the frame, over its stated 54% ceiling`,
  );
console.log(
  `\n[03] sheet covers ${sheet.coverPct}% of the frame (ceiling 54%)`,
);
await page
  .locator(".device")
  .screenshot({ animations: "disabled", path: `${SHOTS}/c03-sheet-open.png` });

// The sheet OPEN, at every size: does anything in it run under the bar?
for (const d of DEVICES) {
  await device(d);
  await page.waitForTimeout(250);
  await page.evaluate(() => {
    const s = document.querySelector(
      '.reel-card[data-feed-index="0"] .reel-surface',
    );
    if (s.getAttribute("data-detent") !== "open")
      document
        .querySelector('.reel-card[data-feed-index="0"] .td-peek')
        .click();
  });
  await page.waitForTimeout(400);
  const open = await page.evaluate(() => {
    const screen = document.getElementById("screen").getBoundingClientRect();
    const bar = document.querySelector(".tabbar-pill").getBoundingClientRect();
    const sheet = document.querySelector(
      '.reel-card[data-feed-index="0"] .td-sheet',
    );
    const bad = [];
    sheet.querySelectorAll("dt, dd, p, a, span, button").forEach((n) => {
      const r = n.getBoundingClientRect();
      if (!r.height) return;
      if (r.top > screen.bottom || r.bottom < screen.top) return;
      if (
        r.left < bar.right &&
        r.right > bar.left &&
        r.bottom > bar.top &&
        r.top < bar.bottom
      ) {
        bad.push(n.className.toString().slice(0, 30) || n.tagName);
      }
    });
    const sr = sheet.getBoundingClientRect();
    return {
      bad,
      cover: Math.round(((screen.bottom - sr.top) / screen.height) * 100),
      clipped: sheet.scrollHeight > sheet.clientHeight + 1,
    };
  });
  if (open.bad.length)
    note(
      `[03/${d}] open sheet runs under the bar: ${JSON.stringify(open.bad)}`,
    );
  if (open.cover > 54)
    note(
      `[03/${d}] open sheet covers ${open.cover}% of the frame, over the 54% ceiling`,
    );
  if (open.clipped)
    note(`[03/${d}] open sheet content is clipped by its own max-height`);
  console.log(
    `[03/${d}] open sheet covers ${open.cover}%${open.clipped ? "  CLIPPED" : ""}`,
  );
}
await device("std");

// ---- concept 05: double tap holds, tray appears ----------------------------
await pick("05");
await page.waitForTimeout(400);
// Tapped at a fixed point in the middle of the frame, which is where a thumb
// lands and where the play disc appears after the first tap.
const box = await page
  .locator('.reel-card[data-feed-index="0"] .reel-surface')
  .boundingBox();
const px = box.x + box.width / 2;
const py = box.y + box.height * 0.42;
await page.mouse.click(px, py);
await page.waitForTimeout(80);
await page.mouse.click(px, py);
await page.waitForTimeout(500);
const tray = await page.evaluate(() => {
  const t = document.querySelector(".sl-tray");
  const hold = document.querySelector(
    '.reel-card[data-feed-index="0"] .sl-hold',
  );
  const play = document.querySelector(
    '.reel-card[data-feed-index="0"] .reel-play',
  );
  return {
    hidden: t.hidden,
    count: t.querySelectorAll(".sl-thumb").length,
    pressed: hold.getAttribute("aria-pressed"),
    stillPlaying: play ? play.hidden : null,
  };
});
if (tray.stillPlaying === false)
  note("[05] a double tap left the clip paused: playback was not restored");
const trayFit = await page.evaluate(() => {
  const t = document.querySelector(".sl-tray").getBoundingClientRect();
  const acts = document
    .querySelector('.reel-card[data-feed-index="0"] .sl-actions')
    .getBoundingClientRect();
  return { gap: Math.round(t.top - acts.bottom) };
});
if (trayFit.gap < 4)
  note(`[05] the tray sits on the caption: ${trayFit.gap}px between them`);
console.log(
  `\n[05] gap between the caption row and the tray: ${trayFit.gap}px`,
);
if (tray.hidden || tray.count !== 1)
  note(`[05] a double tap did not hold the reel: ${JSON.stringify(tray)}`);
if (tray.pressed !== "true")
  note(`[05] the hold control did not report pressed`);
await page
  .locator(".device")
  .screenshot({ animations: "disabled", path: `${SHOTS}/c05-tray.png` });

// ---- concept 01: hold reveals ---------------------------------------------
await pick("01");
await page.waitForTimeout(300);
await page.click('.reel-card[data-feed-index="0"] .qf-line');
await page.waitForTimeout(400);
const qf = await page.evaluate(() => {
  const s = document.querySelector(
    '.reel-card[data-feed-index="0"] .reel-surface',
  );
  const f = s.querySelector(".qf-facts");
  return {
    open: s.classList.contains("qf-open"),
    opacity: getComputedStyle(f).opacity,
  };
});
if (!qf.open || qf.opacity !== "1")
  note(
    `[01] the availability line did not open the panel: ${JSON.stringify(qf)}`,
  );
await page
  .locator(".device")
  .screenshot({ animations: "disabled", path: `${SHOTS}/c01-open.png` });

// ---- the Column family -----------------------------------------------------
//
// Four concepts share one screen, so the shared promises are checked once each
// against every one of them: the arrow opens a panel rather than navigating,
// the panel holds its 54% ceiling on every phone, and save is a real toggle.

/*
  What opens the panel is not the same control in every concept.

  Concept 06 took the owner's ruling of 14 September: the chevron after the
  seats discloses and the arrow goes back to being the way out of the feed. The
  other three still put disclosure on the arrow.
*/
const OPENER = {
  "06": ".col-when-button",
  "07": ".col-arrow",
  "08": ".col-arrow",
  "09": ".col-arrow",
};

for (const c of ["06", "07", "08", "09"]) {
  await device("std");
  await pick(c);
  await page.waitForTimeout(500);

  const arrow = page.locator(`.reel-card[data-feed-index="0"] ${OPENER[c]}`);
  const before = new URL(page.url()).href;
  await arrow.click();
  await page.waitForTimeout(450);

  const open = await page.evaluate(
    ({ concept, opener }) => {
      const screen = document.getElementById("screen").getBoundingClientRect();
      const sheet =
        concept === "09"
          ? document.querySelector(".cc-sheet")
          : document.querySelector(
              '.reel-card[data-feed-index="0"] .col-sheet',
            );
      const bar = document
        .querySelector(".tabbar-pill")
        .getBoundingClientRect();
      const r = sheet.getBoundingClientRect();
      const bad = [];
      sheet.querySelectorAll("dt, dd, p, a, span, button").forEach((n) => {
        const b = n.getBoundingClientRect();
        if (!b.height) return;
        if (b.top > screen.bottom || b.bottom < screen.top) return;
        if (
          b.left < bar.right &&
          b.right > bar.left &&
          b.bottom > bar.top &&
          b.top < bar.bottom
        ) {
          bad.push(n.className.toString().slice(0, 24) || n.tagName);
        }
      });
      const scroll = sheet.querySelector(".col-sheet-scroll");
      const title = sheet.querySelector(".col-sheet-title");
      const cardTitle = document
        .querySelector('.reel-card[data-feed-index="0"]')
        .getAttribute("aria-label");
      return {
        cover: Math.round(((screen.bottom - r.top) / screen.height) * 100),
        expanded: document
          .querySelector(`.reel-card[data-feed-index="0"] ${opener}`)
          .getAttribute("aria-expanded"),
        /* The SHELL must never clip: it is a flex column whose body scrolls. */
        clipped: sheet.scrollHeight > sheet.clientHeight + 1,
        /* The BODY overflowing is allowed, but only where there is no room. */
        overflows: scroll
          ? scroll.scrollHeight > scroll.clientHeight + 1
          : false,
        hasCta: Boolean(sheet.querySelector(".col-cta")),
        /* The foot steps aside when this opens, so the panel has to name what it
         is describing or it is a price floating over a video. */
        names: title ? title.textContent.trim() : null,
        cardTitle,
        bad,
      };
    },
    { concept: c, opener: OPENER[c] },
  );

  if (new URL(page.url()).href !== before)
    note(`[${c}] ${OPENER[c]} navigated; it should open the panel`);
  if (open.expanded !== "true")
    note(`[${c}] ${OPENER[c]} did not report aria-expanded=true`);
  if (open.cover > 54)
    note(
      `[${c}] the panel covers ${open.cover}% of the frame, over its 54% ceiling`,
    );
  if (open.clipped) note(`[${c}] the panel clips its own content`);
  if (open.overflows)
    note(
      `[${c}] the panel has to scroll on a standard phone; it should fit there and scroll only on an SE`,
    );
  if (!open.names)
    note(`[${c}] the panel does not name the experience it describes`);
  else if (open.names !== open.cardTitle)
    note(
      `[${c}] the panel names "${open.names}" but the card is "${open.cardTitle}"`,
    );
  if (!open.hasCta)
    note(
      `[${c}] the panel has no call to action, so the listing is unreachable from it`,
    );
  if (open.bad.length)
    note(`[${c}] the panel runs under the bar: ${JSON.stringify(open.bad)}`);
  console.log(`[${c}] panel covers ${open.cover}% of the frame`);

  // The panel on the smallest phone is where it breaks if it is going to.
  await device("se");
  await page.waitForTimeout(400);
  const se = await page.evaluate((concept) => {
    const screen = document.getElementById("screen").getBoundingClientRect();
    const sheet =
      concept === "09"
        ? document.querySelector(".cc-sheet")
        : document.querySelector('.reel-card[data-feed-index="0"] .col-sheet');
    const scroll = sheet.querySelector(".col-sheet-scroll");
    const cta = sheet.querySelector(".col-cta");
    const r = sheet.getBoundingClientRect();
    return {
      cover: Math.round(((screen.bottom - r.top) / screen.height) * 100),
      clipped: sheet.scrollHeight > sheet.clientHeight + 1,
      overflows: scroll.scrollHeight > scroll.clientHeight + 1,
      more: scroll.getAttribute("data-more"),
      /* Both an `<a>` and a `<button>` wear this class and they do not size
         alike under `display: flex`. */
      ctaFills:
        cta.getBoundingClientRect().width >
        sheet.getBoundingClientRect().width - 48,
    };
  }, c);
  if (se.cover > 54)
    note(`[${c}/se] the panel covers ${se.cover}%, over its 54% ceiling`);
  if (se.clipped) note(`[${c}/se] the panel shell clips its own content`);
  /*
    Scrolling on the smallest phone is allowed. Scrolling SILENTLY is not: a
    hidden scrollbar on a panel that does not fit is content nobody knows is
    there, and what falls off the bottom is the operator's credential line.
  */
  if (se.overflows && se.more !== "true")
    note(`[${c}/se] the panel scrolls with no sign that it does`);
  if (!se.ctaFills)
    note(
      `[${c}/se] the action does not fill the panel; it is sized to its label`,
    );
  console.log(
    `[${c}/se] panel covers ${se.cover}%${se.overflows ? "  scrolls, marked " + se.more : ""}`,
  );

  await device("std");
  await page.waitForTimeout(300);

  // Close the panel first. It covers the foot by design, and a control behind it
  // must be unreachable: that is the fix, not an obstacle to the test.
  await page.evaluate((concept) => {
    const handle =
      concept === "09"
        ? document.querySelector(".cc-sheet .col-handle")
        : document.querySelector('.reel-card[data-feed-index="0"] .col-handle');
    if (handle) handle.click();
  }, c);
  await page.waitForTimeout(400);

  // Nothing behind the panel may be reachable while it is open.
  await page.evaluate(
    (sel) =>
      document.querySelector(`.reel-card[data-feed-index="0"] ${sel}`).click(),
    OPENER[c],
  );
  await page.waitForTimeout(400);
  const behind = await page.evaluate(() => {
    const foot = document.querySelector(
      '.reel-card[data-feed-index="0"] .col-bottom, .reel-card[data-feed-index="0"] .ca-caption',
    );
    return foot ? getComputedStyle(foot).visibility : "hidden";
  });
  if (behind !== "hidden")
    note(
      `[${c}] the foot is still reachable behind the open panel (visibility: ${behind})`,
    );
  await page.evaluate((concept) => {
    const handle =
      concept === "09"
        ? document.querySelector(".cc-sheet .col-handle")
        : document.querySelector('.reel-card[data-feed-index="0"] .col-handle');
    if (handle) handle.click();
  }, c);
  await page.waitForTimeout(400);

  // Save is a real toggle, and it is private: no count may appear beside it.
  const save = page.locator('.reel-card[data-feed-index="0"] .col-save');
  await save.click();
  await page.waitForTimeout(250);
  const saved = await page.evaluate(() => {
    const n = document.querySelector(
      '.reel-card[data-feed-index="0"] .col-save',
    );
    return {
      pressed: n.getAttribute("aria-pressed"),
      label: n.getAttribute("aria-label"),
      text: n.textContent.trim(),
    };
  });
  if (saved.pressed !== "true") note(`[${c}] save did not toggle`);
  if (/\d/.test(saved.text))
    note(
      `[${c}] a number appears on the save control: this product publishes no counts`,
    );
  await save.click();
  await page.waitForTimeout(200);
  const unsaved = await page.evaluate(() =>
    document
      .querySelector('.reel-card[data-feed-index="0"] .col-save')
      .getAttribute("aria-pressed"),
  );
  if (unsaved !== "false") note(`[${c}] save did not toggle back off`);
}

// ---- 06: one job per control -----------------------------------------------
//
// The owner's ruling of 14 September. The chevron after the seats discloses;
// the arrow leaves. Asserted by NAME rather than by counting controls, because
// a count passes for the wrong reason the moment somebody adds one thing and
// removes another.

await device("std");
await pick("06");
await page.waitForTimeout(500);

const split = await page.evaluate(() => {
  const card = document.querySelector('.reel-card[data-feed-index="0"]');
  const line = card.querySelector(".col-when-button");
  /* The glyph became a word on 14 September, so the control changed class. */
  const arrow = card.querySelector(".col-book");
  const r = line ? line.getBoundingClientRect() : null;
  return {
    lineIsControl: Boolean(line),
    lineHeight: r ? Math.round(r.height) : 0,
    lineExpanded: line ? line.getAttribute("aria-expanded") : null,
    hasChevron: Boolean(card.querySelector(".col-when-chevron")),
    /* The chevron sits AFTER the seats, which is where it was asked for. */
    chevronIsLast: line
      ? line.lastElementChild &&
        line.lastElementChild.classList.contains("col-when-chevron")
      : false,
    arrowHref: arrow ? arrow.getAttribute("href") : null,
    arrowExpanded: arrow ? arrow.getAttribute("aria-expanded") : null,
    /* Both centres agree, which they did not when the line was plain type. */
    centreDelta: (() => {
      if (!line || !arrow) return -1;
      const a = line.getBoundingClientRect();
      const b = arrow.getBoundingClientRect();
      return Math.abs(a.top + a.height / 2 - (b.top + b.height / 2));
    })(),
  };
});

if (!split.lineIsControl) note("[06] the availability line is not a control");
if (!split.hasChevron) note("[06] the availability line has no chevron");
if (!split.chevronIsLast)
  note("[06] the chevron is not the last thing on the line");
/*
  36px, not 44px, and the number moved for a reason rather than to pass.

  This asserted 44 because that was the size when the line became a control.
  The owner then asked for the whole bottom cluster to come down, and 36px is
  the app's own `sm`: the design system's scale is 36 / 44 / 52, so this is
  still ON the scale rather than off the end of it. WCAG 2.5.8's floor is 24px,
  which both clear.

  Below 36 would be leaving the system, which is a different decision and not
  one a size pass gets to make quietly.
*/
if (split.lineHeight < 36)
  note(
    `[06] the availability control is ${split.lineHeight}px tall, below the system's smallest control at 36px`,
  );
if (split.lineExpanded !== "false")
  note(
    `[06] the availability control does not start collapsed (${split.lineExpanded})`,
  );
if (!split.arrowHref)
  note("[06] the Book control has no href, so it is not a link to the listing");
if (split.arrowExpanded !== null)
  note("[06] the Book control claims aria-expanded; it discloses nothing");
/*
  The word has to follow the data. `nextAvailable` absent means nothing is
  bookable in ninety days, and a button offering to book it is the losing tap
  this whole study started from.
*/
const words = await page.evaluate(() =>
  Array.from(document.querySelectorAll(".reel-card"))
    .slice(0, 12)
    .map((c) => ({
      label: (c.querySelector(".col-book") || {}).textContent || "",
      hasDates: !/No dates/.test(c.querySelector(".col-when").textContent),
    })),
);
const wrong = words.filter((w) => (w.label.trim() === "Book") !== w.hasDates);
if (wrong.length)
  note(
    `[06] the Book label disagrees with availability on ${wrong.length} reel(s): ${JSON.stringify(wrong.slice(0, 3))}`,
  );
console.log(
  `[06] labels: ${words.filter((w) => w.label.trim() === "Book").length} Book, ${words.filter((w) => w.label.trim() === "View").length} View (no dates in 90 days)`,
);
if (split.centreDelta > 1)
  note(
    `[06] the line and the arrow are ${split.centreDelta}px out of alignment`,
  );
console.log(
  `\n[06] chevron discloses, arrow links to ${split.arrowHref}, centres ${split.centreDelta}px apart`,
);

// ---- every face inside the phone is the product's ---------------------------
//
// The laboratory's own chrome is monospace, so anything inside the phone that
// forgets to name a face inherits the wrong one. It happened twice: the new
// availability control and every tab bar item. Fixed on `.reel-frame` so a
// concept can add a control without remembering, and guarded here so the fix
// cannot quietly come undone.

for (const c of CONCEPTS) {
  await pick(c);
  await page.waitForTimeout(400);
  const wrongFace = await page.evaluate(() => {
    const out = [];
    document.querySelectorAll("#screen *").forEach((n) => {
      if (n.children.length || !n.textContent.trim()) return;
      /* The frame-reading grid's readout is the INSTRUMENT, not the product,
         and it is monospace on purpose: it prints measurements that have to
         line up column by column. Everything else in the phone is the product
         and must wear the product's faces. */
      if (n.closest(".frame-debug")) return;
      if (/mono|SF Mono|Menlo|Consolas/i.test(getComputedStyle(n).fontFamily)) {
        out.push(n.className.toString().slice(0, 30) || n.tagName);
      }
    });
    return out;
  });
  if (wrongFace.length)
    note(
      `[${c}] text rendered in the laboratory's monospace: ${JSON.stringify(wrongFace.slice(0, 4))}`,
    );
}
console.log(
  "[faces] every text leaf inside the phone uses the product's faces",
);

// ---- 06: the lightened chassis is still legible -----------------------------
//
// The owner asked for less shade on 14 September and they were right: the
// shipped scrim reached 100% abyss at the foot and held 19.21:1 where the floor
// is 4.5:1. Lightening a scrim is the easiest change in this whole laboratory
// to get wrong, because it fails only over the palest frame, only on the
// shortest phone, and never in a screenshot anybody happens to take.
//
// So the ramp is PARSED out of the stylesheet, composited over the measured
// surf highlight, and checked at the position each piece of type actually
// occupies. This is the pattern `palette.test.ts` uses in production, and for
// the same reason: the numbers in a comment are a claim, and the stylesheet is
// the fact.

await device("se"); // the worst case: the shortest scrim, so type sits highest
await pick("06");
await page.waitForTimeout(500);

const legible = await page.evaluate(async () => {
  const ABYSS = [10, 16, 14];
  const PAPER = [255, 255, 255];
  /* The palest surf the design system measures artwork against, #E8E2D4. */
  const SURF = [232, 226, 212];

  const ch = (v) => {
    const x = v / 255;
    return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
  };
  const lum = ([r, g, b]) => 0.2126 * ch(r) + 0.7152 * ch(g) + 0.0722 * ch(b);
  const ratio = (a, b) => {
    const x = lum(a);
    const y = lum(b);
    return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
  };
  const mix = (fg, bg, a) => fg.map((c, i) => c * a + bg[i] * (1 - a));

  /*
    Pull the ramp out of the rendered rule rather than trusting a constant.

    It must match what the BROWSER resolved, not what was authored. WebKit
    computes `color-mix(in srgb, var(--abyss) 86%, transparent)` down to
    `color(srgb 0.039216 0.062745 0.054902 / 0.86)`, and an earlier version of
    this regex only knew the authored form. Every stop then parsed as zero
    alpha, so the whole scrim measured 1.13:1 and this check reported six
    failures against a scrim that was fine. A guard that cannot read the thing
    it guards is worse than no guard: it cries wolf until somebody deletes it.
  */
  function stopsOf(selector) {
    const bg = getComputedStyle(
      document.querySelector(selector),
    ).backgroundImage;
    const out = [];
    const re =
      /color\(srgb\s+[\d.]+\s+[\d.]+\s+[\d.]+(?:\s*\/\s*([\d.]+))?\)\s*([\d.]+)%|\b(?:transparent|rgba?\([^)]*\))\s*([\d.]+)%/g;
    let m;
    while ((m = re.exec(bg))) {
      if (m[2] !== undefined) {
        out.push([
          parseFloat(m[2]),
          m[1] === undefined ? 100 : parseFloat(m[1]) * 100,
        ]);
      } else {
        out.push([parseFloat(m[3]), 0]);
      }
    }
    return out.sort((a, b) => a[0] - b[0]);
  }
  const at = (stops, pos) => {
    for (let i = 0; i < stops.length - 1; i++) {
      const [p0, a0] = stops[i];
      const [p1, a1] = stops[i + 1];
      if (pos >= p0 && pos <= p1) {
        const t = p1 === p0 ? 0 : (pos - p0) / (p1 - p0);
        return (a0 + (a1 - a0) * t) / 100;
      }
    }
    return 0;
  };

  const card = document.querySelector('.reel-card[data-feed-index="0"]');
  const frame = document.querySelector(".reel-frame").getBoundingClientRect();
  const scrim = card.querySelector(".reel-scrim").getBoundingClientRect();
  const bottom = stopsOf('.reel-card[data-feed-index="0"] .reel-scrim');
  const top = stopsOf(".masthead");

  /* The gradient runs `to top`, so 0% is the scrim's bottom edge. The TOP edge
     of a line is what matters: it sits highest, where the scrim is lightest. */
  const gradTopOf = (sel) => {
    const n = card.querySelector(sel);
    if (!n) return null;
    return (
      ((frame.bottom - n.getBoundingClientRect().top) / scrim.height) * 100
    );
  };

  /*
    The ink is READ, never assumed.

    These four were declared with the colour each was believed to use, and the
    seats entry was pinned to `TERRA_SOFT`. When the accent was taken out of
    this concept's caption for failing its floor, the guard went on measuring
    the accent and went on failing: it was checking a constant in its own source
    rather than the pixel on the screen. A guard that cannot see a fix cannot
    confirm one.
  */
  const inkOf = (el) => {
    const cs = getComputedStyle(el).color;
    const nums = cs.match(/[\d.]+/g) || [];
    if (/^color\(/.test(cs)) {
      return {
        rgb: nums.slice(0, 3).map((n) => Math.round(parseFloat(n) * 255)),
        alpha: nums.length > 3 ? parseFloat(nums[3]) : 1,
      };
    }
    return {
      rgb: nums.slice(0, 3).map((n) => Math.round(parseFloat(n))),
      alpha: nums.length > 3 ? parseFloat(nums[3]) : 1,
    };
  };

  const checks = [
    ["eyebrow", ".col-eyebrow", 4.5],
    ["title", ".col-title", 3],
    ["availability", ".col-when-button", 4.5],
    ["seats", ".col-seats", 4.5],
  ].map(([name, sel, floor]) => {
    const pos = gradTopOf(sel);
    if (pos === null) return { name, missing: true };
    const el = card.querySelector(sel);
    const read = inkOf(el);
    const ink = read.rgb;
    const inkAlpha = read.alpha;
    const bg = mix(ABYSS, SURF, at(bottom, pos));
    return {
      name,
      pos: +pos.toFixed(1),
      abyss: Math.round(at(bottom, pos) * 100),
      inkAlpha,
      got: +ratio(mix(ink, bg, inkAlpha), bg).toFixed(2),
      floor,
    };
  });

  /* The mark and the sound control are GRAPHICS: 3:1, not 4.5:1. They occupy
     11% to 31% of the masthead block, which the geometry comment pins. */
  const mark = [11, 31].map((pos) => {
    const bg = mix(ABYSS, SURF, at(top, pos));
    return {
      pos,
      abyss: Math.round(at(top, pos) * 100),
      got: +ratio(PAPER, bg).toFixed(2),
      floor: 3,
    };
  });

  /* The bar, measured WITHOUT its blur: a browser that drops `backdrop-filter`
     must still clear the floor. Inactive glyphs are paper/70 on the bar, which
     makes them graphics at 3:1. */
  const pill = document.querySelector(".tabbar-pill");
  const pillBg = getComputedStyle(pill).backgroundColor;
  const pm = pillBg.match(
    /([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,/\s]+([\d.]+))?/,
  );
  const barAlpha = pm && pm[4] !== undefined ? parseFloat(pm[4]) : 1;
  const barRgb = pm ? [+pm[1], +pm[2], +pm[3]] : [22, 54, 46];
  const barOverSurf = mix(barRgb, SURF, barAlpha);
  const glyph = mix(PAPER, barOverSurf, 0.7);

  return {
    footAbyss: Math.round(at(bottom, 0) * 100),
    checks,
    mark,
    bar: {
      alpha: barAlpha,
      glyph: +ratio(glyph, barOverSurf).toFixed(2),
      object: +ratio(barOverSurf, SURF).toFixed(2),
    },
  };
});

for (const c of legible.checks) {
  if (c.missing) {
    note(`[06] legibility check cannot find ${c.name}`);
    continue;
  }
  const ok = c.got >= c.floor;
  if (!ok)
    note(
      `[06] ${c.name} is ${c.got}:1 over the palest surf, under its ${c.floor}:1 floor (at ${c.pos}% of the scrim, ${c.abyss}% abyss)`,
    );
  console.log(
    `[06] ${c.name.padEnd(13)} ${String(c.pos).padStart(5)}% of scrim  ${String(c.abyss).padStart(3)}% abyss  ${String(c.got).padStart(6)}:1  floor ${c.floor}  ${ok ? "ok" : "FAIL"}`,
  );
}
for (const m of legible.mark) {
  if (m.got < m.floor)
    note(
      `[06] the masthead is ${m.got}:1 at ${m.pos}% of its block, under the 3:1 graphics floor`,
    );
}
/* A scrim that reaches full opacity is not shade, it is a crop. That is the
   whole of what the owner reported and the one thing this must not undo. */
if (legible.footAbyss >= 97)
  note(
    `[06] the caption scrim is ${legible.footAbyss}% abyss at the foot; it reads as a crop rather than as shade`,
  );
if (legible.bar.glyph < 3)
  note(
    `[06] the bar's inactive glyphs are ${legible.bar.glyph}:1 without a blur, under the 3:1 floor`,
  );
if (legible.bar.object < 3)
  note(
    `[06] the bar is ${legible.bar.object}:1 against the palest surf and stops reading as a surface`,
  );
console.log(
  `[06] masthead ${legible.mark.map((m) => m.got + ":1").join(" / ")}   foot ${legible.footAbyss}% abyss   bar ${Math.round(legible.bar.alpha * 100)}% -> glyph ${legible.bar.glyph}:1, object ${legible.bar.object}:1`,
);
await device("std");

// ---- 07: the three states of the departures fetch --------------------------
await pick("07");
await page.waitForTimeout(400);

/*
  One action per view, so the pinned control carries the change.

  In FACTS it reads "Choose a day" and opens the dates; in DATES it reads "Full
  listing" and leaves. There is no separate toggle row any more: it was one, and
  it was what pushed the panel past its ceiling on a standard phone.
*/
async function openDates() {
  await page.click('.reel-card[data-feed-index="0"] .col-arrow');
  await page.waitForTimeout(350);
  const label = await page.textContent(
    '.reel-card[data-feed-index="0"] .col-cta span',
  );
  if (!/choose a day/i.test(label))
    note(`[07] the facts view's action says "${label}", not "Choose a day"`);
  await page.click('.reel-card[data-feed-index="0"] .col-cta');
}

// Failing.
await page.click('[data-fetch="fail"]');
await openDates();
await page.waitForTimeout(900);
const failed = await page.evaluate(() => {
  const b = document.querySelector(
    '.reel-card[data-feed-index="0"] .cd-dates-body',
  );
  return {
    alert: Boolean(b.querySelector('[role="alert"]')),
    retry: Boolean(b.querySelector(".cd-retry")),
  };
});
if (!failed.alert || !failed.retry)
  note(
    `[07] a failed fetch has no alert or no retry: ${JSON.stringify(failed)}`,
  );
console.log(`\n[07] failed fetch: alert=${failed.alert} retry=${failed.retry}`);

// Recovering, from the retry.
await page.click('[data-fetch="normal"]');
await page.click('.reel-card[data-feed-index="0"] .cd-retry');
await page.waitForTimeout(900);
const recovered = await page.evaluate(
  () =>
    document.querySelectorAll(
      '.reel-card[data-feed-index="0"] .cd-chip:not(.cd-chip-skeleton)',
    ).length,
);
if (recovered < 1)
  note(`[07] the retry did not recover: ${recovered} departures`);
console.log(`[07] retry recovered ${recovered} departures`);
const labels = await page.evaluate(() => {
  const card = document.querySelector('.reel-card[data-feed-index="0"]');
  return {
    cta: card.querySelector(".col-cta span").textContent.trim(),
    /* The panel's own title is the route to the listing in every concept in
       this family, and it is the only one left once the foot steps aside and
       the second view replaces the facts. */
    titleHref: card.querySelector(".col-sheet-title")
      ? card.querySelector(".col-sheet-title").getAttribute("href")
      : null,
  };
});
/* The action says what it does in THIS view. "See dates" under a rail of dates
   offers what is already on screen. */
if (/see dates|choose a day/i.test(labels.cta))
  note(`[07] in the dates view the action still says "${labels.cta}"`);
if (!labels.titleHref)
  note(
    "[07] the panel's title is not a link, so the listing is unreachable from the dates view",
  );
console.log(
  `[07] dates view: action "${labels.cta}", title links to ${labels.titleHref}`,
);
await page
  .locator(".device")
  .screenshot({ animations: "disabled", path: `${SHOTS}/c07-dates.png` });

// The empty answer, which is a disagreement rather than an absence: the card
// promised a departure and the endpoint had none. A listing with no dates at
// all never reaches this view, by design.
/*
  On a FRESH card, and that is not a detail of the test.

  Card zero has already fetched by this point, and a listing that has answered
  once is never asked again: the request rides the first opening of the second
  detent and nothing after it. Reusing that card measured the cache working
  correctly and read as the empty state being broken.
*/
await page.click('[data-fetch="empty"]');
await page.evaluate(() => {
  document.querySelector('.reel-card[data-feed-index="1"] .col-arrow').click();
});
await page.waitForTimeout(350);
await page.evaluate(() => {
  document.querySelector('.reel-card[data-feed-index="1"] .col-cta').click();
});
await page.waitForTimeout(1100);
const empty = await page.evaluate(() => {
  const b = document.querySelector(
    '.reel-card[data-feed-index="1"] .cd-dates-body',
  );
  return {
    chips: b.querySelectorAll(".cd-chip").length,
    note: (b.querySelector(".cd-note") || {}).textContent || "",
  };
});
if (empty.chips !== 0 || !empty.note.trim())
  note(`[07] the empty answer is wrong: ${JSON.stringify(empty)}`);
console.log(`[07] empty answer: "${empty.note.trim().slice(0, 56)}"`);
await page.click('[data-fetch="normal"]');

// A listing with nothing in ninety days never offers days at all.
await page.evaluate(() => document.querySelectorAll(".stress-item")[2].click());
await page.waitForTimeout(700);
const noDates = await page.evaluate(() => {
  const card = document.querySelector('.reel-card[data-feed-index="4"]');
  card.querySelector(".col-arrow").click();
  return card.querySelector(".col-cta span").textContent.trim();
});
if (/choose a day/i.test(noDates))
  note(
    `[07] a listing with no dates offers "${noDates}"; it should go to the listing`,
  );
console.log(`[07] no-dates listing offers "${noDates}"`);

// ---- 09: the panel survives a swipe and the facts change -------------------
await pick("09");
await page.waitForTimeout(400);
await page.click('.reel-card[data-feed-index="0"] .col-arrow');
await page.waitForTimeout(400);
const first = await page.evaluate(() =>
  document.querySelector(".cc-body").textContent.trim(),
);
await page.evaluate(() => {
  const s = document.querySelector(".reel-strip");
  s.scrollTop = s.clientHeight;
});
await page.waitForTimeout(900);
const second = await page.evaluate(() => ({
  open: document.querySelector(".cc-sheet").getAttribute("data-open"),
  body: document.querySelector(".cc-body").textContent.trim(),
}));
if (second.open !== "open")
  note("[09] the panel closed on a swipe; it is meant to persist");
if (second.body === first)
  note("[09] the panel did not update to the new reel");
console.log(
  `\n[09] panel persisted across a swipe and its facts changed: ${second.open === "open" && second.body !== first}`,
);
await page
  .locator(".device")
  .screenshot({ animations: "disabled", path: `${SHOTS}/c09-compare.png` });

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
