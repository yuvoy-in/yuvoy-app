import { test, expect } from "@playwright/test";

/**
 * The money loop, end to end.
 *
 * This is the journey that must not break: find a departure, hold seats, and
 * land on a booking page that tells the truth. Everything else in the product
 * can degrade; this cannot.
 */

test("a traveller can go from the feed to a held booking", async ({ page }) => {
  await page.goto("/");

  // The feed shows a real price rather than a placeholder.
  await expect(page.getByText("Try-dive at Nemo Reef").first()).toBeVisible();

  await page.goto("/e/mangrove-kayak-at-dawn");

  // No contracted price on this one — it must SAY so, never render ₹0.
  await expect(
    page.getByText(/No price set yet|Price on request/),
  ).toBeVisible();
  await expect(page.getByText("₹0")).toHaveCount(0);

  // Pick the first open departure.
  await page
    .getByRole("button", { name: /seats left|Available/ })
    .first()
    .click();
  await page.getByRole("link", { name: /Continue|Ask the operator/ }).click();

  await expect(page).toHaveURL(/\/book\?slot=/);

  await page.getByLabel("Your name").fill("Asha Menon");
  await page.getByLabel("WhatsApp number").fill("+919000000000");
  await page.getByRole("checkbox", { name: /called off/i }).check();
  await page.getByRole("button", { name: /Hold these seats/i }).click();

  // Landed on the booking, with the token in the FRAGMENT.
  await expect(page).toHaveURL(/\/booking#t=/);
  await expect(page.getByText("Your seats are held")).toBeVisible();
  await expect(page.getByRole("timer")).toBeVisible();
});

test("a closed departure is shown disabled, never hidden", async ({ page }) => {
  await page.goto("/e/try-dive-nemo-reef");
  await page.waitForLoadState("networkidle");

  // Hiding it makes the traveller think the day does not exist.
  const closed = page.getByText("Booking for this departure has closed.");
  await expect(closed).toBeVisible();
});

test("a paused kill switch reads as deliberate, not as a crash", async ({
  page,
}) => {
  await page.goto("/?__scenario=booking-disabled");
  await page.waitForLoadState("networkidle");

  await expect(page.getByText("Booking is paused")).toBeVisible();
  // No retry: retrying just asks a human's decision again.
  await expect(page.getByRole("button", { name: "Try again" })).toHaveCount(0);
});

test("the health check blocks a dive booking until it is answered", async ({
  page,
}) => {
  await page.goto("/e/try-dive-nemo-reef");
  await page.waitForLoadState("networkidle");

  await page
    .getByRole("button", { name: /seats left|Available/ })
    .first()
    .click();
  await page.getByRole("link", { name: /Continue/ }).click();

  await page.getByLabel("Your name").fill("Asha Menon");
  await page.getByLabel("WhatsApp number").fill("+919000000000");
  await page.getByRole("checkbox", { name: /called off/i }).check();

  // Omitted is not false — the form must not let this through.
  await expect(
    page.getByRole("button", { name: /Hold these seats/i }),
  ).toBeDisabled();
  await expect(page.getByText(/health check/i)).toBeVisible();
});
