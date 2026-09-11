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
  // A business's own page (yuvoy-app#30), with every section it can draw.
  "/o/sample-boat-operator",
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

/**
 * The rail is pinned, and it is the height of the WINDOW.
 *
 * Both halves are load-bearing, and both were broken. As an ordinary flex item
 * the rail scrolled away, so a guide article left the reader with no
 * navigation after the first screenful; and a flex item stretches to its row,
 * so the rail was as tall as the document (2835px on that article) and the
 * `mt-auto` that puts Guides at its foot put them two thousand pixels below
 * the fold. Neither is visible in a screenshot of the top of the page, which
 * is why this measures instead.
 *
 * Desktop only: below `lg` there is no rail, and the floating bar is fixed.
 */
test("the rail stays put while the page scrolls, and Guides stays in view", async ({
  page,
  isMobile,
}) => {
  test.skip(Boolean(isMobile), "no rail below lg");

  // A route tall enough to scroll several screenfuls.
  await page.goto("/guides/permits-for-the-andamans");
  await page.waitForLoadState("networkidle");

  const rail = page.locator("aside");
  const guides = page.getByRole("navigation", { name: /More/i });

  const viewport = page.viewportSize();
  if (!viewport) throw new Error("no viewport");

  const railBefore = await rail.boundingBox();
  if (!railBefore) throw new Error("no rail");

  // The rail is the window's height, not the document's.
  expect(
    railBefore.height,
    "the rail is as tall as the window, not the document",
  ).toBeLessThanOrEqual(viewport.height + 1);

  // So Guides, pinned to its foot, is on screen before anybody scrolls.
  await expect(guides).toBeInViewport();

  await page.mouse.wheel(0, 900);
  await page.waitForTimeout(250);

  expect(
    await page.evaluate(() => window.scrollY),
    "the page scrolled",
  ).toBeGreaterThan(500);

  const railAfter = await rail.boundingBox();
  if (!railAfter) throw new Error("no rail after scrolling");
  expect(
    Math.abs(railAfter.y - railBefore.y),
    "the rail did not move with the page",
  ).toBeLessThan(2);

  // And it is still a usable navigation once you are down the page.
  await expect(guides).toBeInViewport();
  await expect(
    page.getByRole("navigation", { name: /Primary/i }).getByRole("link"),
  ).toHaveCount(4);
});
