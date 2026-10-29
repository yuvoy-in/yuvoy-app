import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

/**
 * One table at `/tables/{id}`, where every table email links (yuvoy-app#194).
 *
 * The unit tests prove each state against a handler. What only a real
 * browser shows is the chain an email starts: the link opens a page that
 * shows a signed-out reader nothing, signing in comes back to it, and the
 * table is read through the real proxy, its allowlist and its cookie.
 *
 * Every state is the same fixture id moved by `x-yuvoy-scenario`, which the
 * proxy carries upstream in a mocked build. It is set after signing in, so
 * the sign-in itself is never under a table scenario.
 */

const TABLE = "/tables/7d3f9a2e-4c1b-4e8a-9f60-2b5d8c1e7a40";
const TITLE = "Sample table: Friday supper at a café";

async function signIn(page: Page) {
  await page.getByLabel("Your WhatsApp number").fill("9111111111");
  await page.getByRole("button", { name: "Send me a code" }).click();
  await page.getByLabel("Sign-in code").fill("123456");
  await page.getByRole("button", { name: "Show me my trips" }).click();
}

/** Signed in, then the table, under a scenario when one is given. */
async function openSignedIn(page: Page, scenario?: string) {
  await page.goto("/account");
  await signIn(page);
  await expect(
    page.getByRole("button", { name: "Sign out on this device" }),
  ).toBeVisible();
  if (scenario) {
    await page.setExtraHTTPHeaders({ "x-yuvoy-scenario": scenario });
  }
  await page.goto(TABLE);
}

async function expectAccessible(page: Page) {
  /*
    Every transition finished first, as search-reels.spec.ts explains: a
    reason button picked a moment ago is still fading to forest, and axe
    measured that frame at 4.23:1 once (passed on retry). The settled
    colours are AA.
  */
  await page.evaluate(() =>
    Promise.all(
      document
        .getAnimations()
        // A pulse that never ends would hold this forever; it changes no colour.
        .filter((a) => a.effect?.getComputedTiming().endTime !== Infinity)
        .map((a) => a.finished),
    ),
  );
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(results.violations).toEqual([]);
}

test("signed out shows nothing of the table, and signing in comes back to it", async ({
  page,
}) => {
  await page.goto(TABLE);
  await expect(
    page.getByRole("heading", { name: "Sign in to see this table" }),
  ).toBeVisible();
  // A forwarded letter tells a stranger nothing, not even in the tab.
  await expect(page.getByText(TITLE)).toHaveCount(0);
  await expect(page).toHaveTitle("A table on Yuvoy");
  await expectAccessible(page);

  await page.getByRole("link", { name: "Sign in" }).click();
  await page.waitForURL(/\/account\?next=/);
  await signIn(page);

  await page.waitForURL(`**${TABLE}`);
  await expect(page.getByRole("heading", { name: TITLE })).toBeVisible();
  await expect(
    page.getByText("Request sent. We will email you."),
  ).toBeVisible();
  await expect(page).toHaveTitle("A table on Yuvoy");
});

test("is never offered to a crawler", async ({ page }) => {
  await page.goto(TABLE);
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
    "content",
    /noindex/,
  );
});

test("an approved guest sees the place, a map link and the day's number", async ({
  page,
}) => {
  await openSignedIn(page, "table-approved");
  await expect(page.getByText("Sample Café by the Bay")).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Open in maps" }),
  ).toHaveAttribute("href", /^https:\/\//);
  await expect(
    page.getByRole("link", { name: "+919000000001" }),
  ).toHaveAttribute("href", "tel:+919000000001");
  // In the table's own zone: 18:00 in Kolkata, whatever the browser's is.
  await expect(page.getByText("Fri, 21 Aug, 18:00 to 20:00")).toBeVisible();
  await expectAccessible(page);
});

test("a guest who asked withdraws, after one confirm", async ({ page }) => {
  /*
    The offer to withdraw ends when the table starts, read on the API's
    clock. In a mocked build the proxied answers carry this machine's date
    and no `x-api-date`, so the page would read today's date against the
    fixture's 21 August and see a table that has already started. The
    browser is put on the mock's own day instead: 19 August, 02:00 UTC
    (FIXTURE_NOW in mocks/fixtures.ts).
  */
  await page.clock.setFixedTime(new Date("2026-08-19T02:00:00.000Z"));
  await openSignedIn(page);
  await page.getByRole("button", { name: "Withdraw my request" }).click();

  const sheet = page.getByRole("dialog", { name: "Withdraw my request" });
  await expect(sheet).toBeVisible();
  await expectAccessible(page);
  await sheet.getByRole("button", { name: "Withdraw", exact: true }).click();

  await expect(page.getByText("You withdrew your request.")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Withdraw my request" }),
  ).toHaveCount(0);
});

test("a report is sent, and says who reads it", async ({ page }) => {
  await openSignedIn(page);
  await page.getByRole("button", { name: "Report a problem" }).click();

  const sheet = page.getByRole("dialog", { name: "Report a problem" });
  await expect(sheet).toBeVisible();
  await sheet.getByRole("button", { name: "Not as described" }).click();
  await sheet
    .getByLabel("Anything else we should know (optional)")
    .fill("The place was closed when we got there.");
  await expectAccessible(page);
  await sheet.getByRole("button", { name: "Send report" }).click();

  await expect(
    sheet.getByText(
      "Thanks. A person at Yuvoy reads every report within one working day.",
    ),
  ).toBeVisible();
});

test("paused tables say so, with Try again and a way to report", async ({
  page,
}) => {
  await openSignedIn(page, "tables-paused");
  await expect(
    page.getByRole("heading", { name: "Tables are paused right now" }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Try again" })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Report a problem" }),
  ).toBeVisible();
  await expect(page.getByText(TITLE)).toHaveCount(0);
  await expectAccessible(page);
});

test("a table that cannot be shown says so, and never that it exists", async ({
  page,
}) => {
  await openSignedIn(page, "table-missing");
  await expect(page.getByText("We can't show this table")).toBeVisible();
  // The state's own button, beside the screen's Back of the same name.
  await expect(
    page.getByRole("link", { name: "Back to the feed" }).last(),
  ).toBeVisible();
  await expect(page.getByText(TITLE)).toHaveCount(0);
  await expect(page).toHaveTitle("A table on Yuvoy");
  await expectAccessible(page);
});
