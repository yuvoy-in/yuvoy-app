import {
  test,
  expect,
  type Locator,
  type Page,
  type TestInfo,
} from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

/**
 * Trigo's date alerts and trip drafts on the web (yuvoy-app#220, the web
 * half of yuvoy-mobile#456), in a real browser against the mocks.
 *
 * The unit tests hold each state's rules. What only a browser answers is the
 * way in (Account's button, the Trips tab), that a stop or a delete goes out
 * through the session proxy and the list comes back without it, that the
 * 503 and 404 answers leave a way on, and that the longest lists fit a phone.
 *
 * With no scenario `trigo` is `off`, as in production. Every `trigo-lists*`
 * scenario opens it at `staff` for the signed-in number
 * (`mocks/trigo-list-handlers.ts` says what each does). The mock keeps the
 * lists per scenario and session, so each test signs in as a number of its
 * own, and the scenario is on every page url, after every navigation too.
 *
 * The words are the app's and the mock's, written out here, as no spec
 * imports app code.
 */

const W = {
  alertsTitle: "Date alerts",
  stop: "Stop telling me",
  fired: "Has a date now",
  noLonger: "No longer listed",
  drafts: "Drafts",
  deleteDraft: "Delete draft",
  alertsFailed: "We could not load your date alerts",
  draftsFailed: "We could not load your trip drafts",
  down: "Trigo is not available right now. Try again later.",
  alertGone: "We could not find that date alert.",
  draftGone: "We could not find that trip draft.",
  tryAgain: "Try again",
} as const;

/* From `mocks/trigo-list-fixtures.ts`. */
const LISTED = "Try dive at Nemo Reef";
const FIRST_DRAFT = "Havelock long weekend";
const SECOND_DRAFT = "Neil day trip";

const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

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

/** A number of this test's own, the same on every run of it. */
function numberFor(info: TestInfo): string {
  let h = 0;
  for (const ch of `lists|${info.project.name}|${info.testId}|${info.retry}`) {
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

const withScenario = (path: string, scenario: string) =>
  `${path}?__scenario=${scenario}`;

const alerts = (page: Page) =>
  page.locator('[role="alert"]:not(#__next-route-announcer__)');

const heading = (page: Page, name: string) =>
  page.getByRole("heading", { level: 1, name, exact: true });

/** Taps a link, waits for its path, then opens it again with the scenario. */
async function follow(page: Page, link: Locator, scenario: string) {
  const href = await link.getAttribute("href");
  expect(href).toBeTruthy();
  await link.click();
  await page.waitForURL((u) => u.pathname === href);
  await page.goto(withScenario(href!, scenario));
}

/** Account, then its Date alerts button, under a scenario. */
async function openAlerts(page: Page, scenario: string) {
  await page.goto(withScenario("/account", scenario));
  await follow(
    page,
    page.getByRole("link", { name: W.alertsTitle, exact: true }),
    scenario,
  );
  await expect(heading(page, W.alertsTitle)).toBeVisible();
}

/** Trips, then its Drafts tab, under a scenario. */
async function openDrafts(page: Page, scenario: string) {
  await page.goto(withScenario("/trips", scenario));
  await page.getByRole("tab", { name: W.drafts }).click();
  await expect(page.getByRole("tab", { name: W.drafts })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(page.getByRole("button", { name: "Dates" })).toHaveCount(0);
}

async function noSideScroll(page: Page, where: string) {
  const overflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth >
      document.documentElement.clientWidth,
  );
  expect(overflow, `${where} scrolls horizontally`).toBe(false);
}

test.describe("Trigo's lists", () => {
  test("signed in: open Date alerts and stop one, then Trips, Drafts, and delete one", async ({
    page,
  }, info) => {
    const scenario = "trigo-lists";
    await signIn(page, info);

    await openAlerts(page, scenario);
    await expect(page.getByText(W.fired, { exact: true })).toBeVisible();
    await expect(page.getByText(W.noLonger, { exact: true })).toBeVisible();
    await expectAccessible(page);

    const stopped = page.waitForResponse(
      (r) =>
        r.request().method() === "DELETE" &&
        new URL(r.url()).pathname.includes("/me/date-alerts/"),
    );
    await page.getByRole("button", { name: `${W.stop}: ${LISTED}` }).click();
    expect((await stopped).status()).toBe(204);
    await expect(page.getByText(LISTED, { exact: true })).toHaveCount(0);
    await expect(alerts(page)).toHaveCount(0);

    // Stopped stays stopped when the page is read again.
    await page.reload();
    await expect(heading(page, W.alertsTitle)).toBeVisible();
    await expect(page.getByText(W.fired, { exact: true })).toBeVisible();
    await expect(page.getByText(LISTED, { exact: true })).toHaveCount(0);

    await openDrafts(page, scenario);
    await expect(
      page.getByRole("heading", { name: FIRST_DRAFT, exact: true }),
    ).toBeVisible();
    await expect(page.getByText("14 Nov to 16 Nov")).toBeVisible();
    await expectAccessible(page);

    await page
      .getByRole("button", { name: `${W.deleteDraft}: ${FIRST_DRAFT}` })
      .click();
    await expect(
      page.getByRole("heading", { name: FIRST_DRAFT, exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("heading", { name: SECOND_DRAFT, exact: true }),
    ).toBeVisible();
    await expect(alerts(page)).toHaveCount(0);
  });

  test("a 503 on either list shows the error with Try again, never the empty line", async ({
    page,
  }, info) => {
    const scenario = "trigo-lists-down";
    await signIn(page, info);

    await openAlerts(page, scenario);
    await expect(alerts(page)).toContainText(W.alertsFailed);
    await expect(alerts(page)).toContainText(W.down);
    await expect(
      alerts(page).getByRole("button", { name: W.tryAgain }),
    ).toBeVisible();
    await expect(page.getByText(/^Ask Trigo to tell you/)).toHaveCount(0);
    await expectAccessible(page);

    await openDrafts(page, scenario);
    await expect(alerts(page)).toContainText(W.draftsFailed);
    await expect(alerts(page)).toContainText(W.down);
    await expect(page.getByText(/^Ask Trigo to plan a trip/)).toHaveCount(0);
  });

  test("a 404 on stop or delete shows the API's sentence and reads the list again", async ({
    page,
  }, info) => {
    const scenario = "trigo-lists-gone";
    await signIn(page, info);

    await openAlerts(page, scenario);
    await page.getByRole("button", { name: `${W.stop}: ${LISTED}` }).click();
    await expect(page.getByText(W.alertGone, { exact: true })).toBeVisible();
    await expect(page.getByText(LISTED, { exact: true })).toHaveCount(0);
    await expect(alerts(page)).toHaveCount(0);

    await openDrafts(page, scenario);
    await page
      .getByRole("button", { name: `${W.deleteDraft}: ${FIRST_DRAFT}` })
      .click();
    await expect(page.getByText(W.draftGone, { exact: true })).toBeVisible();
    await expect(
      page.getByRole("heading", { name: FIRST_DRAFT, exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("heading", { name: SECOND_DRAFT, exact: true }),
    ).toBeVisible();
  });

  test("long titles and a day with 12 cards wrap without sideways scroll at phone width", async ({
    page,
  }, info) => {
    const scenario = "trigo-lists-many";
    await page.setViewportSize({ width: 360, height: 780 });
    await signIn(page, info);

    await openAlerts(page, scenario);
    await expect(
      page.getByRole("button", { name: /^Stop telling me/ }),
    ).toHaveCount(50);
    await expect(page.getByText(W.fired, { exact: true })).toHaveCount(50);
    await noSideScroll(page, "Date alerts");

    await openDrafts(page, scenario);
    for (const day of ["Tue, 1 Dec", "Mon, 7 Dec", "Mon, 14 Dec"]) {
      await expect(
        page.getByRole("heading", { level: 3, name: day, exact: true }),
      ).toBeVisible();
    }
    await noSideScroll(page, "Drafts");
    await expectAccessible(page);
  });
});
