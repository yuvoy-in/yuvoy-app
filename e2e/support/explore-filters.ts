import { expect, type Locator, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import {
  CHECKED_NOW,
  CHECKED_TITLES as T,
} from "../../mocks/found-checked-fixtures";

/**
 * What the two specs of yuvoy-app#180 share (`explore-filters.spec.ts`,
 * cases 1 to 6, and `explore-filters-more.spec.ts`, cases 7 to 9 and the
 * card page's footnote): the words they find controls and lines by, the way
 * in, and the watchers that prove what the page asked for.
 *
 * ## The words
 *
 * Copied from `src/lib/found/found-words.ts` (the R3 copy table, still
 * waiting for the owner's approval), since no spec imports app code. Every
 * name either spec finds a control or a line by is in `UI` below, so a change
 * of words is one edit here.
 *
 * ## What was asked
 *
 * Page one is the server render's. Every change after it (a chip, the sheet,
 * a search, a removed chip) is written into the address in place, with
 * `replaceState`, and read by the browser, through the proxy while signed
 * in. So `expectAsked` watches the browser's requests to `/v1/events` or
 * `/api/v1/events`, and `expectAddress` polls the address. What the mock then
 * answered (a chip gone, a card in or out) is asserted beside it.
 */

/* ------------------------------------------------------------- the words */

/** Every name and line the specs look for (`found-words.ts`). */
export const UI = {
  chipGroup: "Filter by day and price",
  today: "Today",
  tomorrow: "Tomorrow",
  weekend: "This weekend",
  free: "Free",
  search: (place: string) => `Search ${place}`,
  clearSearch: "Clear search",
  showing: "Showing",
  remove: (label: string) => `Remove ${label}`,
  searchIn: (place: string) => `Search in ${place}`,
  /** "Filters", or "Filters, 2 on" once rows of the sheet narrow. */
  filters: /^Filters/,
  filtersOn: (on: number) => (on > 0 ? `Filters, ${on} on` : "Filters"),
  filterSheet: "Filters",
  budget: "Budget",
  timeOfDay: "Time of day",
  under500: "Under ₹500",
  morning: "Morning",
  afternoon: "Afternoon",
  clearFilters: "Clear filters",
  showResults: "Show results",
  showEverything: "Show everything",
  /** The window's heading, from the answer's `window`. */
  dayHeading: (day: string, on: string) => `${day} · ${on}`,
  weekendHeading: (from: string, to: string) =>
    `This weekend · ${from} to ${to}`,
  emptyDay: (day: string, place: string) =>
    `Nothing checked for ${day} in ${place} yet.`,
  emptyFree: (place: string) => `Nothing free in ${place} right now.`,
  emptyFilters: (place: string) => `Nothing matches those filters in ${place}.`,
  emptySearch: (place: string, q: string) =>
    `Nothing in ${place} matches “${q}”.`,
  comingUp: "Coming up",
  thinLine:
    "Not much this weekend yet. Here's what's coming up in the next two weeks.",
  askLine: "Looking for something specific? Ask the Yuvoy team.",
  askLink: "Ask the Yuvoy team.",
  freeFootnote: "Free means the organiser says there's no ticket price.",
};

/* ------------------------------------------------------------- helpers */

export const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

/** The same check `explore-place.spec.ts` runs, once entrances finish. */
export async function expectAccessible(page: Page) {
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
export async function signIn(page: Page) {
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
export const feedOf = (key: string, scenario: string, extra = "") =>
  `/?place=${key}${extra}&__scenario=${scenario}`;

/**
 * Opens a place's found feed and waits until React has claimed the search
 * field. Before then a chip press does nothing and Enter in the field is the
 * form's own GET, which keeps no `__scenario` and so leaves the mocked world.
 */
export async function openFeed(
  page: Page,
  key: string,
  scenario: string,
  extra = "",
) {
  await page.goto(feedOf(key, scenario, extra));
  await page.waitForFunction(() => {
    const box = document.querySelector('[role="search"] input[type="search"]');
    return !!box && Object.keys(box).some((k) => k.startsWith("__reactProps$"));
  });
}

/** The place's own list: the first feed, never a thin weekend's Coming up. */
export const cards = (page: Page) =>
  page.locator('[role="feed"]').first().locator("article");

export const card = (page: Page, title: string) =>
  page.getByRole("article", { name: title, exact: true });

export const heading = (page: Page, place: string) =>
  page.getByRole("heading", {
    level: 1,
    name: `Things to do in ${place}`,
    exact: true,
  });

export const chip = (page: Page, name: string) =>
  page
    .getByRole("group", { name: UI.chipGroup, exact: true })
    .getByRole("button", { name, exact: true });

export const searchBox = (page: Page, place: string) =>
  page
    .getByRole("search")
    .getByRole("searchbox", { name: UI.search(place), exact: true });

export const filtersButton = (page: Page) =>
  page.getByRole("button", { name: UI.filters });

export const filterSheet = (page: Page) =>
  page.getByRole("dialog", { name: UI.filterSheet, exact: true });

/**
 * A choice in one of the sheet's rows: a radio (`aria-checked`) in a group
 * named by the row. A second tap on the checked one clears the row.
 */
export const option = (page: Page, row: string, name: string) =>
  filterSheet(page)
    .getByRole("group", { name: row, exact: true })
    .getByRole("radio", { name, exact: true });

/** Taps a choice in the sheet; it shows as checked in the draft. */
export async function pick(page: Page, row: string, name: string) {
  await option(page, row, name).click();
  await expect(option(page, row, name)).toBeChecked();
}

/** Show results: the sheet's choices apply then, and never on Escape. */
export async function applyFilters(page: Page) {
  await filterSheet(page)
    .getByRole("button", { name: UI.showResults, exact: true })
    .click();
  await expect(filterSheet(page)).toBeHidden();
}

/** The row of what a search was taken to mean (`found-understood`). */
export const understood = (page: Page) =>
  page.getByRole("group", { name: UI.showing, exact: true });

export const removeChip = (page: Page, label: string) =>
  understood(page).getByRole("button", {
    name: UI.remove(label),
    exact: true,
  });

/** The heading over a chosen day's cards (`found-window`). */
export const windowHeading = (page: Page) => page.getByTestId("found-window");

/** An empty state, found by its line, holding its own way back. */
export const emptyState = (page: Page, line: string): Locator =>
  page.getByText(line, { exact: true }).locator("xpath=..");

/** A thin weekend's Coming up list. */
export const comingUp = (page: Page) =>
  page
    .getByTestId("found-coming-up")
    .getByRole("feed", { name: UI.comingUp, exact: true });

/** The feed shows exactly these cards, in any order. */
export async function expectCards(page: Page, titles: string[]) {
  await expect(cards(page)).toHaveCount(titles.length);
  for (const title of titles) {
    await expect(cards(page).and(card(page, title))).toBeVisible();
  }
}

/** The address says what `want` says; written in place, so polled. */
export async function expectAddress(
  page: Page,
  want: (p: URLSearchParams) => boolean,
  message: string,
) {
  await expect
    .poll(() => want(new URL(page.url()).searchParams), { message })
    .toBe(true);
}

/** Every `GET /events` list request the browser makes, from now on. */
export function eventsAsked(page: Page): URLSearchParams[] {
  const asked: URLSearchParams[] = [];
  page.on("request", (r) => {
    const url = new URL(r.url());
    if (r.method() === "GET" && /\/v1\/events$/.test(url.pathname)) {
      asked.push(url.searchParams);
    }
  });
  return asked;
}

/** The browser asked `GET /events` for what `want` says, from request `from` on. */
export async function expectAsked(
  asked: URLSearchParams[],
  want: (p: URLSearchParams) => boolean,
  message: string,
  from = 0,
) {
  await expect.poll(() => asked.slice(from).some(want), { message }).toBe(true);
}

/** Searches the place from its own field, sent with Enter. */
export async function search(page: Page, place: string, q: string) {
  const box = searchBox(page, place);
  await box.fill(q);
  await box.press("Enter");
  await expectAddress(
    page,
    (p) => p.get("q") === q && p.has("__scenario"),
    `q=${q} never reached the address, or the scenario was lost`,
  );
}

/** The whole week, as `found-checked` answers Bengaluru with nothing chosen. */
export const WHOLE_WEEK = Object.values(T);

/**
 * Every test's way in: the browser on the mock's R3 clock, Friday 21 August
 * 2026 at 17:30 in Kolkata, then signed in, since `checkedCities` at `staff`
 * is open to a signed-in caller only.
 */
export async function openSignedIn(page: Page) {
  await page.clock.setFixedTime(new Date(CHECKED_NOW));
  await signIn(page);
}
