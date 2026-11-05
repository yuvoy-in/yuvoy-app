/*
  The Column family's shared promises on 06 to 09, concept 06's one job per
  control, and the check that every face inside the phone is the product's.
  Moved word for word out of `audit.mjs`, which runs them after
  `auditConcepts` (yuvoy-app#243).
*/

/*
  What opens the panel is not the same control in every concept.

  Concept 06 took the owner's ruling of 14 September: the chevron after the
  seats discloses and the arrow goes back to being the way out of the feed. The
  other three still put disclosure on the arrow.
*/
export const OPENER = {
  "06": ".col-when-button",
  "07": ".col-arrow",
  "08": ".col-arrow",
  "09": ".col-arrow",
};

export async function auditColumn({ page, note, pick, device, CONCEPTS }) {
  // ---- the Column family -----------------------------------------------------
  //
  // Four concepts share one screen, so the shared promises are checked once each
  // against every one of them: the arrow opens a panel rather than navigating,
  // the panel holds its 54% ceiling on every phone, and save is a real toggle.

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
        const screen = document
          .getElementById("screen")
          .getBoundingClientRect();
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
          : document.querySelector(
              '.reel-card[data-feed-index="0"] .col-sheet',
            );
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
          : document.querySelector(
              '.reel-card[data-feed-index="0"] .col-handle',
            );
      if (handle) handle.click();
    }, c);
    await page.waitForTimeout(400);

    // Nothing behind the panel may be reachable while it is open.
    await page.evaluate(
      (sel) =>
        document
          .querySelector(`.reel-card[data-feed-index="0"] ${sel}`)
          .click(),
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
          : document.querySelector(
              '.reel-card[data-feed-index="0"] .col-handle',
            );
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
    note(
      "[06] the Book control has no href, so it is not a link to the listing",
    );
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
        if (
          /mono|SF Mono|Menlo|Consolas/i.test(getComputedStyle(n).fontFamily)
        ) {
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
}
