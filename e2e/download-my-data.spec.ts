import { readFile } from "node:fs/promises";
import { test, expect, type Page, type TestInfo } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

/**
 * Download my data (yuvoy-app#221, the web half of yuvoy-mobile#369), in a
 * real browser against the mocks.
 *
 * The unit tests hold the row's rules. What only a browser answers is that
 * the proxy lets `GET /me/export` through with the session, that the file the
 * browser saves carries the API's own name (`Content-Disposition` made it
 * across the proxy), and that each refusal reads as the API wrote it.
 *
 * The scenarios are `mocks/export-handlers.ts`'s. The words are the API's,
 * written out here, as no spec imports app code.
 */

const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

const NOTE = "One file with everything Yuvoy keeps about you. Up to 3 a day.";
const LIMIT = "You've downloaded your data 3 times today. Try again tomorrow.";
const DOWN = "We couldn't make your file. Try again in a minute.";
const SIGNED_OUT = "Sign in to download your data.";

/** A number of this test's own, the same on every run of it. */
function numberFor(info: TestInfo): string {
  let h = 0;
  for (const ch of `${info.project.name}|${info.testId}|${info.retry}`) {
    h = (Math.imul(h, 31) + ch.charCodeAt(0)) >>> 0;
  }
  return `9${String(h % 1e9).padStart(9, "0")}`;
}

/** Signs in on Account, as `session-cookie.spec.ts` does. */
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

/** Account, signed in already, under a scenario. */
async function openAccount(page: Page, scenario?: string) {
  await page.goto(scenario ? `/account?__scenario=${scenario}` : "/account");
  await expect(download(page)).toBeVisible();
}

/**
 * The row's own alert. Next keeps an empty `role="alert"` of its own on every
 * page (the route announcer), so the bare role would find two.
 */
const said = (page: Page) =>
  page.locator('[role="alert"]:not(#__next-route-announcer__)');

const download = (page: Page) =>
  page.getByRole("button", { name: "Download my data" });

/** The same check `redesign-axe.spec.ts` runs, once entrances finish. */
async function expectAccessible(page: Page) {
  await page.evaluate(() =>
    Promise.allSettled(
      document
        .getAnimations()
        .filter(
          (a) =>
            a.timeline === document.timeline &&
            a.effect?.getTiming().iterations !== Infinity,
        )
        .map((a) => a.finished),
    ),
  );
  const results = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  expect(results.violations).toEqual([]);
}

test("the browser saves the file under the API's name, with what the API sent", async ({
  page,
}, info) => {
  await signIn(page, info);
  await openAccount(page);
  await expect(download(page)).toHaveAccessibleDescription(NOTE);

  const [file] = await Promise.all([
    page.waitForEvent("download"),
    download(page).click(),
  ]);

  expect(file.suggestedFilename()).toMatch(
    /^yuvoy-my-data-\d{4}-\d{2}-\d{2}\.json$/,
  );
  const saved = await readFile(await file.path(), "utf8");
  const body = JSON.parse(saved) as {
    generatedAt: string;
    sections: Record<string, unknown>;
  };
  expect(Number.isNaN(Date.parse(body.generatedAt))).toBe(false);
  // Byte for byte as the API wrote it, not parsed and written out again.
  // The mock lays it out with two-space indents and a closing newline.
  expect(saved).toBe(`${JSON.stringify(body, null, 2)}\n`);
  expect(body.sections).toHaveProperty("account");
  await expect(said(page)).toHaveCount(0);
  await expectAccessible(page);
});

test("the fourth file in a day: the API's sentence, and the row stays ready", async ({
  page,
}, info) => {
  await signIn(page, info);
  await openAccount(page, "export-limit");
  await download(page).click();

  await expect(said(page)).toHaveText(LIMIT);
  await expect(download(page)).not.toHaveAttribute("aria-busy", "true");
  await expectAccessible(page);
});

test("a file that took too long: the API's sentence, and the row can be tapped again", async ({
  page,
}, info) => {
  await signIn(page, info);
  await openAccount(page, "export-down");
  await download(page).click();
  await expect(said(page)).toHaveText(DOWN);

  // Tapped again under the same scenario, the same sentence, asked once more.
  const asked = page.waitForRequest(
    (r) => r.url().endsWith("/api/v1/me/export") && r.method() === "GET",
  );
  await download(page).click();
  await asked;
  await expect(said(page)).toHaveText(DOWN);
});

test("a session that is not a sign-in: Account turns into the sign-in form and says why", async ({
  page,
}, info) => {
  await signIn(page, info);
  await openAccount(page, "export-signed-out");
  await download(page).click();

  await expect(page.getByLabel("Your WhatsApp number")).toBeVisible();
  await expect(said(page)).toHaveText(SIGNED_OUT);
  await expect(download(page)).toHaveCount(0);
  await expectAccessible(page);
});

test("another page on the same site cannot spend a file", async ({
  page,
}, info) => {
  await signIn(page, info);
  // A sibling *.yuvoy.in page gets the Lax cookie, so the proxy checks who sent it.
  const sibling = await page.request.get("/api/v1/me/export", {
    headers: { "sec-fetch-site": "same-site" },
  });
  expect(sibling.status()).toBe(403);
  const own = await page.request.get("/api/v1/me/export", {
    headers: { "sec-fetch-site": "same-origin" },
  });
  expect(own.status()).toBe(200);
});

test("signed out, there is no row", async ({ page }) => {
  await page.goto("/account");
  await expect(page.getByLabel("Your WhatsApp number")).toBeVisible();
  await expect(download(page)).toHaveCount(0);
});
