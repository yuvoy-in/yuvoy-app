import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

/**
 * Search: a filter pop-up and a reel grid that plays in place — yuvoy-app#37.
 *
 * Three of the four asks are only provable in a real browser: that the sheet
 * is a modal (a top layer and a focus trap the browser owns, not a div with a
 * z-index), that tapping a reel opens the same filtered order, and that back
 * returns to the grid where it was.
 */

test.describe("the filter sheet", () => {
  test("is one button, and the chip rows are gone from the screen", async ({
    page,
  }) => {
    await page.goto("/search");
    await expect(page.getByRole("button", { name: /^Filters/ })).toBeVisible();
    // The three stacked rows the owner called out are not on the page.
    await expect(page.getByRole("group", { name: "When" })).toHaveCount(0);
    await expect(page.getByRole("group", { name: "Where" })).toHaveCount(0);
  });

  test("is a real modal: it traps focus and Escape closes it", async ({
    page,
  }) => {
    /*
      The reason it is a `<dialog>` rather than a div with `role="dialog"`.
      Only a real browser has a top layer and only a real browser enforces the
      trap, so this cannot be asserted anywhere but here.
    */
    await page.goto("/search");
    await page.getByRole("button", { name: /^Filters/ }).click();

    const sheet = page.getByRole("dialog", { name: "Filters" });
    await expect(sheet).toBeVisible();

    // Focus cannot escape to the page behind it.
    await page.keyboard.press("Tab");
    await expect(sheet).toContainText("When");
    const focusedInsideSheet = await page.evaluate(() => {
      const dialog = document.querySelector("dialog[open]");
      return dialog?.contains(document.activeElement) ?? false;
    });
    expect(focusedInsideSheet).toBe(true);

    await page.keyboard.press("Escape");
    await expect(sheet).toBeHidden();
    // And the button still opens it again — the close event has to reach React
    // or the parent keeps thinking the sheet is up.
    await page.getByRole("button", { name: /^Filters/ }).click();
    await expect(page.getByRole("dialog", { name: "Filters" })).toBeVisible();
  });

  test("applies to the address, and only on Show results", async ({ page }) => {
    await page.goto("/search");
    await page.getByRole("button", { name: /^Filters/ }).click();

    const sheet = page.getByRole("dialog", { name: "Filters" });
    await sheet
      .getByRole("button", { name: "Havelock (Swaraj Dweep)" })
      .click();
    expect(new URL(page.url()).searchParams.get("place")).toBeNull();

    await sheet.getByRole("button", { name: "Show results" }).click();
    await expect(sheet).toBeHidden();
    await expect
      .poll(() => new URL(page.url()).searchParams.get("place"))
      .toBe("andaman/havelock");
  });

  test("is accessible", async ({ page }) => {
    await page.goto("/search");
    await page.getByRole("button", { name: /^Filters/ }).click();
    await expect(page.getByRole("dialog", { name: "Filters" })).toBeVisible();

    /*
      Wait for the entrance to finish before measuring.

      The first version of this reported four SERIOUS contrast violations at
      4.48:1 on the sheet's group labels, and passed on retry. Neither was
      real: the sheet fades in over 250ms, axe was sampling a partly
      transparent element, and the colour it read (`#5e7269`) is the label
      blended with the page behind it at about two thirds opacity. The steady
      state is `#4e645c` on cream, which measures 5.55:1 — comfortably AA, and
      pinned as a token pairing in `palette.test.ts`.

      A flaky contrast result is always this: contrast does not vary. Waiting
      for the animations is the fix, and it is the honest one — an axe run
      mid-transition measures a frame no user ever reads.
    */
    /*
      The CONTENT has to settle before the animations are waited on.

      This went flaky when the sheet gained skeletons (yuvoy-app#37 item 7):
      Where and What draw placeholders until the vocabulary lands, so the
      dialog's subtree is replaced while `getAnimations({ subtree: true })` is
      walking it, and the evaluate aborts with "The user aborted a request".
      It passed on retry, which is the tell: a run that only fails sometimes at
      a point where nothing varies is a race, not a defect.

      Waiting for a real chip is waiting for the skeletons to be gone.
    */
    await expect(
      page.getByRole("button", { name: "Havelock (Swaraj Dweep)" }),
    ).toBeVisible();

    await page
      .locator("dialog[open]")
      .evaluate((el) =>
        Promise.all(el.getAnimations({ subtree: true }).map((a) => a.finished)),
      );

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
      .analyze();
    expect(results.violations).toEqual([]);
  });
});

test.describe("results as reels", () => {
  test("tapping one plays it, in the same filtered order", async ({ page }) => {
    await page.goto("/search?q=dive");

    const grid = page.getByRole("list", { name: "Search results" });
    await expect(grid.getByRole("link").first()).toBeVisible();
    const count = await grid.getByRole("link").count();

    await grid.getByRole("link").first().click();
    await page.waitForURL(/\/search\/r\//);

    /*
      The sequence is the feature. Every reel in the strip is one the grid
      matched, and there are as many — if the filters had not travelled the
      strip would have fallen back to the unfiltered feed and this count would
      be the whole catalogue.
    */
    await expect(page.locator("article")).toHaveCount(count);
    for (const label of await page
      .locator("article")
      .evaluateAll((els) => els.map((e) => e.getAttribute("aria-label")))) {
      expect(label).toMatch(/dive/i);
    }
  });

  test("back returns to the same grid, filters intact", async ({ page }) => {
    await page.goto("/search?q=dive");
    const grid = page.getByRole("list", { name: "Search results" });
    await grid.getByRole("link").first().click();
    await page.waitForURL(/\/search\/r\//);

    await page
      .getByRole("link", { name: /^Back to/ })
      .first()
      .click();
    await page.waitForURL(/\/search\?/);
    expect(new URL(page.url()).searchParams.get("q")).toBe("dive");
    await expect(
      page
        .getByRole("list", { name: "Search results" })
        .getByRole("link")
        .first(),
    ).toBeVisible();
  });

  test("the browser's own back does the same thing", async ({ page }) => {
    /*
      The whole reason the filters are in the address rather than in component
      state. A traveller uses the phone's back gesture, not our control.
    */
    await page.goto("/search?q=dive");
    await page
      .getByRole("list", { name: "Search results" })
      .getByRole("link")
      .first()
      .click();
    await page.waitForURL(/\/search\/r\//);

    await page.goBack();
    await page.waitForURL(/\/search\?/);
    await expect(
      page
        .getByRole("list", { name: "Search results" })
        .getByRole("link")
        .first(),
    ).toBeVisible();
  });

  test("a reel is never offered to a crawler", async ({ page }) => {
    await page.goto("/search/r/med_dive?q=dive");
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
      "content",
      /noindex/,
    );
  });
});

/**
 * The owner's second look, 14 September (yuvoy-app#37).
 *
 * The pop-up and the grid shipped, and the verdict was "very bad filters": the
 * sheet was 14 day chips, 12 categories and all 35 activity types visible at
 * once, and nothing on the screen said what was applied. Both halves are only
 * provable here for the parts that need a real browser: a calendar a traveller
 * can actually reach a date in, and pills that survive a page load.
 */
test.describe("what is applied is on the screen", () => {
  const row = (page: import("@playwright/test").Page) =>
    page.getByRole("group", { name: "Filters applied" });

  test("is not there when nothing is applied", async ({ page }) => {
    await page.goto("/search");
    await expect(
      page.getByRole("list", { name: "Search results" }),
    ).toBeVisible();
    await expect(row(page)).toHaveCount(0);
  });

  test("survives a page load, in the server's own words", async ({ page }) => {
    /*
      The scenario the owner hit: a filtered address, an empty-looking grid, and
      no way to know why. The pills have to come from the URL rather than from
      something a tap left in memory.
    */
    await page.goto("/search?place=andaman%2Fhavelock&kind=adventure");
    await expect(row(page).getByText("Havelock (Swaraj Dweep)")).toBeVisible();
    await expect(row(page).getByText("Adventure")).toBeVisible();
    // The key is never on screen.
    await expect(row(page)).not.toContainText("andaman/havelock");
  });

  test("takes one filter off with no sheet, and reloads the grid", async ({
    page,
  }) => {
    await page.goto("/search?place=andaman%2Fhavelock&kind=adventure");
    await expect(row(page).getByText("Adventure")).toBeVisible();

    await row(page).getByRole("button", { name: "Remove Adventure" }).click();

    await expect
      .poll(() => new URL(page.url()).searchParams.get("kind"))
      .toBeNull();
    expect(new URL(page.url()).searchParams.get("place")).toBe(
      "andaman/havelock",
    );
    // No pop-up was involved.
    await expect(page.getByRole("dialog", { name: "Filters" })).toHaveCount(0);
  });

  test("the x is a 44px target, not a glyph", async ({ page }) => {
    // A filter nobody can take off on a moving bus is a filter that is stuck.
    await page.goto("/search?kind=adventure");
    const remove = row(page).getByRole("button", { name: "Remove Adventure" });
    await expect(remove).toBeVisible();
    const box = await remove.boundingBox();
    expect(box!.width).toBeGreaterThanOrEqual(44);
    expect(box!.height).toBeGreaterThanOrEqual(44);
  });

  test("Clear all appears from two filters and keeps the word", async ({
    page,
  }) => {
    await page.goto("/search?kind=adventure");
    await expect(
      row(page).getByRole("button", { name: "Clear all" }),
    ).toHaveCount(0);

    await page.goto("/search?q=diving&kind=adventure&place=andaman%2Fhavelock");
    await row(page).getByRole("button", { name: "Clear all" }).click();

    await expect
      .poll(() => new URL(page.url()).searchParams.get("kind"))
      .toBeNull();
    expect(new URL(page.url()).searchParams.get("q")).toBe("diving");
  });
});

test.describe("the When section", () => {
  test("is four chips and a calendar, not a fortnight of chips", async ({
    page,
  }) => {
    await page.goto("/search");
    await page.getByRole("button", { name: /^Filters/ }).click();
    const sheet = page.getByRole("dialog", { name: "Filters" });

    const when = sheet.getByRole("group", { name: "When" });
    await expect(when.getByRole("button")).toHaveCount(4);

    await when.getByRole("button", { name: "Pick a date" }).click();
    await expect(
      sheet.getByRole("button", { name: "Next month" }),
    ).toBeVisible();
  });

  test("a date chosen in the calendar reaches the address", async ({
    page,
  }) => {
    /*
      The whole reason the calendar exists: fourteen chips could never reach
      past a fortnight, however many were added.
    */
    await page.goto("/search");
    await page.getByRole("button", { name: /^Filters/ }).click();
    const sheet = page.getByRole("dialog", { name: "Filters" });

    await sheet.getByRole("button", { name: "Pick a date" }).click();
    await sheet.getByRole("button", { name: "Next month" }).click();

    // The first day of the next month that is not outside the window.
    const cell = sheet.locator("button:not([disabled])", { hasText: /^\d+$/ });
    await expect(cell.first()).toBeVisible();
    await cell.first().click();

    await sheet.getByRole("button", { name: "Show results" }).click();
    await expect
      .poll(() => new URL(page.url()).searchParams.get("on"))
      .toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  test("keeps working when the vocabulary will not load", async ({ page }) => {
    /*
      When is calendar arithmetic, not server data. A whole-sheet error state
      would take away the part that still works (item 7).
    */
    /*
      The app's own scenario switch, not `page.route`. MSW answers from a
      service worker, so a Playwright route never sees a request the mock
      handles and the interception silently does nothing: the first draft of
      this test failed for that reason and looked like a broken error state.

      `server-error` would not do either, since it fails every read and the
      screen goes to its own error panel before the sheet can open.
    */
    await page.goto("/search?__scenario=vocabulary-unavailable");
    await page.getByRole("button", { name: /^Filters/ }).click();
    const sheet = page.getByRole("dialog", { name: "Filters" });

    await expect(
      sheet.getByText("Places and activities did not load."),
    ).toBeVisible();
    await expect(
      sheet.getByRole("button", { name: "Try again" }),
    ).toBeVisible();
    await expect(sheet.getByRole("button", { name: "Today" })).toBeVisible();
  });
});

test.describe("the Activity section", () => {
  test("is absent until a category is chosen, then only that category's", async ({
    page,
  }) => {
    await page.goto("/search");
    await page.getByRole("button", { name: /^Filters/ }).click();
    const sheet = page.getByRole("dialog", { name: "Filters" });

    await expect(
      sheet.getByRole("button", { name: "Adventure" }),
    ).toBeVisible();
    await expect(sheet.getByRole("group", { name: "Activity" })).toHaveCount(0);

    await sheet.getByRole("button", { name: "Adventure" }).click();
    await expect(sheet.getByRole("group", { name: "Activity" })).toBeVisible();
    await expect(
      sheet.getByRole("button", { name: "Scuba diving" }),
    ).toBeVisible();
    await expect(sheet.getByRole("button", { name: "Tasting" })).toHaveCount(0);
  });
});

test.describe("the default state", () => {
  test("is the unfiltered grid, not a prompt", async ({ page }) => {
    // Owner decision, 14 September (item 9).
    await page.goto("/search");
    await expect(
      page.getByRole("list", { name: "Search results" }),
    ).toBeVisible();
    await expect(page.getByText(/Pick a day or a place/)).toHaveCount(0);
    await expect(
      page.getByRole("link", { name: "Browse the feed" }),
    ).toHaveCount(0);
  });
});
