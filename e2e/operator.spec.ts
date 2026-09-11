import { test, expect } from "@playwright/test";

/**
 * reel → listing → operator — yuvoy-app#30.
 *
 * The operator page shipped a day before `OperatorSummary.slug` did, so it was
 * reachable by URL and from nowhere a traveller actually was. These walk both
 * ways in, and what the page says about a business that has written something
 * and about one that has not (yuvoy-operator#41).
 */

test("a reel's operator name opens the business's own page", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("article")
    .first()
    .getByRole("link", { name: "Sample Dive Operator" })
    .click();
  await page.waitForURL("**/o/sample-dive-operator");
  await expect(
    page.getByRole("heading", { level: 1, name: /Sample Dive Operator/ }),
  ).toBeVisible();
});

test("Who runs this, on a listing, opens the business's page too", async ({
  page,
}) => {
  await page.goto("/e/snorkel-elephant-beach");
  await page.getByRole("link", { name: "Sample Boat Operator" }).click();
  await page.waitForURL("**/o/sample-boat-operator");
  await expect(
    page.getByRole("heading", { level: 1, name: /Sample Boat Operator/ }),
  ).toBeVisible();
});

test("the page carries what a business wrote, and nothing for what it did not", async ({
  page,
}) => {
  await page.goto("/o/sample-boat-operator");
  await expect(
    page.getByRole("heading", { name: "About", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Running since 2014")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Photos", exact: true }),
  ).toBeVisible();

  // Written nothing yet: no empty headings, and no year nobody reviewed.
  await page.goto("/o/sample-new-operator");
  await expect(
    page.getByRole("heading", { level: 1, name: /Sample New Operator/ }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "About", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "Photos", exact: true }),
  ).toHaveCount(0);
  await expect(page.getByText(/Running since/)).toHaveCount(0);
});
