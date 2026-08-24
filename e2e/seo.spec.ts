import { test, expect } from "@playwright/test";

/**
 * What the app claims about itself.
 *
 * The truthfulness rules are the point: nothing is published that is not backed
 * by a record, and structured data counts as a claim even though it is
 * invisible on the page.
 */

test("the app is noindex until it takes the root domain", async ({ page }) => {
  await page.goto("/");
  const robots = page.locator('meta[name="robots"]');
  await expect(robots).toHaveAttribute("content", /noindex/);
});

test("the booking screen is never indexable", async ({ page }) => {
  await page.goto("/booking");
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
    "content",
    /noindex/,
  );
});

test("no page claims a rating or a review count", async ({ page }) => {
  await page.goto("/e/try-dive-nemo-reef");
  const html = await page.content();

  // There are no operator ratings anywhere, deliberately: a number nobody
  // earned is a fabricated claim.
  expect(html).not.toMatch(/aggregateRating|ratingValue|reviewCount/);
});

test("the experience page states the cancellation policy before payment", async ({
  page,
}) => {
  await page.goto("/e/try-dive-nemo-reef");
  await expect(page.getByText("If it is called off")).toBeVisible();
});
