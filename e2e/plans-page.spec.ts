import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { PLAN_IDS, PLAN_PAYEE } from "../mocks/plan-fixtures";

/**
 * The signed-in plan page, end to end (yuvoy-app#193).
 *
 * The unit tests prove the view against plain functions. What only a real
 * browser and the real server can show is the chain: the server reads the
 * plan with the session from the cookie, the page arrives with the form in
 * it, a press goes through this app's own proxy as one request, and the
 * answer is drawn without another read. Every state ends with axe.
 */

const DECIDED = `/plans/${PLAN_IDS.decided}`;
const OPEN = `/plans/${PLAN_IDS.open}`;

async function signIn(page: Page) {
  await page.goto("/account");
  await page.getByLabel("Your WhatsApp number").fill("9111111111");
  await page.getByRole("button", { name: "Send me a code" }).click();
  await page.getByLabel("Sign-in code").fill("123456");
  await page.getByRole("button", { name: "Show me my trips" }).click();
  await expect(
    page.getByRole("button", { name: "Sign out on this device" }),
  ).toBeVisible();
}

/** Every request the browser makes to the plan proxy, by method. */
function planCalls(page: Page) {
  const calls: string[] = [];
  page.on("request", (request) => {
    const { pathname } = new URL(request.url());
    if (pathname.startsWith("/api/v1/plans/")) {
      calls.push(`${request.method()} ${pathname.replace(/^\/api\/v1/, "")}`);
    }
  });
  return calls;
}

async function expectAccessible(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(results.violations).toEqual([]);
}

test.describe("a plan, signed out", () => {
  test("asks to sign in and comes back, asking the API nothing", async ({ page }) => {
    const calls = planCalls(page);
    await page.goto(DECIDED);

    await expect(
      page.getByRole("heading", { name: "Sign in to see this plan" }),
    ).toBeVisible();
    await expect(page.getByRole("link", { name: "Sign in" })).toHaveAttribute(
      "href",
      `/account?next=${DECIDED}`,
    );
    // Nothing about the plan, not even its name.
    await expect(page.getByText("Dinner at the beach shack")).toHaveCount(0);
    expect(calls).toEqual([]);
    await expectAccessible(page);
  });
});

test.describe("a plan, signed in as a member", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  test("draws the plan, with the pay button, the UPI ID and the share", async ({ page }) => {
    await page.goto(DECIDED);
    await expect(
      page.getByRole("heading", { level: 1, name: "Dinner at the beach shack" }),
    ).toBeVisible();
    await expect(page.getByText("Asha invited you")).toBeVisible();

    const pay = page.getByRole("link", { name: "Pay ₹450 by UPI" });
    await expect(pay).toHaveAttribute("href", /^upi:\/\/pay\?pa=asha%40okaxis&/);
    await expect(
      page.getByText(`Button not working? Send ₹450 to ${PLAN_PAYEE.upiId} from any UPI app.`),
    ).toBeVisible();
    await expectAccessible(page);
  });

  test("sends one request for a changed answer, and draws the answer", async ({ page }) => {
    const calls = planCalls(page);
    await page.goto(DECIDED);
    await page.getByRole("radio", { name: "Maybe" }).check();
    await page.getByRole("button", { name: "Update my reply" }).click();

    await expect(page.getByText(/Thanks, Ravi\. Your reply is in\./)).toBeVisible();
    expect(calls).toEqual([`PUT /plans/${PLAN_IDS.decided}/reply`]);
    await expectAccessible(page);
  });

  test("sends one request for a claim", async ({ page }) => {
    const calls = planCalls(page);
    await page.goto(OPEN);
    await page.getByRole("checkbox", { name: /Paper plates/ }).check();
    await page.getByRole("button", { name: "Update my reply" }).click();

    await expect(page.getByText(/Your reply is in\./)).toBeVisible();
    await expect(page.getByRole("checkbox", { name: /Paper plates/ })).toBeChecked();
    expect(calls).toEqual([`PUT /plans/${PLAN_IDS.open}/reply`]);
    await expectAccessible(page);
  });

  test("sends one request for a paid mark", async ({ page }) => {
    const calls = planCalls(page);
    await page.goto(DECIDED);
    await page.getByRole("checkbox", { name: /I've paid my share/ }).first().check();
    await page.getByRole("button", { name: "Update my reply" }).click();

    await expect(page.getByText(/Your reply is in\./)).toBeVisible();
    await expect(page.getByText("2 of 4 have paid")).toBeVisible();
    expect(calls).toEqual([`PUT /plans/${PLAN_IDS.decided}/reply`]);
    await expectAccessible(page);
  });

  test("leaves only after asking, with one request", async ({ page }) => {
    const calls = planCalls(page);
    await page.goto(DECIDED);
    await page.getByRole("button", { name: "Leave this plan" }).click();
    const sheet = page.getByRole("dialog", { name: "Leave this plan" });
    await expect(
      sheet.getByText("Your name and answers will be deleted, and your items freed for others."),
    ).toBeVisible();
    expect(calls).toEqual([]);
    await expectAccessible(page);

    await sheet.getByRole("button", { name: "Leave this plan" }).click();
    await expect(page.getByText("You left this plan.")).toBeVisible();
    expect(calls).toEqual([`DELETE /plans/${PLAN_IDS.decided}/reply`]);
    await expectAccessible(page);
  });

  test("offers no pay button for a link that pays somebody else", async ({ page }) => {
    await page.goto(`${DECIDED}?__scenario=plan-paylink-bad`);
    await expect(
      page.getByRole("heading", { level: 1, name: "Dinner at the beach shack" }),
    ).toBeVisible();
    await expect(page.getByRole("link", { name: /by UPI/ })).toHaveCount(0);
    await expect(page.locator('a[href^="upi:"]')).toHaveCount(0);
    // The way to pay by hand is still all there.
    await expect(
      page.getByText(`Send ₹450 to ${PLAN_PAYEE.upiId} from any UPI app.`),
    ).toBeVisible();
    await expect(page.getByText("Your share: ₹450.")).toBeVisible();
    await expectAccessible(page);
  });
});

test.describe("a plan, signed in as its planner", () => {
  test("has no Leave and nothing to pay", async ({ page }) => {
    await signIn(page);
    await page.goto(`${DECIDED}?__scenario=plan-planner`);
    await expect(page.getByText("You're planning this")).toBeVisible();
    await expect(page.getByRole("button", { name: "Leave this plan" })).toHaveCount(0);
    await expect(page.locator('a[href^="upi:"]')).toHaveCount(0);
    await expectAccessible(page);
  });
});

test.describe("a plan that is not there", () => {
  test("is the app's own not-found page, for the API's 404", async ({ page }) => {
    await signIn(page);
    const response = await page.goto(`${DECIDED}?__scenario=plan-404`);
    expect(response?.status()).toBe(404);
    await expect(page.getByText("We do not have this one")).toBeVisible();
    await expectAccessible(page);
  });

  test("is the same page for an id that is not a plan id, signed in or not", async ({ page }) => {
    const calls = planCalls(page);
    const response = await page.goto("/plans/not-a-plan");
    expect(response?.status()).toBe(404);
    await expect(page.getByText("We do not have this one")).toBeVisible();
    expect(calls).toEqual([]);
    await expectAccessible(page);
  });
});

test.describe("plans paused", () => {
  test("says so, with Try again", async ({ page }) => {
    await signIn(page);
    await page.goto(`${DECIDED}?__scenario=plan-unavailable`);
    await expect(page.getByText("Plans are paused for a moment.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Try again" })).toBeVisible();
    await expectAccessible(page);
  });
});

test.describe("a plan and the crawlers", () => {
  test("is never indexed and never in the sitemap", async ({ page }) => {
    await page.goto(DECIDED);
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
      "content",
      /noindex/,
    );
    const sitemap = await (await page.request.get("/sitemap.xml")).text();
    expect(sitemap).not.toContain("/plans");
    const robots = await (await page.request.get("/robots.txt")).text();
    expect(
      robots.includes("Disallow: /\n") || robots.includes("/plans/"),
      `robots.txt neither blanket-disallows nor names /plans/:\n${robots}`,
    ).toBe(true);
  });
});
