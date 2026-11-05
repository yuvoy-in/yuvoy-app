import { test, expect, type Page, type Request } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import {
  COORG,
  FOUND_IDS,
  REPORT_RECEIPTS,
  REPORT_REFERENCE,
} from "../mocks/found-fixtures";

/**
 * Explore any place (yuvoy-app#179, R2-T4): the place picker on `/`, the
 * found feed, the card page at `/f/{id}`, the report sheet and the leaving
 * sheet, in a real browser against the mocks.
 *
 * The unit tests hold each part's rules. What only a browser answers is how
 * the parts meet: that a pick reaches the server as `?place=` and comes back
 * as a cookie, that a header Vercel writes reaches the picker's first row,
 * that See details really opens the stored address in a new tab and nothing
 * else, that a report's body is exactly what the contract allows, and that
 * the feed's foot tells the truth about what the server said.
 *
 * ## Which world each test runs in
 *
 * With no scenario, `explore` is `off`, as on dev and production today, and
 * `/` must be the reels exactly as before. Two kinds of scenario open it:
 *
 *   - `explore-all` opens it to everybody, so a signed-out visitor sees
 *     Karnataka in the public list and reads and reports its cards. Most of
 *     this file runs there, because signing in costs four steps a test.
 *   - every `found-*`, `report-*` and `item-*` scenario opens it at `staff`
 *     only, where `GET /events` answers a stranger 404. Those tests sign in
 *     first (any number is staff under them), and the page then reads
 *     `/me/places` and every page of cards with the session.
 *
 * The words asserted are copied from `found-words.ts`, `place-picker.tsx`,
 * `see-details.tsx` and `report-sheet.tsx`, as no spec here imports app code.
 * The mock's own ids and receipts come from `mocks/found-fixtures.ts`, so a
 * fixture edit cannot leave this file naming a card that is gone.
 */

const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

/** The same check `redesign-axe.spec.ts` runs, for the same reasons. */
async function expectAccessible(page: Page) {
  /*
    Let entrances finish: axe measuring a sheet mid-rise reads a colour nobody
    sees. Settled, not all, and never an infinite one (a skeleton's shimmer)
    or one on a scroll timeline: see `redesign-axe.spec.ts`.
  */
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

/** Signs in on Account, as `session-cookie.spec.ts` does. */
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

/** Coorg's found feed, under a scenario. */
const coorg = (scenario: string, extra = "") =>
  `/?place=${COORG}${extra}&__scenario=${scenario}`;

/* Coorg's cards the tests name, by title (`mocks/found-fixture-cards.ts`). */
const RAFTING = "White water rafting on the Barapole"; // FOUND_IDS.found
const ESTATE = "Coffee estate walk and tasting"; // FOUND_IDS.checked

/**
 * The rafting card's link as the API stored it. `www.` on the link and not on
 * the source, so "Opens {host}" dropping it is visible too.
 */
const RAFTING_URL = "https://www.coorgrafting.example/barapole";
const RAFTING_HOST = "coorgrafting.example";

const card = (page: Page, title: string) =>
  page.getByRole("article", { name: title, exact: true });

/** A card's More menu, then Report a problem: the feed's way into the sheet. */
async function openReport(page: Page, title: string) {
  const item = card(page, title);
  await item.getByRole("button", { name: "More", exact: true }).click();
  await item
    .getByRole("button", { name: "Report a problem", exact: true })
    .click();
  const sheet = page.getByRole("dialog", { name: "Report a problem" });
  await expect(sheet).toBeVisible();
  return sheet;
}

const toReport = (id: string) => (r: Request) =>
  r.method() === "POST" &&
  new URL(r.url()).pathname.endsWith(`/events/${id}/reports`);

/* ---------------------------------------------------------------- case 6 */

test("See details warns first, then opens the stored link, with nothing added, in a new tab", async ({
  page,
  context,
}) => {
  /*
    The organiser's host is on `.example` and resolves nowhere, so the new
    tab's navigation is answered here. That also records the address the
    browser actually asked for, which is the claim under test: the URL as
    stored, no parameter, no redirect through us.
  */
  const asked: string[] = [];
  await context.route(/^https:\/\/www\.coorgrafting\.example\//, (route) => {
    if (route.request().isNavigationRequest())
      asked.push(route.request().url());
    return route.fulfill({
      status: 200,
      contentType: "text/html",
      body: "<!doctype html><title>Sample Rafting Camp</title>",
    });
  });
  const tabs: Page[] = [];
  context.on("page", (opened) => tabs.push(opened));

  await page.goto(coorg("explore-all"));
  const item = card(page, RAFTING);
  const seeDetails = item.getByRole("link", {
    name: "See details",
    exact: true,
  });
  await expect(item.getByText(`Opens ${RAFTING_HOST}`)).toBeVisible();
  // A real link: the address as stored, a new tab, and the referrer kept.
  await expect(seeDetails).toHaveAttribute("href", RAFTING_URL);
  await expect(seeDetails).toHaveAttribute("target", "_blank");
  await expect(seeDetails).toHaveAttribute("rel", "noopener");

  await seeDetails.click();
  const leaving = page.getByRole("dialog", { name: "You're leaving Yuvoy" });
  await expect(leaving).toBeVisible();
  await expect(
    leaving.getByText(
      `This opens ${RAFTING_HOST} in a new tab. Check the date, price and tickets on their page. Yuvoy doesn't sell these tickets.`,
      { exact: true },
    ),
  ).toBeVisible();
  await expect(
    leaving.getByRole("checkbox", {
      name: "Don't show this again on this device",
    }),
  ).not.toBeChecked();
  await expect(
    leaving.getByRole("button", { name: "Stay on Yuvoy", exact: true }),
  ).toBeVisible();
  // The notice first, and nothing has opened behind it.
  expect(tabs, "a tab opened before the notice was answered").toHaveLength(0);
  await expectAccessible(page);

  const open = leaving.getByRole("link", {
    name: `Open ${RAFTING_HOST}`,
    exact: true,
  });
  await expect(open).toHaveAttribute("href", RAFTING_URL);
  await expect(open).toHaveAttribute("rel", "noopener");

  const newTab = context.waitForEvent("page");
  await open.click();
  const tab = await newTab;
  await tab.waitForLoadState();
  expect(tab.url()).toBe(RAFTING_URL);
  expect(asked).toEqual([RAFTING_URL]);
  // Coming back finds the card, not the question.
  await expect(leaving).toBeHidden();
});

/* ---------------------------------------------------------------- case 7 */

test("a report hides the card, says what happens next, and sends only a reason", async ({
  page,
}) => {
  await page.goto(coorg("explore-all"));
  await expect(card(page, RAFTING)).toBeVisible();

  const sheet = await openReport(page, RAFTING);
  await expect(
    sheet.getByRole("group", { name: "What's wrong with this card?" }),
  ).toBeVisible();
  await expectAccessible(page);

  await sheet
    .getByRole("radio", { name: "The date or time is wrong", exact: true })
    .check();
  const sent = page.waitForRequest(toReport(FOUND_IDS.found));
  await sheet.getByRole("button", { name: "Send report", exact: true }).click();

  /*
    The contract's closed `EventReport`: a reason, and a note only when there
    is one. Never a device id, which the API now refuses by name, and nothing
    else either.
  */
  const body = (await sent).postDataJSON() as Record<string, unknown>;
  expect(body).toEqual({ reason: "wrong_date" });

  // Signed out, the API hides it on this device, and gives no reference.
  await expect(
    sheet.getByText(REPORT_RECEIPTS.device, { exact: true }),
  ).toBeVisible();
  await expect(sheet.getByText(/^Your reference is/)).toHaveCount(0);
  // Gone from the list at once, behind the receipt.
  await expect(card(page, RAFTING)).toHaveCount(0);

  await sheet.getByRole("button", { name: "Done", exact: true }).click();
  await expect(sheet).toBeHidden();

  // And it stays gone: the id is on this device's hidden list, not in memory.
  await page.reload();
  await expect(card(page, ESTATE)).toBeVisible();
  await expect(card(page, RAFTING)).toHaveCount(0);
});

test("signed in, Something else needs a note, and the receipt carries a reference", async ({
  page,
}) => {
  await signIn(page);
  await page.goto(coorg("explore-staff"));
  await expect(card(page, ESTATE)).toBeVisible();

  const sheet = await openReport(page, ESTATE);
  await sheet
    .getByRole("radio", { name: "Something else", exact: true })
    .check();
  const send = sheet.getByRole("button", { name: "Send report", exact: true });

  // Sent with no note, it asks for one and sends nothing.
  const early: Request[] = [];
  page.on("request", (r) => {
    if (toReport(FOUND_IDS.checked)(r)) early.push(r);
  });
  await send.click();
  await expect(
    sheet.getByRole("alert").filter({ hasText: "Tell us what's wrong." }),
  ).toBeVisible();
  expect(early, "a report went with no note").toHaveLength(0);

  const note = "The estate says the walks stop for the monsoon.";
  await sheet.getByLabel("Anything else we should know?").fill(note);
  const sent = page.waitForRequest(toReport(FOUND_IDS.checked));
  await send.click();
  const body = (await sent).postDataJSON() as Record<string, unknown>;
  expect(body).toEqual({ reason: "other", note });

  // A checked card reported signed in is hidden for this person, with a case.
  await expect(
    sheet.getByText(REPORT_RECEIPTS.you, { exact: true }),
  ).toBeVisible();
  await expect(
    sheet.getByText(
      `Your reference is ${REPORT_REFERENCE}. You'll see what we did in Help.`,
      { exact: true },
    ),
  ).toBeVisible();
  await expect(card(page, ESTATE)).toHaveCount(0);
});

test("a day's limit and a report sent too fast say different things", async ({
  page,
}) => {
  /*
    Both are a 429. Past a day's limit the API sets `Retry-After`, and Send
    stays held: nothing will go today. Too fast there is no header, and the
    same report may go again in a moment. Through the proxy, signed in, so
    this also proves the proxy passes `Retry-After` on.
  */
  await signIn(page);

  await page.goto(coorg("report-throttled"));
  let sheet = await openReport(page, RAFTING);
  await sheet
    .getByRole("radio", { name: "The price is wrong", exact: true })
    .check();
  await sheet.getByRole("button", { name: "Send report", exact: true }).click();
  await expect(sheet.getByRole("alert")).toHaveText(
    "You've sent a lot of reports today. Try again tomorrow.",
  );
  await expect(
    sheet.getByRole("button", { name: "Send report", exact: true }),
  ).toBeDisabled();
  // Nothing was hidden: the report did not go.
  await expect(card(page, RAFTING)).toBeVisible();

  await page.goto(coorg("report-too-fast"));
  sheet = await openReport(page, RAFTING);
  await sheet
    .getByRole("radio", { name: "The price is wrong", exact: true })
    .check();
  const send = sheet.getByRole("button", { name: "Send report", exact: true });
  await send.click();
  await expect(sheet.getByRole("alert")).toHaveText(
    "Too many requests. Try again shortly.",
  );
  // Rests for three seconds, then the same report may go again.
  await expect(send).toBeEnabled({ timeout: 6_000 });
});
