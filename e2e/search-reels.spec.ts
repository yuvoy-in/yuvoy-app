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
    await expect(page.getByRole("group", { name: "Which day" })).toHaveCount(0);
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
    await expect(sheet).toContainText("Which day");
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

  test("applies to the address, and only on Apply", async ({ page }) => {
    await page.goto("/search");
    await page.getByRole("button", { name: /^Filters/ }).click();

    const sheet = page.getByRole("dialog", { name: "Filters" });
    await sheet
      .getByRole("button", { name: "Havelock (Swaraj Dweep)" })
      .click();
    expect(new URL(page.url()).searchParams.get("place")).toBeNull();

    await sheet.getByRole("button", { name: "Apply" }).click();
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
