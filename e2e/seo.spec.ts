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

test("the experience page is in the HTML, not only the RSC payload", async ({
  request,
}) => {
  /*
    Regression. MswProvider used to return null until its worker was ready,
    which gated the ENTIRE tree — so every page server-rendered empty and the
    content existed only inside the RSC flight payload, which a crawler does
    not execute. The build passed, the unit tests passed, and the page looked
    perfect in a browser.

    Fetched with `request` rather than `page` on purpose: no JavaScript runs,
    which is exactly what a crawler does.
  */
  const res = await request.get("/e/try-dive-nemo-reef");
  const html = await res.text();
  const body = html.slice(html.indexOf("<body"));
  const visible = body.replace(/<script[\s\S]*?<\/script>/g, "");

  expect(visible).toContain("Try-dive at Nemo Reef");
  expect(visible).toContain("Who runs this");
  // The price is the claim most worth having in the HTML.
  expect(visible).toMatch(/₹4,500/);
});
