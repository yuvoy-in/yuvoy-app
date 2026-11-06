import { test, expect } from "@playwright/test";
import { chooseDeparture } from "./support/checkout";

/**
 * The money loop, end to end: the conversation with the business that a
 * booking opens.
 *
 * Every name matcher here is a case-insensitive regex on purpose, as in
 * `money-loop.spec.ts`: the `label` utility paints labels in upper case, and
 * Playwright reads the accessible name from the rendered text.
 *
 * Its own file because `money-loop.spec.ts` is over 500 lines. Like that
 * file, these tests book, so they are never pointed at production.
 */

test("the conversation refuses a phone number and takes a date", async ({
  page,
}) => {
  /*
    THE CONVERSATION WITH THE BUSINESS: yuvoy-app#47.

    Two of the issue's own checks, and they are the pair that matters: the
    contact-detail rule has to bite, and it has to bite ONLY on contact
    details. "see you on 14.09.2026" is seven digits written close together and
    must still send, because a rule that swallowed dates would make the feature
    useless on the one subject travellers write about.

    Nothing here re-implements that rule. The server owns it, the app renders
    the sentence it answers with, and this walks both sides.
  */
  /*
    A hold is not a booking, so there is nobody to write to yet, and that is
    a state with a sentence, not an error. The unpriced kayak is the hold that
    stays a hold: checkout books in one tap since 3 Oct 2026, and a listing
    with no contracted price is the one the API will not take money for.
  */
  await page.goto("/e/mangrove-kayak-at-dawn");
  await page.waitForLoadState("networkidle");

  await chooseDeparture(page);
  await page.getByLabel(/Your name/i).fill("Asha Menon");
  await page.getByLabel(/WhatsApp number/i).fill("+919000000000");
  await page.getByRole("checkbox", { name: /called off/i }).check();
  await page.getByRole("button", { name: /^Book now/i }).click();
  await expect(page).toHaveURL(/\/booking#t=/);
  await expect(
    page.getByText(/Messages open once the booking is made/),
  ).toBeVisible();
  await expect(page.getByLabel("Write to the operator")).toHaveCount(0);

  // A booking is what opens the conversation: one tap on a priced listing.
  await page.goto("/e/private-boat-charter");
  await page.waitForLoadState("networkidle");
  await chooseDeparture(page);
  await page.getByLabel(/Your name/i).fill("Asha Menon");
  await page.getByLabel(/WhatsApp number/i).fill("+919000000000");
  await page.getByRole("checkbox", { name: /called off/i }).check();
  await page.getByRole("button", { name: /^Book now/i }).click();
  await expect(page).toHaveURL(/\/booking#t=/);
  await expect(page.getByText("You are going")).toBeVisible();

  const box = page.getByLabel("Write to the operator");
  await expect(box).toBeVisible();

  // A phone number is refused, and nothing lands in the thread.
  await box.fill("call me on 98765 43210");
  /*
    `exact` because Playwright matches an accessible name as a SUBSTRING by
    default, and the booking page grew a "Send us a message" button under
    "Need help?" (yuvoy-app#38 item 4). Without it this resolves to two
    elements and fails strict mode, which is the test being imprecise rather
    than the page being wrong: the two buttons are distinct and correctly
    named.
  */
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(
    page.getByText(/looks like it has a phone number/),
  ).toBeVisible();
  // Nothing was stored, so nothing appears in the thread ...
  await expect(
    page.getByRole("listitem").filter({ hasText: "call me on 98765 43210" }),
  ).toHaveCount(0);
  // ... and the draft is KEPT, so the fix is an edit rather than a retype.
  await expect(box).toHaveValue("call me on 98765 43210");

  // A date written like a date is not a phone number.
  await box.fill("see you on 14.09.2026");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(
    page.getByRole("listitem").filter({ hasText: "see you on 14.09.2026" }),
  ).toBeVisible();
  // And the refusal is gone with it.
  await expect(page.getByText(/looks like it has a phone number/)).toHaveCount(
    0,
  );
});

test("a message whose text was removed reads as removed, never as blank", async ({
  page,
}) => {
  /*
    "The message stays, with `textRemovedAt` in place of `text`. Show it as a
    message whose text was removed, never as an empty one." A blank bubble
    reads as something the app lost.
  */
  await page.setExtraHTTPHeaders({ "x-yuvoy-scenario": "text-removed" });

  await page.goto("/e/mangrove-kayak-at-dawn");
  await page.waitForLoadState("networkidle");
  await chooseDeparture(page);
  await page.getByLabel(/Your name/i).fill("Asha Menon");
  await page.getByLabel(/WhatsApp number/i).fill("+919000000000");
  await page.getByRole("checkbox", { name: /called off/i }).check();
  await page.getByRole("button", { name: /^Book now/i }).click();
  await expect(page).toHaveURL(/\/booking#t=/);

  await expect(
    page.getByText("The text of this message was removed."),
  ).toBeVisible();
  // Still a message: it keeps who wrote it.
  await expect(
    page.getByRole("listitem").filter({ hasText: "The text of this message" }),
  ).toContainText("Sample Dive Operator");
});
