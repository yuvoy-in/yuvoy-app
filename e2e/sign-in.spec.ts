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

  await expect(
    page.getByRole("button", { name: "Sign out on this device" }),
  ).toBeVisible();
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
  /*
    Scoped to THAT card, not to the page. The mock's booking list is server
    state shared by every spec in a run, and any test that lodges a request
    puts a second "Waiting for the operator" on this screen — which is a
    strict-mode violation rather than a failed assertion, so it reads as this
    test breaking when nothing it covers has changed.

    Asserting the pair together is also closer to what this test means: the
    claim is that the waiting request shows as waiting, not that the words
    appear somewhere on the page.
  */
  const waitingRequest = page
    .getByRole("link")
    .filter({ hasText: "Mangrove kayak at dawn" });
  await expect(waitingRequest).toBeVisible();
  await expect(
    waitingRequest.getByText("Waiting for the operator"),
  ).toBeVisible();
});

test("signing out clears this phone, and Trips says so", async ({ page }) => {
  /*
    THIS TEST USED TO ASSERT THE OPPOSITE, and the inversion is the point.

    It was called "signing out leaves the trips saved on this phone alone",
    which was correct while Trips read a list out of this device's IndexedDB
    and a guest's only copy of a booking lived there. The owner reported the
    consequence on 14 September: after signing out, bookings still showed in
    Trips (yuvoy-app#60 item 2).

    So the behaviour is reversed rather than the test deleted. Signing out now
    clears every booking this phone has saved, because a status token is a
    bearer credential that both opens a booking and can cancel it, and Trips
    shows the sign-in prompt rather than a list.

    The property the OLD test was protecting is unchanged and still asserted
    elsewhere: signing in revokes nothing. That was the defect that made the
    old recovery-based sign-in unusable, and it is a different claim from what
    signing out does.
  */
  await page.goto("/account");
  await page.getByLabel("Your WhatsApp number").fill("9111111111");
  await page.getByRole("button", { name: "Send me a code" }).click();
  await page.getByLabel("The code we sent").fill("123456");
  await page.getByRole("button", { name: "Show me my trips" }).click();
  /*
    Wait for the signed-in screen before navigating. Submitting the code
    triggers a navigation of its own, and a `goto` fired into the middle of it
    cancels the one in flight: the first version of this test was flaky for
    exactly that reason, not for anything it was asserting.
  */
  await expect(
    page.getByRole("button", { name: "Sign out on this device" }),
  ).toBeVisible();

  // Signed in, the number's trips are there.
  await page.getByRole("link", { name: "Go to my trips" }).click();
  await page.waitForURL("**/trips");
  await expect(page.getByText("YV-OTHERPH")).toBeVisible();

  await page.goto("/account");
  await page.getByRole("button", { name: "Sign out on this device" }).click();
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();

  await page.goto("/trips");
  await expect(page.getByText("Sign in to see your trips")).toBeVisible();
  await expect(page.getByText("YV-OTHERPH")).toHaveCount(0);
  /*
    And a reload, because the store is the durable copy: a cleared cache over a
    full store comes straight back, which is precisely the state the owner saw.
  */
  await page.reload();
  await expect(page.getByText("Sign in to see your trips")).toBeVisible();
  await expect(page.getByText("YV-OTHERPH")).toHaveCount(0);
});

test("the sign-in is accessible", async ({ page }) => {
  await page.goto("/account");
  await expect(page.getByLabel("Your WhatsApp number")).toBeVisible();

  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(results.violations).toEqual([]);
});
