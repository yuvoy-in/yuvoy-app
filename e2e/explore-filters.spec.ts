import { test, expect } from "@playwright/test";
import { BENGALURU, COORG } from "../mocks/found-fixtures";
import { CHECKED_TITLES as T } from "../mocks/found-checked-fixtures";
import {
  UI,
  URL_STATE,
  expectAccessible,
  feedOf,
  card,
  heading,
  chip,
  searchBox,
  filtersButton,
  expectCards,
  eventsAsked,
  expectAsked,
  search,
  WHOLE_WEEK,
  openSignedIn,
} from "./support/explore-filters";

/**
 * Day chips, Free, search and the understood row on the found feed
 * (yuvoy-app#180, R3-T2), in a real browser against the mocks: the issue's
 * cases 1 to 6. Cases 7 to 9 and the card page's footnote are in
 * `explore-filters-more.spec.ts`; what both share, the words included, is in
 * `support/explore-filters.ts`.
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
 */

test.beforeEach(async ({ page }) => {
  await openSignedIn(page);
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
