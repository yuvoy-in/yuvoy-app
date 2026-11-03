import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { COORG, FOUND_IDS } from "../mocks/found-fixtures";

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

/* Coorg's cards the tests name, by title (`mocks/found-fixtures.ts`). */
const RAFTING = "White water rafting on the Barapole"; // FOUND_IDS.found
const ESTATE = "Coffee estate walk and tasting"; // FOUND_IDS.checked

const picker = (page: Page) =>
  page.getByRole("dialog", { name: "Pick a place" });

const cards = (page: Page) => page.locator('[role="feed"] article');

const card = (page: Page, title: string) =>
  page.getByRole("article", { name: title, exact: true });

const heading = (page: Page, place: string) =>
  page.getByRole("heading", {
    level: 1,
    name: `Things to do in ${place}`,
    exact: true,
  });

/* ---------------------------------------------------------------- case 8 */

test("the feed ends honestly when the server says complete", async ({
  page,
}) => {
  /*
    Forty-five cards, three pages at the feed's twenty. Walked rather than
    jumped, as `feed-paging.spec.ts` walks the reels: each page has to arrive
    before the next boundary is reachable, so a foot that stops asking after
    the first page fails here. Bounded, so a feed that pages forever fails
    rather than hangs.
  */
  await signIn(page);
  await page.goto(coorg("found-long"));
  await expect(cards(page)).toHaveCount(20);

  const end = page.getByText("That's what we know about Coorg so far.", {
    exact: true,
  });
  for (let i = 0; i < 6; i++) {
    if (await end.isVisible().catch(() => false)) break;
    const before = await cards(page).count();
    await page.locator("[data-tail]").scrollIntoViewIfNeeded();
    await expect
      .poll(
        async () =>
          (await end.isVisible().catch(() => false))
            ? Number.MAX_SAFE_INTEGER
            : cards(page).count(),
        { message: "the next page never arrived", timeout: 15_000 },
      )
      .toBeGreaterThan(before);
  }

  await expect(end).toBeVisible();
  await expect(cards(page)).toHaveCount(45);
  await expect(
    page.getByRole("button", { name: "Pick another place", exact: true }),
  ).toBeVisible();
  await expect(page.getByText(/not the end of the list/)).toHaveCount(0);
  await expectAccessible(page);
});

test("a later page that fails says so at the foot, and the list stays", async ({
  page,
}) => {
  await signIn(page);
  await page.goto(coorg("found-page-error"));
  await expect(cards(page)).toHaveCount(20);

  await page.locator("[data-tail]").scrollIntoViewIfNeeded();
  /*
    Generous: the API client retries a GET that met a 503 before it gives up,
    and only then is the page a failure.
  */
  await expect(
    page.getByRole("alert").filter({
      hasText: "More cards did not load. Scroll up and back down to try again.",
    }),
  ).toBeVisible({ timeout: 20_000 });
  await expect(cards(page)).toHaveCount(20);
  await expect(
    page.getByText("That's what we know about Coorg so far."),
  ).toHaveCount(0);
  await expectAccessible(page);
});

test("a feed the server stopped is never called an ending", async ({
  page,
}) => {
  // `complete: false` and no cursor: not the end, and the foot says so.
  await signIn(page);
  await page.goto(coorg("found-stopped"));
  await expect(cards(page)).toHaveCount(20);
  await expect(
    page.getByText(
      "That's as far as we can load right now, not the end of the list. Reload to try again.",
      { exact: true },
    ),
  ).toBeVisible();
  await expect(
    page.getByText("That's what we know about Coorg so far."),
  ).toHaveCount(0);
});

test("an empty place, an empty department and a failed first page each say what they are", async ({
  page,
}) => {
  await signIn(page);

  await test.step("a place with nothing in it", async () => {
    await page.goto(coorg("found-empty"));
    await expect(
      page.getByText("Nothing to show in Coorg right now", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText(
        "Everything we had has ended or is being checked. Try another place, or come back soon.",
        { exact: true },
      ),
    ).toBeVisible();
    await expect(cards(page)).toHaveCount(0);
    await expectAccessible(page);

    // Its way out is the same picker as the place button's.
    await page
      .getByRole("button", { name: "Pick another place", exact: true })
      .click();
    await expect(picker(page)).toBeVisible();
  });

  await test.step("a department with nothing in it", async () => {
    await page.goto(coorg("found-dept-empty", "&category=adventure"));
    // Named from the vocabulary answer, lower-cased in the sentence.
    await expect(
      page.getByText("No adventure in Coorg right now", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText("Try another kind of thing.", { exact: true }),
    ).toBeVisible();
    await expectAccessible(page);

    await page
      .getByRole("button", { name: "Show everything", exact: true })
      .click();
    await expect(card(page, RAFTING)).toBeVisible();
  });

  await test.step("the first page failed", async () => {
    await page.goto(coorg("found-error"));
    // The page is still the place's, with a way to ask again.
    await expect(heading(page, "Coorg")).toBeVisible();
    /*
      Scoped by its button: Next's route announcer is a `role="alert"` too,
      and an unscoped alert would be whichever came first.
    */
    await expect(
      page.getByRole("alert").filter({
        has: page.getByRole("button", { name: "Try again", exact: true }),
      }),
    ).toBeVisible();
    await expect(cards(page)).toHaveCount(0);
    await expectAccessible(page);
  });
});

/* ---------------------------------------------------------------- case 9 */

test("a shared card link opens the card page signed out", async ({ page }) => {
  /*
    The app's Share sends `/f/{id}`, and whoever it is sent to has never
    signed in here: this page is not behind the invite gate or a session.
    A fresh context per test, so nothing is signed in.
  */
  expect(
    (await page.context().cookies()).find((c) => c.name === "yv_session"),
  ).toBeUndefined();

  await page.goto(`/f/${FOUND_IDS.checked}?__scenario=explore-all`);
  await expect(
    page.getByRole("heading", { level: 1, name: ESTATE, exact: true }),
  ).toBeVisible();
  await expect(page.getByTestId("found-price")).toContainText(
    "Tickets are sold by the organiser, not Yuvoy.",
  );
  await expect(page.getByTestId("found-organiser")).toHaveText(
    "Sample Coffee Estate",
  );
  // The summary is ours, and only on a card a person has checked.
  await expect(page.getByTestId("found-summary")).toBeVisible();
  await expect(page.getByTestId("found-also")).toHaveText(
    "Also listed on coorgtrails.example, estatewalks.example",
  );
  await expect(
    page.getByRole("link", { name: "See details", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Report a problem", exact: true }),
  ).toBeVisible();
  await expectAccessible(page);

  await page
    .getByRole("button", { name: "Report a problem", exact: true })
    .click();
  await expect(
    page.getByRole("dialog", { name: "Report a problem" }),
  ).toBeVisible();
  await expectAccessible(page);

  // A card nobody checked opens too, with no summary of ours on it.
  await page.goto(`/f/${FOUND_IDS.found}?__scenario=explore-all`);
  await expect(
    page.getByRole("heading", { level: 1, name: RAFTING, exact: true }),
  ).toBeVisible();
  await expect(page.getByTestId("found-summary")).toHaveCount(0);
  await expectAccessible(page);

  // A merged card's old link still lands, on the card it was merged into.
  await page.goto(`/f/${FOUND_IDS.merged}?__scenario=explore-all`);
  await expect(page).toHaveURL(new RegExp(`/f/${FOUND_IDS.mergedInto}`));
  await expect(
    page.getByRole("heading", { level: 1, name: ESTATE, exact: true }),
  ).toBeVisible();
});

/* --------------------------------------------------------------- case 10 */

/** The `@type` of each JSON-LD block on the page. */
async function jsonLdTypes(page: Page): Promise<string[]> {
  const blocks = await page
    .locator('script[type="application/ld+json"]')
    .allTextContents();
  return blocks.flatMap((text) => {
    const node = JSON.parse(text) as { "@type"?: string | string[] };
    return [node["@type"] ?? []].flat();
  });
}

const robotsOf = (page: Page) =>
  page.locator('meta[name="robots"]').getAttribute("content");

test("the card page is noindex unless a person checked it", async ({
  page,
}) => {
  /*
    A checked, live card takes the SITE's policy, and the site itself is
    noindex until launch (`NEXT_PUBLIC_ALLOW_INDEXING`), so in this build both
    pages may well say noindex. What tells them apart is that the checked one
    carries exactly the site's tag and an Event, and the others carry
    noindex of their own and no Event. With indexing switched on for the
    site, the same assertions hold and the checked card is indexed.
  */
  await page.goto("/");
  const site = await robotsOf(page);
  expect(site).not.toBeNull();

  await page.goto(`/f/${FOUND_IDS.checked}?__scenario=explore-all`);
  await expect(
    page.getByRole("heading", { level: 1, name: ESTATE, exact: true }),
  ).toBeVisible();
  expect(await robotsOf(page)).toBe(site);
  expect(await jsonLdTypes(page)).toContain("Event");

  // Found by Trigo, a check that lapsed, and a checked card that is cancelled.
  for (const id of [FOUND_IDS.found, FOUND_IDS.lapsed, FOUND_IDS.cancelled]) {
    await page.goto(`/f/${id}?__scenario=explore-all`);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    expect(await robotsOf(page), `/f/${id}`).toMatch(/noindex/);
    expect(await jsonLdTypes(page), `/f/${id}`).not.toContain("Event");
  }
});
