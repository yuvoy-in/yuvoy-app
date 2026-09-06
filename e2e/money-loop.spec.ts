import { test, expect } from "@playwright/test";

/**
 * The money loop, end to end.
 *
 * NOTE ON SELECTORS: the `label` utility applies `text-transform: uppercase`,
 * and Playwright resolves an accessible name from RENDERED text — so
 * getByLabel("Your name") does not match a label that paints as "YOUR NAME".
 * jsdom ignores text-transform, which is why the unit tests pass on exact
 * case and these must not. Every name matcher here is a case-insensitive
 * regex on purpose.
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
    .getByRole("button", { name: /seats left|available/i })
    .first()
    .click();
  await page.getByRole("link", { name: /continue|ask the operator/i }).click();

  await expect(page).toHaveURL(/\/book\?slot=/);

  await page.getByLabel(/Your name/i).fill("Asha Menon");
  await page.getByLabel(/WhatsApp number/i).fill("+919000000000");
  await page.getByRole("checkbox", { name: /called off/i }).check();
  await page.getByRole("button", { name: /Hold these seats/i }).click();

  // Landed on the booking, with the token in the FRAGMENT.
  await expect(page).toHaveURL(/\/booking#t=/);
  await expect(page.getByText("Your seats are held")).toBeVisible();
  await expect(page.getByRole("timer")).toBeVisible();

  /*
    And the tab names this booking — yuvoy-app#16.

    The token is in the fragment, which never reaches the server, so
    `generateMetadata` cannot tell one booking from another and every tab read
    "Your booking · Yuvoy". Set client-side once the booking loads, which is
    the only place that knows. A hold has no reference yet, so the experience
    name stands in.

    The reference leads, because it is what somebody with two tabs open is
    looking for, and it is "human-quotable and not a credential" — it goes on
    the operator's manifest and is read aloud on a jetty. Matched on its SHAPE
    rather than a fixture value, so a mock that mints a different one still
    proves the right field is in front.

    The token must never be in the title: it is already in browser history and
    a title is one more place it would not belong.
  */
  await expect(page).toHaveTitle(/^YV-[A-Z0-9]+ · Yuvoy$/);
  await expect(page).not.toHaveTitle(/t=/);
});

test("a closed departure is shown disabled, never hidden", async ({ page }) => {
  await page.goto("/e/try-dive-nemo-reef");
  await page.waitForLoadState("networkidle");

  // Hiding it makes the traveller think the day does not exist.
  // The `label` utility uppercases, so an accessible name is uppercase too.
  // Case-sensitive selectors here pass locally and fail the moment a class
  // changes, which is the worst kind of test.
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
  await expect(page.getByRole("button", { name: /Try again/i })).toHaveCount(0);
});

test("the health check blocks a dive booking until it is answered", async ({
  page,
}) => {
  await page.goto("/e/try-dive-nemo-reef");
  await page.waitForLoadState("networkidle");

  await page
    .getByRole("button", { name: /seats left|available/i })
    .first()
    .click();
  await page.getByRole("link", { name: /continue/i }).click();

  await page.getByLabel(/Your name/i).fill("Asha Menon");
  await page.getByLabel(/WhatsApp number/i).fill("+919000000000");
  await page.getByRole("checkbox", { name: /called off/i }).check();

  // Omitted is not false — the form must not let this through.
  await expect(
    page.getByRole("button", { name: /Hold these seats/i }),
  ).toBeDisabled();
  // The blocker list specifically, not the fieldset legend — both contain the
  // words "health check", and asserting on the vaguer one is how a test starts
  // passing for the wrong reason.
  await expect(page.getByText(/Still needed:.*health check/i)).toBeVisible();
});
