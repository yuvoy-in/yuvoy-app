import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

/**
 * The email door and the year step (yuvoy-app#229, web half of
 * yuvoy-mobile#340), walked in a real browser.
 *
 * With no scenario the door's switch is off, as on dev and production today.
 * `email-sign-in` opens it; `email-sign-in-closed` opens it on the config and
 * shuts it on the send. An address starting with "new" is a person no account
 * holds yet, so the mock asks the year (`mocks/booking-handlers.ts`).
 */

const CODE = "123456";

async function sendCode(
  page: Page,
  address: string,
  scenario = "email-sign-in",
) {
  await page.goto(`/account?__scenario=${scenario}`);
  await page.getByRole("button", { name: "Continue with email" }).click();
  await page.getByLabel("Your email").fill(address);
  await page.getByRole("button", { name: "Send me a code" }).click();
}

async function enterCode(page: Page) {
  await page.getByLabel("Sign-in code").fill(CODE);
  await page.getByRole("button", { name: "Show me my trips" }).click();
}

test("with the switch off, only the number is asked for", async ({ page }) => {
  await page.goto("/account");
  await expect(page.getByLabel("Your WhatsApp number")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Continue with email" }),
  ).toHaveCount(0);
});

test("a returning address signs in with a code and no year", async ({
  page,
}) => {
  await sendCode(page, "asha@example.com");

  await expect(
    page.getByRole("heading", { name: "Check your email" }),
  ).toBeVisible();
  await expect(
    page.locator("strong", { hasText: "asha@example.com" }),
  ).toBeVisible();

  await enterCode(page);
  await expect(
    page.getByRole("button", { name: "Sign out on this device" }),
  ).toBeVisible();
});

test("a new address is asked the year, then signed in with the same code", async ({
  page,
}) => {
  await sendCode(page, "new.asha@example.com");
  await enterCode(page);

  await expect(
    page.getByRole("heading", { name: "One more thing" }),
  ).toBeVisible();
  await page.getByLabel("What year were you born?").fill("1995");
  await page.getByRole("button", { name: "Continue" }).click();

  await expect(
    page.getByRole("button", { name: "Sign out on this device" }),
  ).toBeVisible();
});

test("under 18 ends on the under step, with a way to look around", async ({
  page,
}) => {
  await sendCode(page, "new.ravi@example.com");
  await enterCode(page);
  await page.getByLabel("What year were you born?").fill("2015");
  await page.getByRole("button", { name: "Continue" }).click();

  const said = page.getByRole("alert").filter({
    hasText: "Yuvoy accounts are for people 18 and over.",
  });
  await expect(said).toBeVisible();
  await expect(said).toBeFocused();
  await expect(page.getByRole("link", { name: "Look around" })).toHaveAttribute(
    "href",
    "/",
  );
  await expect(page.getByLabel("Sign-in code")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Sign out on this device" }),
  ).toHaveCount(0);
});

test("a shut door offers the number, and the number still works", async ({
  page,
}) => {
  await sendCode(page, "asha@example.com", "email-sign-in-closed");

  await expect(
    page.getByText("Signing in with email is closed right now"),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Use my number instead" })
    .first()
    .click();
  await expect(page.getByLabel("Your WhatsApp number")).toBeVisible();
});

test("an incomplete address is said on its field, before anything is sent", async ({
  page,
}) => {
  let sent = 0;
  page.on("request", (request) => {
    if (request.url().includes("/me/sign-in/request")) sent += 1;
  });
  await sendCode(page, "asha@");

  await expect(
    page.getByText(
      "That email looks incomplete. It should look like name@example.com.",
    ),
  ).toBeVisible();
  await expect(page.getByLabel("Your email")).toHaveAttribute(
    "aria-invalid",
    "true",
  );
  expect(sent).toBe(0);
});

test("the doors and the year step have no axe violations", async ({ page }) => {
  await page.goto("/account?__scenario=email-sign-in");
  await expect(
    page.getByRole("button", { name: "Continue with email" }),
  ).toBeVisible();
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
        .analyze()
    ).violations,
  ).toEqual([]);

  await page.getByRole("button", { name: "Continue with email" }).click();
  await page.getByLabel("Your email").fill("new.mira@example.com");
  await page.getByRole("button", { name: "Send me a code" }).click();
  await enterCode(page);
  await expect(page.getByLabel("What year were you born?")).toBeVisible();
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
});
