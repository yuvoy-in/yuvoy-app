import { test, expect, type Page } from "@playwright/test";

/**
 * Saves move onto the account, and stay there (yuvoy-api#192).
 *
 * Only a real browser can prove the whole walk: a save made signed out lives
 * in IndexedDB, signing in goes through the real `/api/session` route and its
 * HttpOnly cookie, every account call goes through the real proxy and its
 * allowlist, and signing out has to leave nothing of the account behind on a
 * shared phone. Unit tests stand in for each of those; none of them is this.
 *
 * The mock keeps saves per session in the Next server, which every spec and
 * both projects share. So each project signs in with its own number, and the
 * assertions hold on a retry that finds the save already on the account.
 */

/** A title as a pattern that matches it literally, whatever it contains. */
function literally(text: string): RegExp {
  return new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
}

function numberFor(project: string): string {
  return project === "desktop" ? "9222200002" : "9222200001";
}

async function signIn(page: Page, number: string) {
  await page.getByLabel("Your WhatsApp number").fill(number);
  await page.getByRole("button", { name: "Send me a code" }).click();
  await page.getByLabel("The code we sent").fill("123456");
  await page.getByRole("button", { name: "Show me my trips" }).click();
}

test("a save made signed out follows the traveller onto the account", async ({
  page,
}, testInfo) => {
  const number = numberFor(testInfo.project.name);

  // 1. Signed out, on the feed: the save lands in this browser.
  await page.goto("/");
  const save = page.getByRole("button", { name: /^Save / }).first();
  const label = (await save.getAttribute("aria-label")) ?? "";
  const title = label.replace(/^Save /, "");
  expect(title).not.toBe("");
  await save.click();
  await expect(
    page.getByRole("button", { name: `Saved. Remove ${title}` }).first(),
  ).toBeVisible();

  // 2. The list says it is in this browser only, and offers the fix.
  await page.goto("/saved");
  await expect(
    page.getByRole("link", { name: literally(title) }),
  ).toBeVisible();
  await expect(page.getByText(/saved in this browser only/i)).toBeVisible();

  // 3. Signing in from there comes back to the list, now the account's.
  await page.getByRole("link", { name: "Sign in" }).click();
  await page.waitForURL("**/account?next=*");
  await signIn(page, number);
  await page.waitForURL("**/saved");
  await expect(
    page.getByRole("link", { name: literally(title) }),
  ).toBeVisible();
  await expect(page.getByText(/saved in this browser only/i)).toHaveCount(0);

  // 4. Signing out leaves none of the account's list on this phone.
  await page.goto("/account");
  await page.getByRole("button", { name: "Sign out on this device" }).click();
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  await page.goto("/saved");
  await expect(page.getByText("Nothing saved yet")).toBeVisible();
  await expect(page.getByRole("link", { name: literally(title) })).toHaveCount(
    0,
  );
  // A reload too: the device store is the durable copy, and adoption took the
  // save off it rather than only hiding it.
  await page.reload();
  await expect(page.getByText("Nothing saved yet")).toBeVisible();

  // 5. And signing in again brings it back, because it lives on the account.
  await page.getByRole("link", { name: "Sign in" }).click();
  await page.waitForURL("**/account?next=*");
  await signIn(page, number);
  await page.waitForURL("**/saved");
  await expect(
    page.getByRole("link", { name: literally(title) }),
  ).toBeVisible();
});
