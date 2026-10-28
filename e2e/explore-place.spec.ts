import {
  test,
  expect,
  type Locator,
  type Page,
  type Request,
} from "@playwright/test";
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

/* Coorg's cards the tests name, by title (`mocks/found-fixtures.ts`). */
const RAFTING = "White water rafting on the Barapole"; // FOUND_IDS.found
const ESTATE = "Coffee estate walk and tasting"; // FOUND_IDS.checked
const SUNSET = "Sunset walk at Raja's Seat"; // FOUND_IDS.lapsed

/**
 * The rafting card's link as the API stored it. `www.` on the link and not on
 * the source, so "Opens {host}" dropping it is visible too.
 */
const RAFTING_URL = "https://www.coorgrafting.example/barapole";
const RAFTING_HOST = "coorgrafting.example";

/* The picker's rows, by the name each button carries (`Row` in place-picker). */
const ANDAMAN_ROW =
  "Andaman Islands, Book on Yuvoy, Havelock (Swaraj Dweep), Neil (Shaheed Dweep), Port Blair";
const KARNATAKA_ROW = "Karnataka, Bengaluru, Coorg";
const BENGALURU_ROW = "Bengaluru, Every card checked by a person";
const COORG_ROW = "Coorg, Found by Trigo, labelled";

const placeButton = (page: Page, name: string) =>
  page.getByRole("button", {
    name: `Change place. Now showing ${name}.`,
    exact: true,
  });

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

/** What `yv_place` holds now, or null. */
async function rememberedPlace(page: Page): Promise<string | null> {
  const cookies = await page.context().cookies();
  return cookies.find((c) => c.name === "yv_place")?.value ?? null;
}

/**
 * Presses Tab until the focus is on the button named `name`, failing if the
 * focus ever leaves the dialog on the way. A modal picker that let the focus
 * walk onto the page behind it would be a trap for a keyboard, not a sheet.
 */
async function tabTo(page: Page, dialog: Locator, name: string) {
  for (let i = 0; i < 20; i++) {
    await page.keyboard.press("Tab");
    const inside = await dialog.evaluate((d) =>
      d.contains(document.activeElement),
    );
    expect(inside, "the focus left the open picker").toBe(true);
    const focused = await page.evaluate(
      () =>
        document.activeElement?.getAttribute("aria-label") ??
        document.activeElement?.textContent?.trim() ??
        "",
    );
    if (focused === name) return;
  }
  throw new Error(`Tab never reached "${name}" in the picker`);
}

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

/* ---------------------------------------------------------------- case 1 */

test("with explore off, / is the reels and has no place button", async ({
  page,
}) => {
  /*
    The rest of case 1 is every other spec passing unedited. This is the one
    thing they would not notice: a place button drawn over the reels for
    everybody. A `?place=` link to a found place changes nothing either while
    the list does not hold it.
  */
  for (const path of ["/", `/?place=${COORG}`]) {
    await page.goto(path);
    await page.waitForSelector('article[aria-posinset="1"]');
    await expect(
      page.getByRole("button", { name: /^Change place/ }),
      `a place button on ${path}`,
    ).toHaveCount(0);
    await expect(
      page.getByRole("heading", { name: /^Things to do in/ }),
    ).toHaveCount(0);
  }
});

/* ---------------------------------------------------------------- case 2 */

test("the picker lists regions, then the places in one, from the keyboard alone", async ({
  page,
}) => {
  await page.goto("/?__scenario=explore-all");
  const trigger = placeButton(page, "Andaman Islands");
  await expect(trigger).toBeVisible();

  await trigger.focus();
  await page.keyboard.press("Enter");
  const sheet = picker(page);
  await expect(sheet).toBeVisible();

  // Level one: a row per region, in the server's order, the bookable one tagged.
  const rows = sheet.getByRole("list").getByRole("button");
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(0)).toHaveAccessibleName(ANDAMAN_ROW);
  await expect(rows.nth(1)).toHaveAccessibleName(KARNATAKA_ROW);
  await expectAccessible(page);

  // Karnataka has two places, so it opens them, and the focus goes to the way back.
  await tabTo(page, sheet, KARNATAKA_ROW);
  await page.keyboard.press("Enter");
  const back = sheet.getByRole("button", { name: "All places", exact: true });
  await expect(back).toBeFocused();
  await expect(
    sheet.getByRole("heading", { name: "Karnataka", exact: true }),
  ).toBeVisible();
  await expect(
    sheet.getByRole("button", { name: BENGALURU_ROW, exact: true }),
  ).toBeVisible();
  await expect(
    sheet.getByRole("button", { name: COORG_ROW, exact: true }),
  ).toBeVisible();
  await expectAccessible(page);

  // Back, and the focus is on the region it left from, not the top of the sheet.
  await page.keyboard.press("Enter");
  await expect(
    sheet.getByRole("button", { name: KARNATAKA_ROW, exact: true }),
  ).toBeFocused();

  // Escape closes it, and the focus is back where the picker was opened.
  await page.keyboard.press("Escape");
  await expect(sheet).toBeHidden();
  await expect(trigger).toBeFocused();

  // And a whole pick, without a pointer.
  await page.keyboard.press("Enter");
  await expect(sheet).toBeVisible();
  await tabTo(page, sheet, KARNATAKA_ROW);
  await page.keyboard.press("Enter");
  await expect(back).toBeFocused();
  await tabTo(page, sheet, COORG_ROW);
  await page.keyboard.press("Enter");

  await page.waitForURL(/[?&]place=karnataka\/coorg/);
  await expect(heading(page, "Coorg")).toBeVisible();
  await expect(placeButton(page, "Coorg")).toBeVisible();
});

/* ---------------------------------------------------------------- case 3 */

test("a picked place is remembered, and a ?place= link becomes the remembered one", async ({
  page,
}) => {
  await page.goto("/?__scenario=explore-all");
  await placeButton(page, "Andaman Islands").click();
  const sheet = picker(page);
  await sheet.getByRole("button", { name: KARNATAKA_ROW, exact: true }).click();
  await sheet.getByRole("button", { name: COORG_ROW, exact: true }).click();
  await page.waitForURL(/[?&]place=karnataka\/coorg/);
  await expect(heading(page, "Coorg")).toBeVisible();
  // The key alone: the cookie is a preference, never anything about the person.
  await expect.poll(() => rememberedPlace(page)).toBe(COORG);

  // The next visit, with no place in the address, opens where they left off.
  await page.goto("/?__scenario=explore-all");
  await expect(heading(page, "Coorg")).toBeVisible();

  /*
    A shared link opens its place, and is then the place remembered. Written
    by the browser once the page is up (`RememberPlace`), so it is polled.
  */
  await page.goto("/?place=karnataka/bengaluru&__scenario=explore-all");
  await expect(heading(page, "Bengaluru")).toBeVisible();
  await expect.poll(() => rememberedPlace(page)).toBe("karnataka/bengaluru");

  await page.goto("/?__scenario=explore-all");
  await expect(heading(page, "Bengaluru")).toBeVisible();
});

/* ---------------------------------------------------------------- case 4 */

test("Near you: a visitor from Karnataka is offered Bengaluru first", async ({
  page,
}) => {
  /*
    The two headers Vercel writes from the connection, as `near-you.ts` reads
    them: the region alone is not enough, because region codes repeat across
    countries and DEC-14 A meant the Indian states.
  */
  await page.setExtraHTTPHeaders({
    "x-vercel-ip-country": "IN",
    "x-vercel-ip-country-region": "KA",
  });
  await page.goto("/?__scenario=explore-all");
  await placeButton(page, "Andaman Islands").click();

  const rows = picker(page).getByRole("list").getByRole("button");
  await expect(rows.first()).toHaveAccessibleName("Near you · Bengaluru");
  await expect(rows).toHaveCount(3);

  await rows.first().click();
  await page.waitForURL(/[?&]place=karnataka\/bengaluru/);
  await expect(heading(page, "Bengaluru")).toBeVisible();
  await expect(
    page.getByText("Every card here was checked by a person at Yuvoy.", {
      exact: true,
    }),
  ).toBeVisible();
});

test("Near you: no region header, no Near you row", async ({ page }) => {
  await page.goto("/?__scenario=explore-all");
  await placeButton(page, "Andaman Islands").click();

  const sheet = picker(page);
  // The list is drawn first, so the row's absence is not the list loading.
  await expect(
    sheet.getByRole("button", { name: KARNATAKA_ROW, exact: true }),
  ).toBeVisible();
  await expect(sheet.getByRole("button", { name: /^Near you/ })).toHaveCount(0);
  await expect(sheet.getByRole("list").getByRole("button")).toHaveCount(2);
});

/* ---------------------------------------------------------------- case 5 */

test("a card Trigo found says so and names its source; a checked one says who checked it and when", async ({
  page,
}) => {
  await page.goto(coorg("explore-all"));
  await expect(heading(page, "Coorg")).toBeVisible();
  await expect(
    page.getByText(
      "Found by Trigo on organisers' and venues' own pages. Each card says whether a person has checked it.",
      { exact: true },
    ),
  ).toBeVisible();

  // The trust line is the API's `check.label`, shown word for word.
  await expect(
    card(page, RAFTING).getByText(
      `Found by Trigo · not checked yet · source: ${RAFTING_HOST}`,
      { exact: true },
    ),
  ).toBeVisible();
  // The day is the mock clock's, so it is matched by shape.
  await expect(
    card(page, ESTATE).getByText(
      /^Checked by Yuvoy · [A-Z][a-z]{2}, \d{1,2} [A-Z][a-z]{2} · organiser's page$/,
    ),
  ).toBeVisible();
  // A check that has lapsed is not shown as a check.
  await expect(
    card(page, SUNSET).getByText("Last checked by Yuvoy 12 days ago", {
      exact: true,
    }),
  ).toBeVisible();
  await expectAccessible(page);

  // The card page says it in a sentence: the API's `check.sentence`.
  await page.goto(`/f/${FOUND_IDS.found}?__scenario=explore-all`);
  await expect(page.getByTestId("found-sentence")).toHaveText(
    `Trigo found this on ${RAFTING_HOST}. Nobody at Yuvoy has checked it yet, so check the details on their page before you go.`,
  );

  await page.goto(`/f/${FOUND_IDS.checked}?__scenario=explore-all`);
  await expect(page.getByTestId("found-sentence")).toHaveText(
    /^A person at Yuvoy checked the date, time, place and price on the organiser's page on [A-Z][a-z]{2}, \d{1,2} [A-Z][a-z]{2}\.$/,
  );
});

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
