import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

/**
 * Signing in with any number, and one list of trips — yuvoy-app#34.
 *
 * The owner could not sign in at all: "the right code, and 'That code did not
 * work'." Both causes were the endpoint. What only a real browser can prove is
 * the whole walk — a number that has never booked, a session that survives,
 * and the device's own trips still there afterwards.
 */

test("a number that has never booked can sign in", async ({ page }) => {
  await page.goto("/account");

  // +91 is a VALUE, not a placeholder that vanishes on the first keystroke.
  await expect(page.getByLabel("Country code")).toHaveValue("+91");
  await page.getByLabel("Your WhatsApp number").fill("9111111111");
  await page.getByRole("button", { name: "Send me a code" }).click();

  await page.getByLabel("The code we sent").fill("123456");
  await page.getByRole("button", { name: "Show me my trips" }).click();

  await expect(page.getByText("You are signed in")).toBeVisible();
});

test("the two ways out of the code step are buttons, and Change number works", async ({
  page,
}) => {
  /*
    "The owner took a while to find both." They were two underlined words
    inside a sentence of 12px grey text, and the number field was disabled once
    a code had been sent, so a wrong number had no visible way back.
  */
  await page.goto("/account");
  await page.getByLabel("Your WhatsApp number").fill("9111111111");
  await page.getByRole("button", { name: "Send me a code" }).click();
  await expect(page.getByLabel("The code we sent")).toBeVisible();

  await expect(
    page.getByRole("button", { name: "Send another code" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Change number" }).click();

  const field = page.getByLabel("Your WhatsApp number");
  await expect(field).toBeEnabled();
  await expect(field).toHaveValue("9111111111");
});

test("a wrong code says so on the code field, not in a stub", async ({
  page,
}) => {
  await page.goto("/account");
  await page.getByLabel("Your WhatsApp number").fill("9111111111");
  await page.getByRole("button", { name: "Send me a code" }).click();
  await page.getByLabel("The code we sent").fill("000000");
  await page.getByRole("button", { name: "Show me my trips" }).click();

  await expect(
    page.getByText(/It may be wrong, it may have expired/),
  ).toBeVisible();
  await expect(page.getByLabel("The code we sent")).toHaveAttribute(
    "aria-invalid",
    "true",
  );
});

test("signing in brings the other phone's trips into Trips, in one list", async ({
  page,
}) => {
  /*
    The second half of #34. There were two lists of overlapping bookings, in
    two places, with different cards: Trips read the device and the Account tab
    read the number. They are one list now, on the tab whose name says so.
  */
  await page.goto("/account");
  await page.getByLabel("Your WhatsApp number").fill("9111111111");
  await page.getByRole("button", { name: "Send me a code" }).click();
  await page.getByLabel("The code we sent").fill("123456");
  await page.getByRole("button", { name: "Show me my trips" }).click();
  await page.getByRole("link", { name: "Go to my trips" }).click();
  await page.waitForURL("**/trips");

  // Booked on another phone, and now here.
  await expect(page.getByText("YV-OTHERPH")).toBeVisible();
  /*
    And a request the operator has not answered. It arrives with an EMPTY
    reference, so the card says what is true of a request rather than styling
    an internal id as something to read out at a jetty.
  */
  await expect(page.getByText("Mangrove kayak at dawn")).toBeVisible();
  await expect(page.getByText("Waiting for the operator")).toBeVisible();
});

test("signing out leaves the trips saved on this phone alone", async ({
  page,
}) => {
  /*
    The defect that made the old sign-in unusable, from the other end: every
    successful recovery revoked the booking links already on the phone, so
    signing in to SEE your trips took away the ones you had. The new session
    revokes nothing, and signing out must not either.
  */
  await page.goto("/account");
  await page.getByLabel("Your WhatsApp number").fill("9111111111");
  await page.getByRole("button", { name: "Send me a code" }).click();
  await page.getByLabel("The code we sent").fill("123456");
  await page.getByRole("button", { name: "Show me my trips" }).click();

  await page.getByRole("button", { name: "Sign out on this device" }).click();
  await expect(page.getByText("There is no account to make")).toBeVisible();

  await page.goto("/trips");
  // Signed out, so the number's trips are gone and the prompt is back.
  await expect(page.getByText("YV-OTHERPH")).toHaveCount(0);
  await expect(
    page.getByRole("link", { name: /Sign in with my number/ }),
  ).toBeVisible();
});

test("the sign-in is accessible", async ({ page }) => {
  await page.goto("/account");
  await expect(page.getByLabel("Your WhatsApp number")).toBeVisible();

  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(results.violations).toEqual([]);
});
