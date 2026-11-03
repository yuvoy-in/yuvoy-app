import {
  expect,
  type BrowserContext,
  type Locator,
  type Page,
  type TestInfo,
} from "@playwright/test";

/*
  What `crews-flow.spec.ts` and `crews-edges.spec.ts` share, moved out of
  `crews.spec.ts` word for word so each file stays under 500 lines.
*/

/**
 * Crews (yuvoy-app#227): a traveller's own named groups of friends, in the
 * Crews section on `/people`, on a crew's page and in the editor, in a real
 * browser against the mocks.
 *
 * Each `people-crews-*` scenario opens People with its own crews
 * (`mocks/crew-handlers.ts` says what each starts with). The mock keeps
 * crews per scenario and session, so each test signs in as a number of its
 * own. The scenario only reaches the mocks from the page url, so after a tap
 * that navigates, the test opens the new path again with the scenario on it,
 * as `people.spec.ts` does.
 *
 * The words and ids are copied from `src/lib/people/crews-words.ts` and
 * `mocks/crew-fixtures.ts`: a spec does not import the app.
 */

/* Words from `src/lib/people/crews-words.ts` and `people-words.ts`. */
export const W = {
  peopleTitle: "People",
  head: "Crews",
  newCrew: "New crew",
  empty: 'Save a group of friends, like "College gang" or "Office lunch".',
  foot: "Only you see your crews. Nobody is told they are in one.",
  limit:
    "You have 20 crews, the most there can be. Delete one to make another.",
  failed: "Your crews did not load",
  retry: "Try again",
  nobody: "No one in this crew now",
  newTitle: "New crew",
  editTitle: "Edit crew",
  nameLabel: "Crew name",
  nameBlank: "Give your crew a name.",
  pickOne: "Pick at least one friend.",
  pickMost: "A crew can have 50 friends at most.",
  save: "Save crew",
  takeOut: "Take them out",
  takenOut: "Taken out. Save the crew again to keep it.",
  edit: "Edit crew",
  delete: "Delete crew",
  deleteBody: "Your friends stay your friends. Nobody is told.",
  deleteKeep: "Keep",
  saved: "Crew saved",
  goneTitle: "This crew is not there any more",
  goneBody: "It may have been deleted on another device.",
  goneAction: "Back to People",
  deleted: "Crew deleted",
  /* From `people-words.ts`: People closed to this traveller. */
  peopleClosed: "People is not open yet",
} as const;

/** After `not_friends`: the line naming who left, or the one that cannot. */
export const NOT_FRIEND_NOW =
  /^(Kiran is not your friend any more, so they cannot be in this crew\.|Someone in this crew is not your friend any more\.)/;

/** The API's own words on a `404`, which a crew screen never shows. */
export const NOT_FOUND = "Not found.";

export const picked = (n: number) => `${n} of 50 picked`;
export const deleteTitle = (name: string) => `Delete ${name}?`;

/* Ids and names from `mocks/crew-fixtures.ts`. */
const crewId = (n: number) =>
  `00000000-0000-4000-9000-${n.toString().padStart(12, "0")}`;
export const COLLEGE_GANG = { crewId: crewId(1), name: "College gang" };
export const WHOLE_BATCH = { crewId: crewId(201), name: "Whole batch" };
export const OLD_FLATMATES = { crewId: crewId(301), name: "Old flatmates" };
/* From `mocks/people-fixtures.ts`: Kiran, the first member of College gang. */
export const KIRAN_ID = "00000000-0000-4000-8000-000000000106";
/** No scenario starts with a crew of this id. */
export const NO_SUCH_CREW = crewId(999);

/** A crew's page after a save: a uuid, then `?saved=1`. */
export const SAVED_URL = /\/people\/crews\/[0-9a-f-]{36}\?saved=1$/;

/** A number of this test's own, the same on every run of it. */
function numberFor(info: TestInfo): string {
  let h = 0;
  for (const ch of `${info.project.name}|${info.testId}|${info.retry}`) {
    h = (Math.imul(h, 31) + ch.charCodeAt(0)) >>> 0;
  }
  return `9${String(h % 1e9).padStart(9, "0")}`;
}

/** Signs in on Account, as `session-cookie.spec.ts` does. */
export async function signIn(page: Page, info: TestInfo) {
  await page.goto("/account");
  await page.getByLabel("Your WhatsApp number").fill(numberFor(info));
  await page.getByRole("button", { name: "Send me a code" }).click();
  await page.getByLabel("Sign-in code").fill("123456");
  await page.getByRole("button", { name: "Show me my trips" }).click();
  await expect(
    page.getByRole("button", { name: "Sign out on this device" }),
  ).toBeVisible();
}

export const withScenario = (path: string, scenario: string) =>
  `${path}?__scenario=${scenario}`;

/** Alerts on the page, without Next's route announcer. */
export const alerts = (page: Page) =>
  page.locator('[role="alert"]:not(#__next-route-announcer__)');

export const heading = (page: Page, name: string) =>
  page.getByRole("heading", { level: 1, name, exact: true });

export const status = (page: Page, text: string) =>
  page.getByRole("status").filter({ hasText: text });

export const crewsSection = (page: Page) =>
  page.getByRole("region", { name: W.head, exact: true });

export const crewRows = (page: Page) => page.getByTestId("crew");

export const crewRow = (page: Page, name: string) =>
  crewRows(page).filter({ hasText: name });

export const members = (page: Page) => page.getByTestId("crew-member");

export const saveButton = (page: Page) =>
  page.getByRole("button", { name: W.save, exact: true });

/** The way back in the page, not the arrow in the chrome (named the same). */
export const backToPeople = (page: Page) =>
  page.getByRole("link").filter({ hasText: W.goneAction });

/** People under a scenario, once the home has drawn its title. */
export async function openPeople(page: Page, scenario: string) {
  await page.goto(withScenario("/people", scenario));
  await expect(heading(page, W.peopleTitle)).toBeVisible();
}

export async function openCrew(page: Page, id: string, scenario: string) {
  await page.goto(withScenario(`/people/crews/${id}`, scenario));
}

export async function openEditor(page: Page, id: string, scenario: string) {
  await page.goto(withScenario(`/people/crews/${id}/edit`, scenario));
  await expect(heading(page, W.editTitle)).toBeVisible();
}

/** Taps a link, waits for its path, then opens it again with the scenario. */
export async function follow(page: Page, link: Locator, scenario: string) {
  const href = await link.getAttribute("href");
  expect(href).toBeTruthy();
  await link.click();
  await page.waitForURL((u) => u.pathname === href);
  await page.goto(withScenario(href!, scenario));
}

/** A call through the app's own proxy, the same session as the page. */
export const proxied = (path: string) => `/api/v1${path}`;
export const scenarioHeader = (scenario: string) => ({
  "x-yuvoy-scenario": scenario,
});

/** Every People route: they all sit behind the same release gate in the API. */
const PEOPLE_ROUTES = [
  "/me/people",
  "/me/friends",
  "/me/friend-requests",
  "/me/friend-link",
  "/me/crews",
  "/friend-links/lookup",
].map(proxied);

/**
 * The API as it answers once People closed to this traveller: every People
 * route answers `404`, reads and writes alike, as the API's one release gate
 * does (yuvoy-api `peopleGate`). Everything else still reaches the mocks.
 * `context.route`, not `page.route`: the mock worker sits between the page
 * and the network, and only the context's routes see past it.
 */
export async function closePeople(context: BrowserContext) {
  await context.route(
    (u) =>
      PEOPLE_ROUTES.some(
        (p) => u.pathname === p || u.pathname.startsWith(`${p}/`),
      ),
    (route) =>
      route.fulfill({
        status: 404,
        contentType: "application/json",
        body: JSON.stringify({
          error: {
            code: "not_found",
            message: NOT_FOUND,
            requestId: "01JE2EMOCK",
          },
        }),
      }),
  );
}

/** People closed: its title, and nothing of the crew or its controls. */
export async function expectPeopleClosed(page: Page, crewName: string) {
  await expect(heading(page, W.peopleClosed)).toBeVisible();
  await expect(heading(page, crewName)).toHaveCount(0);
  await expect(saveButton(page)).toHaveCount(0);
  await expect(
    page.getByRole("link", { name: W.edit, exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: W.delete, exact: true }),
  ).toHaveCount(0);
  await expect(status(page, W.saved)).toHaveCount(0);
  await expect(page.getByText(W.deleted, { exact: true })).toHaveCount(0);
  await expect(page.getByText(NOT_FOUND, { exact: true })).toHaveCount(0);
}

export async function noSideScroll(page: Page, where: string) {
  const overflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth >
      document.documentElement.clientWidth,
  );
  expect(overflow, `${where} scrolls horizontally`).toBe(false);
}
