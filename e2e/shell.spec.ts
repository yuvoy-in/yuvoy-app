import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

/**
 * The shell, and accessibility on every route.
 *
 * axe runs per route rather than once on the homepage, because the rules that
 * matter here — contrast on the media ground, the tab bar's targets, form
 * labelling — only exist on the screens that have them.
 */

const ROUTES = [
  "/",
  "/search",
  "/trips",
  "/trips/recover",
  "/account",
  "/e/try-dive-nemo-reef",
  "/booking",
  "/offline",
];

for (const route of ROUTES) {
  test(`${route} has no accessibility violations`, async ({ page }) => {
    await page.goto(route);
    // Let the first query settle so the state under test is the real one.
    await page.waitForLoadState("networkidle");

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
      .analyze();

    expect(results.violations).toEqual([]);
  });
}

test("the tab bar names exactly four destinations", async ({ page }) => {
  await page.goto("/");
  // A fifth is a design change, not a routing one. Pinned so it cannot arrive
  // by accident.
  const nav = page.getByRole("navigation", { name: /Primary/i }).first();
  await expect(nav.getByRole("link")).toHaveCount(4);
});

test("the page never scrolls sideways", async ({ page }) => {
  for (const route of ["/", "/search", "/e/try-dive-nemo-reef"]) {
    await page.goto(route);
    await page.waitForLoadState("networkidle");
    const overflow = await page.evaluate(
      () =>
        document.documentElement.scrollWidth >
        document.documentElement.clientWidth,
    );
    expect(overflow, `${route} scrolls horizontally`).toBe(false);
  }
});

test("a focused screen hides the tab bar and offers a way back", async ({
  page,
  isMobile,
}) => {
  await page.goto("/e/try-dive-nemo-reef");
  await page.waitForLoadState("networkidle");

  // The way back is a link with a stated destination, never history.
  await expect(page.getByRole("link", { name: /^Back to/ })).toBeVisible();

  const primary = page.getByRole("navigation", { name: /Primary/i });
  if (isMobile) {
    // The floating bar is gone; the screen carries its own foot.
    await expect(primary).toHaveCount(0);
  } else {
    // The rail stays on every route.
    await expect(primary.getByRole("link")).toHaveCount(4);
  }
});

test("a tab root keeps the floating bar and names where you are", async ({
  page,
}) => {
  await page.goto("/search");
  await page.waitForLoadState("networkidle");
  const nav = page.getByRole("navigation", { name: /Primary/i }).first();
  await expect(nav.locator('a[aria-current="page"]')).toHaveText(/Search/i);
});
