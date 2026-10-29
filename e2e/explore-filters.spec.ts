import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { BENGALURU, COORG, FOUND_IDS } from "../mocks/found-fixtures";
import {
  CHECKED_IDS,
  CHECKED_NOW,
  CHECKED_TITLES as T,
} from "../mocks/found-checked-fixtures";

/**
 * Day chips, Free, search, the understood row and the filter sheet on the
 * found feed (yuvoy-app#180, R3-T2), in a real browser against the mocks:
 * the issue's cases 1 to 9, and the card page's footnote on a free card.
 *
 * ## Which world each test runs in
 *
 * `checkedCities` is `off` with no scenario, as on dev and production. Four
 * scenarios open it at `staff`, with `explore` (`mocks/found-handlers.ts`):
 * `checked-staff`, and that plus one shape of answer each in
 * `found-weekend-thin`, `found-free-empty` and `found-search-empty`. At
 * `staff` it is open to a signed-in caller only, so every test signs in.
 *
 * ## The clock
 *
 * Under those scenarios the found routes stand at Friday 21 August 2026,
 * 17:30 in Kolkata (`CHECKED_NOW`), and the browser is put on the same
 * instant, so whatever the page counts on the device agrees with the API.
 * The cards and what each is for are in `mocks/found-checked-fixtures.ts`.
 *
 * ## The words
 *
 * Copied from the issue, the R3 copy table (still waiting for the owner's
 * approval). Every name this file finds a control or a line by is in `UI`
 * below, so a change of words is one edit here.
 *
 * ## What was asked
 *
 * Page one is fetched by the server render, which the browser never sees,
 * and a later page or a refetch by the browser, through the proxy when signed
 * in. So "the page asked for X" is either a request the browser made to
 * `/v1/events` or `/api/v1/events`, or the address the server rendered from,
 * and `expectAsked` accepts both. What the mock then answered (a chip gone,
 * a card in or out) is asserted beside it, which only the server reading the
 * same parameter can explain.
 */

/* ------------------------------------------------------------- the words */

/** Every name and line the spec looks for. Adjust here if the app's words differ. */
const UI = {
  chipGroup: "Filter by day and price",
  today: "Today",
  tomorrow: "Tomorrow",
  weekend: "This weekend",
  free: "Free",
  /** The search field's role: a `type="search"` input is a searchbox. */
  searchRole: "searchbox" as const,
  search: (place: string) => `Search ${place}`,
  clearSearch: "Clear search",
  showing: "Showing",
  remove: (label: string) => `Remove ${label}`,
  searchIn: (place: string) => `Search in ${place}`,
  filters: "Filters",
  /** The sheet, as a dialog named by its title. */
  filterSheet: "Filters",
  /** The sheet's rows, as the report sheet's: a group of radios. */
  groupRole: "group" as const,
  optionRole: "radio" as const,
  budget: "Budget",
  timeOfDay: "Time of day",
  under500: "Under ₹500",
  morning: "Morning",
  clearFilters: "Clear filters",
  showEverything: "Show everything",
  /** The weekend's heading, from the answer's `window`. */
  weekendHeading: (from: string, to: string) =>
    `This weekend · ${from} to ${to}`,
  emptyDay: (day: string, place: string) =>
    `Nothing checked for ${day} in ${place} yet.`,
  emptyFree: (place: string) => `Nothing free in ${place} right now.`,
  /** Straight or curly quotes around the words. */
  emptySearch: (place: string, q: string) =>
    new RegExp(`^Nothing in ${place} matches [“"]${q}[”"]\\.$`),
  comingUp: "Coming up",
  thinLine:
    "Not much this weekend yet. Here's what's coming up in the next two weeks.",
  askLine: "Looking for something specific? Ask the Yuvoy team.",
  askLink: /Ask the Yuvoy team/,
  /** Straight or curly apostrophe. */
  freeFootnote: /^Free means the organiser says there.s no ticket price\.$/,
};

/** The URL state the chips keep (`?when=&free=1&q=`), read on the server. */
const URL_STATE = { when: "when", free: "free", q: "q" };

/**
 * Closes the filter sheet once its choices are made. The issue names no
 * button for it, so Escape, which every sheet here answers.
 */
async function closeFilters(page: Page) {
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: UI.filterSheet })).toBeHidden();
}

/* ------------------------------------------------------------- helpers */

const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

/** The same check `explore-place.spec.ts` runs, once entrances finish. */
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

/** A place's found feed, under a scenario. */
const feedOf = (key: string, scenario: string, extra = "") =>
  `/?place=${key}${extra}&__scenario=${scenario}`;

const cards = (page: Page) => page.locator('[role="feed"] article');

const card = (page: Page, title: string) =>
  page.getByRole("article", { name: title, exact: true });

const heading = (page: Page, place: string) =>
  page.getByRole("heading", {
    level: 1,
    name: `Things to do in ${place}`,
    exact: true,
  });

const chip = (page: Page, name: string) =>
  page
    .getByRole("group", { name: UI.chipGroup })
    .getByRole("button", { name, exact: true });

const searchBox = (page: Page, place: string) =>
  page.getByRole(UI.searchRole, { name: UI.search(place), exact: true });

const filtersButton = (page: Page) =>
  page.getByRole("button", { name: UI.filters, exact: true });

/** The feed shows exactly these cards, in any order. */
async function expectCards(page: Page, titles: string[]) {
  await expect(cards(page)).toHaveCount(titles.length);
  for (const title of titles) await expect(card(page, title)).toBeVisible();
}

/** Every `GET /events` list request the browser makes, from now on. */
function eventsAsked(page: Page): URLSearchParams[] {
  const asked: URLSearchParams[] = [];
  page.on("request", (r) => {
    const url = new URL(r.url());
    if (r.method() === "GET" && /\/v1\/events$/.test(url.pathname)) {
      asked.push(url.searchParams);
    }
  });
  return asked;
}

/** The page asked for what `want` says: from the browser, or by its own address. */
async function expectAsked(
  page: Page,
  asked: URLSearchParams[],
  want: (p: URLSearchParams) => boolean,
  message: string,
) {
  await expect
    .poll(() => asked.some(want) || want(new URL(page.url()).searchParams), {
      message,
    })
    .toBe(true);
}

/** Searches the place from its own field. */
async function search(page: Page, place: string, q: string) {
  const box = searchBox(page, place);
  await box.fill(q);
  await box.press("Enter");
  await page.waitForURL((u) => u.searchParams.get(URL_STATE.q) === q);
}

/** The whole week, as `checked-staff` answers Bengaluru with nothing chosen. */
const WHOLE_WEEK = Object.values(T);

test.beforeEach(async ({ page }) => {
  // The mock's R3 clock: Friday 21 August 2026, 17:30 in Kolkata.
  await page.clock.setFixedTime(new Date(CHECKED_NOW));
  await signIn(page);
});

/* ---------------------------------------------------------------- case 1 */

test("with checkedCities off, there are no chips, search or Filters, and the feed is R2's", async ({
  page,
}) => {
  /*
    `explore-staff` opens the feed and leaves `checkedCities` off. A link
    carrying R3's state changes nothing either: the API ignores it unread.
  */
  for (const extra of ["", "&when=weekend&free=1&q=dive"]) {
    await page.goto(feedOf(BENGALURU, "explore-staff", extra));
    await expect(heading(page, "Bengaluru")).toBeVisible();
    // R2's three Bengaluru cards (`mocks/found-fixtures.ts`).
    await expectCards(page, [
      "Morning cycle ride round Cubbon Park",
      "Filter coffee tasting in Basavanagudi",
      "Open mic poetry night",
    ]);
    await expect(page.getByRole("group", { name: UI.chipGroup })).toHaveCount(
      0,
    );
    await expect(
      page.getByRole(UI.searchRole, { name: UI.search("Bengaluru") }),
    ).toHaveCount(0);
    await expect(filtersButton(page)).toHaveCount(0);
    await expect(page.getByText(UI.showing, { exact: true })).toHaveCount(0);
  }
  await expectAccessible(page);
});

/* ---------------------------------------------------------------- case 2 */

test("one day chip at a time, Free beside it, and the address keeps both", async ({
  page,
}) => {
  await page.goto(feedOf(BENGALURU, "checked-staff"));
  await expectCards(page, WHOLE_WEEK);
  for (const name of [UI.today, UI.tomorrow, UI.weekend, UI.free]) {
    await expect(chip(page, name)).toHaveAttribute("aria-pressed", "false");
  }
  await expect(filtersButton(page)).toBeVisible();
  await expect(searchBox(page, "Bengaluru")).toBeVisible();
  await expectAccessible(page);

  await chip(page, UI.today).click();
  await expect(chip(page, UI.today)).toHaveAttribute("aria-pressed", "true");
  await page.waitForURL((u) => u.searchParams.get(URL_STATE.when) === "today");
  await expectCards(page, [T.fair, T.pottery, T.jazz]);

  // Tomorrow replaces Today: one day at a time.
  await chip(page, UI.tomorrow).click();
  await expect(chip(page, UI.tomorrow)).toHaveAttribute("aria-pressed", "true");
  await expect(chip(page, UI.today)).toHaveAttribute("aria-pressed", "false");
  await page.waitForURL(
    (u) => u.searchParams.get(URL_STATE.when) === "tomorrow",
  );
  await expectCards(page, [T.fair, T.tryDive, T.flea, T.yoga]);

  // Free combines with the day.
  await chip(page, UI.free).click();
  await expect(chip(page, UI.free)).toHaveAttribute("aria-pressed", "true");
  await expect(chip(page, UI.tomorrow)).toHaveAttribute("aria-pressed", "true");
  await page.waitForURL(
    (u) =>
      u.searchParams.get(URL_STATE.when) === "tomorrow" &&
      u.searchParams.get(URL_STATE.free) === "1",
  );
  await expectCards(page, [T.yoga]);
  await expectAccessible(page);

  // A reload is read on the server from the address alone.
  await page.reload();
  await expect(chip(page, UI.tomorrow)).toHaveAttribute("aria-pressed", "true");
  await expect(chip(page, UI.free)).toHaveAttribute("aria-pressed", "true");
  await expect(chip(page, UI.today)).toHaveAttribute("aria-pressed", "false");
  await expectCards(page, [T.yoga]);
});

/* ---------------------------------------------------------------- case 3 */

test("This weekend on a Friday at 17:30 is Friday 17:00 to Sunday, and the heading says the window", async ({
  page,
}) => {
  await page.goto(feedOf(BENGALURU, "checked-staff"));
  await chip(page, UI.weekend).click();
  await page.waitForURL(
    (u) => u.searchParams.get(URL_STATE.when) === "weekend",
  );

  // The API's window, Friday 21 to Sunday 23 August; the page computes none.
  await expect(
    page.getByRole("heading", {
      name: UI.weekendHeading("Fri, 21 Aug", "Sun, 23 Aug"),
      exact: true,
    }),
  ).toBeVisible();
  // The fair runs Thursday to Saturday; the jazz starts Friday at 18:00.
  await expectCards(page, [
    T.fair,
    T.jazz,
    T.tryDive,
    T.flea,
    T.yoga,
    T.diveClub,
    T.theatre,
  ]);
  // Friday at 16:00 is before the weekend; Tuesday is after it.
  await expect(card(page, T.pottery)).toHaveCount(0);
  await expect(card(page, T.comedy)).toHaveCount(0);
  // Seven cards is not thin.
  await expect(
    page.getByRole("heading", { name: UI.comingUp, exact: true }),
  ).toHaveCount(0);
  await expectAccessible(page);
});

/* ---------------------------------------------------------------- case 4 */

test("a thin weekend adds Coming up from the next two weeks, and the ask-the-team line", async ({
  page,
}) => {
  // `found-weekend-thin`: This weekend answers one card, complete.
  await page.goto(feedOf(BENGALURU, "found-weekend-thin"));
  await chip(page, UI.weekend).click();
  await expect(card(page, T.fair)).toBeVisible();

  await expect(
    page.getByRole("heading", { name: UI.comingUp, exact: true }),
  ).toBeVisible();
  await expect(page.getByText(UI.thinLine, { exact: true })).toBeVisible();
  await expect(page.getByText(UI.askLine)).toBeVisible();
  await expect(page.getByRole("link", { name: UI.askLink })).toHaveAttribute(
    "href",
    /^\/help(\?|$)/,
  );

  // From the plain feed: starting in the next 14 days, and not shown already.
  for (const title of [T.jazz, T.comedy, T.heritage, T.birds]) {
    await expect(card(page, title)).toBeVisible();
  }
  await expect(card(page, T.fair)).toHaveCount(1);
  // Monday 7 September is 17 days on.
  await expect(card(page, T.craft)).toHaveCount(0);
  await expectAccessible(page);
});

/* ---------------------------------------------------------------- case 5 */

test("dive saturday shows Adventure and Saturday; removing Saturday searches it as text", async ({
  page,
}) => {
  await page.goto(feedOf(BENGALURU, "checked-staff"));
  const asked = eventsAsked(page);
  await search(page, "Bengaluru", "dive saturday");

  await expect(page.getByText(UI.showing, { exact: true })).toBeVisible();
  await expect(
    page.getByRole("button", { name: UI.remove("Adventure"), exact: true }),
  ).toBeVisible();
  const saturday = page.getByRole("button", {
    name: UI.remove("Saturday"),
    exact: true,
  });
  await expect(saturday).toBeVisible();
  // Adventure on Saturday 22 August, with "dive" in it.
  await expectCards(page, [T.tryDive]);
  await expectAccessible(page);

  await saturday.click();
  await expectAsked(
    page,
    asked,
    (p) =>
      p.get(URL_STATE.q) === "dive saturday" &&
      p.getAll("asText").includes("saturday"),
    "removing Saturday never sent asText=saturday with the same q",
  );
  await expect(saturday).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: UI.remove("Adventure"), exact: true }),
  ).toBeVisible();
  /*
    "saturday" as plain words finds the Saturday Dive Club, which meets on
    Sunday, and no longer finds the try-dive, which is on Saturday. Only the
    mock reading asText=saturday answers that.
  */
  await expectCards(page, [T.diveClub]);
  await expectAccessible(page);
});

/* ---------------------------------------------------------------- case 6 */

test("a search naming another place offers Search in that place", async ({
  page,
}) => {
  await page.goto(feedOf(BENGALURU, "checked-staff"));
  await search(page, "Bengaluru", "rafting in coorg");

  // Nothing in Bengaluru is rafting, and Coorg is a link, never a filter.
  await expect(
    page.getByText(UI.emptySearch("Bengaluru", "rafting in coorg")),
  ).toBeVisible();
  const searchIn = page.getByRole("link", {
    name: UI.searchIn("Coorg"),
    exact: true,
  });
  await expect(searchIn).toBeVisible();
  await expect(searchIn).toHaveAttribute(
    "href",
    /place=karnataka(%2F|\/)coorg/,
  );
  await expect(
    page.getByRole("button", { name: UI.remove("Coorg"), exact: true }),
  ).toHaveCount(0);
  await expectAccessible(page);

  await searchIn.click();
  await page.waitForURL((u) => u.searchParams.get("place") === COORG);
  await expect(heading(page, "Coorg")).toBeVisible();
});

/* ---------------------------------------------------------------- case 7 */

test("Budget and Time of day narrow; no stated price is never under ₹500, and a date-only item is never Morning", async ({
  page,
}) => {
  await page.goto(feedOf(BENGALURU, "checked-staff"));
  const asked = eventsAsked(page);

  await filtersButton(page).click();
  const sheet = page.getByRole("dialog", { name: UI.filterSheet });
  await expect(sheet).toBeVisible();
  await expect(
    sheet.getByRole(UI.groupRole, { name: UI.budget }),
  ).toBeVisible();
  await expect(
    sheet.getByRole(UI.groupRole, { name: UI.timeOfDay }),
  ).toBeVisible();
  // Nothing chosen to begin with.
  for (const option of await sheet.getByRole(UI.optionRole).all()) {
    await expect(option).not.toBeChecked();
  }
  await expectAccessible(page);

  await sheet
    .getByRole(UI.groupRole, { name: UI.budget })
    .getByRole(UI.optionRole, { name: UI.under500, exact: true })
    .check();
  await closeFilters(page);
  await expectAsked(
    page,
    asked,
    (p) => p.get("budget") === "under_500",
    "Under ₹500 never sent budget=under_500",
  );
  // Free counts; the theatre states no price, so it fits no budget.
  await expectCards(page, [
    T.fair,
    T.jazz,
    T.flea,
    T.yoga,
    T.diveClub,
    T.comedy,
    T.birds,
    T.craft,
  ]);
  await expect(card(page, T.theatre)).toHaveCount(0);

  await filtersButton(page).click();
  await sheet
    .getByRole(UI.groupRole, { name: UI.timeOfDay })
    .getByRole(UI.optionRole, { name: UI.morning, exact: true })
    .check();
  await closeFilters(page);
  await expectAsked(
    page,
    asked,
    (p) => p.get("budget") === "under_500" && p.get("timeOfDay") === "morning",
    "Morning never sent timeOfDay=morning beside the budget",
  );
  // The flea market is under ₹500 and has no time, so it is no time of day.
  await expectCards(page, [T.yoga, T.diveClub, T.birds, T.craft]);
  await expect(card(page, T.flea)).toHaveCount(0);
  await expectAccessible(page);

  await filtersButton(page).click();
  await sheet
    .getByRole("button", { name: UI.clearFilters, exact: true })
    .click();
  for (const option of await sheet.getByRole(UI.optionRole).all()) {
    await expect(option).not.toBeChecked();
  }
  await closeFilters(page);
  await expectCards(page, WHOLE_WEEK);
});

test("Free and an under budget never go in one request", async ({ page }) => {
  // The API answers free=true with under_500 or under_1500 with a 400.
  await page.goto(feedOf(BENGALURU, "checked-staff"));
  const asked = eventsAsked(page);
  await chip(page, UI.free).click();
  await expect(chip(page, UI.free)).toHaveAttribute("aria-pressed", "true");

  await filtersButton(page).click();
  const sheet = page.getByRole("dialog", { name: UI.filterSheet });
  const under500 = sheet
    .getByRole(UI.groupRole, { name: UI.budget })
    .getByRole(UI.optionRole, { name: UI.under500, exact: true });
  // Held while Free is on is one honest answer; choosing it and dropping Free is another.
  if (await under500.isEnabled()) await under500.check();
  await closeFilters(page);

  const both = (p: URLSearchParams) =>
    p.get("free") === "true" && /^under_/.test(p.get("budget") ?? "");
  await expect(cards(page).first()).toBeVisible();
  expect(asked.filter(both), "free=true went with an under budget").toEqual([]);
  // No refusal reached the page (`main`: Next's route announcer is an alert too).
  await expect(page.locator("main").getByRole("alert")).toHaveCount(0);
});

/* ---------------------------------------------------------------- case 8 */

test("each empty state says what it is and offers its way back", async ({
  page,
}) => {
  await test.step("a day with nothing checked", async () => {
    // Coorg's cards start on Saturday, so its today is empty.
    await page.goto(feedOf(COORG, "checked-staff"));
    await chip(page, UI.today).click();
    await expect(
      page.getByText(UI.emptyDay("today", "Coorg"), { exact: true }),
    ).toBeVisible();
    await expect(cards(page)).toHaveCount(0);
    await expectAccessible(page);

    await page
      .getByRole("button", { name: UI.showEverything, exact: true })
      .click();
    await expect(
      card(page, "White water rafting on the Barapole"),
    ).toBeVisible();
    await expect(chip(page, UI.today)).toHaveAttribute("aria-pressed", "false");
  });

  await test.step("nothing free", async () => {
    await page.goto(feedOf(BENGALURU, "found-free-empty"));
    await chip(page, UI.free).click();
    await expect(
      page.getByText(UI.emptyFree("Bengaluru"), { exact: true }),
    ).toBeVisible();
    await expect(cards(page)).toHaveCount(0);
    await expectAccessible(page);

    await page
      .getByRole("button", { name: UI.showEverything, exact: true })
      .click();
    await expect(card(page, T.pottery)).toBeVisible();
    await expect(chip(page, UI.free)).toHaveAttribute("aria-pressed", "false");
  });

  await test.step("a search that finds nothing", async () => {
    await page.goto(feedOf(BENGALURU, "found-search-empty"));
    await search(page, "Bengaluru", "jazz");
    await expect(
      page.getByText(UI.emptySearch("Bengaluru", "jazz")),
    ).toBeVisible();
    await expect(cards(page)).toHaveCount(0);
    await expectAccessible(page);

    // The empty state's own Clear search, after the field's.
    await page
      .getByRole("button", { name: UI.clearSearch, exact: true })
      .last()
      .click();
    await expect(searchBox(page, "Bengaluru")).toHaveValue("");
    await expect(card(page, T.jazz)).toBeVisible();
  });
});

/* ---------------------------------------------------------------- case 9 */

test("the chips, a remove control and Filters work from the keyboard", async ({
  page,
}) => {
  await page.goto(feedOf(BENGALURU, "checked-staff"));
  const today = chip(page, UI.today);
  const tomorrow = chip(page, UI.tomorrow);
  const free = chip(page, UI.free);

  await today.focus();
  await page.keyboard.press("Enter");
  await expect(today).toHaveAttribute("aria-pressed", "true");
  // The press keeps the focus where it was, through the new answer.
  await expectCards(page, [T.fair, T.pottery, T.jazz]);
  await expect(today).toBeFocused();

  await page.keyboard.press("Tab");
  await expect(tomorrow).toBeFocused();
  await page.keyboard.press("Space");
  await expect(tomorrow).toHaveAttribute("aria-pressed", "true");
  await expect(today).toHaveAttribute("aria-pressed", "false");

  await free.focus();
  await page.keyboard.press("Space");
  await expect(free).toHaveAttribute("aria-pressed", "true");
  await expectCards(page, [T.yoga]);
  await expectAccessible(page);

  // Filters opens on Enter, and Escape gives the focus back to it.
  const filters = filtersButton(page);
  await filters.focus();
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("dialog", { name: UI.filterSheet }),
  ).toBeVisible();
  await expectAccessible(page);
  await closeFilters(page);
  await expect(filters).toBeFocused();

  // A remove control is a button like any other.
  await page.goto(feedOf(BENGALURU, "checked-staff"));
  await search(page, "Bengaluru", "dive saturday");
  const saturday = page.getByRole("button", {
    name: UI.remove("Saturday"),
    exact: true,
  });
  await saturday.focus();
  await page.keyboard.press("Enter");
  await expect(saturday).toHaveCount(0);
  await expectCards(page, [T.diveClub]);
  await expectAccessible(page);
});

/* ------------------------------------------------------------ the card page */

test("a free card's page says what Free means, and a paid one does not", async ({
  page,
}) => {
  for (const id of [CHECKED_IDS.yoga, FOUND_IDS.free]) {
    await page.goto(`/f/${id}?__scenario=checked-staff`);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByText(UI.freeFootnote)).toBeVisible();
    await expectAccessible(page);
  }

  await page.goto(`/f/${CHECKED_IDS.jazz}?__scenario=checked-staff`);
  await expect(
    page.getByRole("heading", { level: 1, name: T.jazz, exact: true }),
  ).toBeVisible();
  await expect(page.getByText(UI.freeFootnote)).toHaveCount(0);
});
