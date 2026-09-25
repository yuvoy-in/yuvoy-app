import { test, expect } from "@playwright/test";

/**
 * A guest reaches their booking without signing in (yuvoy-app#113).
 *
 * Checkout needs no account, so most people on Trips signed out booked as
 * guests. The screen used to open on a sign-in wall with the way to their
 * booking as a small link under it. Now finding a booking leads, and it goes
 * to recovery, which needs no account at all.
 *
 * The recovery exchange itself is unchanged and is not re-walked here: the
 * mock answers a code with whichever reservation the run happens to hold,
 * which would make this test depend on the order the suite ran in.
 */

test("signed out, Trips leads with finding a booking", async ({ page }) => {
  await page.goto("/trips");

  const find = page.getByRole("link", { name: "Find my booking" });
  const signIn = page.getByRole("link", { name: /^Sign in$/ });
  await expect(find).toBeVisible();
  await expect(signIn).toBeVisible();

  // First on the page, which is what "leads" means.
  const findTop = (await find.boundingBox())!.y;
  const signInTop = (await signIn.boundingBox())!.y;
  expect(findTop).toBeLessThan(signInTop);

  await find.click();
  await page.waitForURL("**/trips/recover");
  await expect(
    page.getByRole("heading", { level: 1, name: "Find your booking" }),
  ).toBeVisible();
  // Where the code goes, said plainly: with no WhatsApp sender, it is the
  // email given at checkout.
  await expect(
    page.getByText(/by WhatsApp, or to the email you gave when you booked/),
  ).toBeVisible();
});
