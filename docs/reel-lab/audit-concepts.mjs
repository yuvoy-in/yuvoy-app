/*
  The audit's first sections: the geometry sweep over every concept and phone,
  the long-title check on the smallest phone, and the behaviour of concepts
  04, 03, 05 and 01. Moved word for word out of `audit.mjs`, which runs them in
  this order on its one page (yuvoy-app#243).
*/

export async function auditConcepts({
  page,
  note,
  pick,
  device,
  SHOTS,
  CONCEPTS,
  DEVICES,
}) {
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
        const card = screen.querySelector(
          `.reel-card[data-feed-index="${idx}"]`,
        );
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
          const lh =
            parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.05;
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
  await page.locator(".device").screenshot({
    animations: "disabled",
    path: `${SHOTS}/c03-sheet-open.png`,
  });

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
      const bar = document
        .querySelector(".tabbar-pill")
        .getBoundingClientRect();
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
}
