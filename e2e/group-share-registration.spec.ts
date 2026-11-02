import { test, expect } from "@playwright/test";

/**
 * yuvoy-app#219, the web half of yuvoy-mobile#368: what a whole-group price
 * comes to each at checkout, and the operator's tourism registration on the
 * listing page. Read in a real browser, from the mock API the app runs on.
 */

const CHARTER = "/e/private-boat-charter";
const CHARTER_BOOK = `${CHARTER}/book?slot=slot_private-boat-charter_a`;

test.describe("a price for the whole group", () => {
  test("says what it comes to each for more than one guest", async ({
    page,
  }) => {
    await page.goto(`${CHARTER_BOOK}&guests=4`);
    const each = page.getByTestId("checkout-each");
    await expect(each).toHaveText("₹4,500 each for 4 of you");
    // The Total stays the price of the boat.
    await expect(page.getByText("₹18,000").first()).toBeVisible();
    await expect(page.getByText("₹72,000")).toHaveCount(0);
  });

  test("says nothing each for one guest", async ({ page }) => {
    await page.goto(`${CHARTER_BOOK}&guests=1`);
    await expect(page.getByLabel(/Your name/i)).toBeVisible();
    await expect(page.getByTestId("checkout-each")).toHaveCount(0);
  });
});

test.describe("the registration line", () => {
  test("names the registration and the last valid day", async ({ page }) => {
    await page.goto(CHARTER);
    await expect(page.getByTestId("listing-registration")).toHaveText(
      "Registered with A&N Tourism · valid to 30 Jun 2027",
    );
  });

  test("is absent when the API sends no registration", async ({ page }) => {
    await page.goto("/e/try-dive-nemo-reef");
    await expect(page.getByRole("heading", { name: "Operator" })).toBeVisible();
    await expect(page.getByTestId("listing-registration")).toHaveCount(0);
  });
});
