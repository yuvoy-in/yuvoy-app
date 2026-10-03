import { test, expect } from "@playwright/test";

/**
 * The ways into and out of a guide (yuvoy-app#116 items 3 and 4).
 *
 * Out: a guide ended with no way to the thing it explained, so the funnel
 * only went backwards. Its foot now lists what is running that matches it,
 * by the filter Search uses, and nothing at all when nothing matches.
 *
 * In: guides were in the desktop rail only, which a phone never draws.
 * Search now offers them before anything is typed (Account's door, beside
 * Saved, is a signed-in screen and is unit-tested there).
 */

test("a guide ends with the listings it is about", async ({ page }) => {
  await page.goto("/guides/diving-in-havelock");

  const foot = page.getByRole("region", { name: "On Yuvoy" });
  await expect(foot).toBeVisible();
  // The mock's one scuba listing, found by `activityType: scuba`.
  await expect(foot.locator('a[href="/e/try-dive-nemo-reef"]')).toBeVisible();
});

test("a guide with nothing to match shows no listings heading", async ({
  page,
}) => {
  await page.goto("/guides/permits-for-the-andamans");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByRole("region", { name: "On Yuvoy" })).toHaveCount(0);
});

test("Search offers the guides before anything is typed", async ({ page }) => {
  await page.goto("/search");
  const door = page.getByRole("link", { name: "Read a guide" });
  await expect(door).toBeVisible();
  await door.click();
  await page.waitForURL("**/guides");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
});
