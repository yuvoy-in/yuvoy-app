/*
  Concept 06's legibility over the palest frame, the three states of 07's
  departures fetch, and 09's panel across a swipe. Moved word for word out of
  `audit.mjs`, which runs them after `auditColumn` (yuvoy-app#243).
*/

export async function auditColumnStates({ page, note, pick, device, SHOTS }) {
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
  console.log(
    `\n[07] failed fetch: alert=${failed.alert} retry=${failed.retry}`,
  );

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
    document
      .querySelector('.reel-card[data-feed-index="1"] .col-arrow')
      .click();
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
  await page.evaluate(() =>
    document.querySelectorAll(".stress-item")[2].click(),
  );
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
}
