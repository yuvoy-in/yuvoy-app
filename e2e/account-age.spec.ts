import { test, expect, type Page, type TestInfo } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

/**
 * Confirm your age on Account (yuvoy-app#229, the web half of
 * yuvoy-mobile#340), walked in a real browser.
 *
 * `people-first` and `people-age-locked` are the mock's accounts whose
 * `GET /me` says `ageConfirmed` false (`mocks/people-state.ts`); the first
 * takes an answer over `PUT /me/age`, the second answers `409 age_locked`.
 */

/** A number of this test's own, the same on every run of it. */
function numberFor(info: TestInfo): string {
  let h = 0;
  for (const ch of `${info.project.name}|${info.testId}|${info.retry}`) {
    h = (Math.imul(h, 31) + ch.charCodeAt(0)) >>> 0;
  }
  return `9${String(h % 1e9).padStart(9, "0")}`;
}

async function signIn(page: Page, info: TestInfo) {
  await page.goto("/account");
  await page.getByLabel("Your WhatsApp number").fill(numberFor(info));
  await page.getByRole("button", { name: "Send me a code" }).click();
  await page.getByLabel("Sign-in code").fill("123456");
  await page.getByRole("button", { name: "Show me my trips" }).click();
  await expect(
    page.getByRole("button", { name: "Sign out on this device" }),
  ).toBeVisible();
}

const panel = (page: Page) =>
  page.getByRole("heading", { level: 2, name: "Confirm your age" });

async function sendYear(page: Page, year: number) {
  await page.getByLabel("What year were you born?").fill(String(year));
  await page.getByRole("button", { name: "Continue" }).click();
}

const thisYear = () =>
  Number(
    new Intl.DateTimeFormat("en-IN", {
      timeZone: "Asia/Kolkata",
      year: "numeric",
    }).format(new Date()),
  );

test("says who is signed in", async ({ page }, info) => {
  await signIn(page, info);
  await expect(page.getByText(/^Signed in as \+91/)).toBeVisible();
});

test("an adult year is kept and the panel goes", async ({ page }, info) => {
  await signIn(page, info);
  await page.goto("/account?__scenario=people-first");
  await expect(panel(page)).toBeVisible();
  await sendYear(page, 1990);

  await expect(
    page.getByRole("status").filter({ hasText: "Your age is confirmed." }),
  ).toBeVisible();
  await expect(panel(page)).toHaveCount(0);
});

test("age_locked is said in the API's words", async ({ page }, info) => {
  await signIn(page, info);
  await page.goto("/account?__scenario=people-age-locked");
  await sendYear(page, 1990);

  await expect(
    page
      .getByRole("alert")
      .filter({ hasText: "Your age can only be changed by the Yuvoy team." }),
  ).toBeVisible();
  await expect(panel(page)).toBeVisible();
});

test("under 18 closes the account and signs out", async ({ page }, info) => {
  await signIn(page, info);
  await page.goto("/account?__scenario=people-first");
  await sendYear(page, thisYear() - 12);

  await expect(
    page.getByRole("heading", {
      level: 1,
      name: "We have closed this account",
    }),
  ).toBeVisible();
  await expect(
    page
      .getByRole("alert")
      .filter({ hasText: "Yuvoy accounts are for people 18 and over" }),
  ).toBeVisible();

  // The session is gone: a fresh Account is the sign-in form.
  await page.goto("/account");
  await expect(page.getByLabel("Your WhatsApp number")).toBeVisible();
});

test("the panel has no axe violations", async ({ page }, info) => {
  await signIn(page, info);
  await page.goto("/account?__scenario=people-first");
  await expect(panel(page)).toBeVisible();
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
});
