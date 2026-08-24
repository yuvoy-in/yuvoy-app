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
  const nav = page.getByRole("navigation", { name: "Primary" }).first();
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
