import {
  test,
  expect,
  type BrowserContext,
  type Locator,
  type Page,
  type Route,
  type TestInfo,
} from "@playwright/test";

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
const W = {
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
  closedNotSaved: "People is closed for now, so this crew was not saved.",
  closedNotDeleted: "People is closed for now, so this crew was not deleted.",
  /* From `people-words.ts`: People closed to this traveller. */
  peopleClosed: "People is not open yet",
} as const;

/** After `not_friends`: the line naming who left, or the one that cannot. */
const NOT_FRIEND_NOW =
  /^(Kiran is not your friend any more, so they cannot be in this crew\.|Someone in this crew is not your friend any more\.)/;

/** The API's own words on a `404`, which a crew screen never shows. */
const NOT_FOUND = "Not found.";

const picked = (n: number) => `${n} of 50 picked`;
const deleteTitle = (name: string) => `Delete ${name}?`;

/* Ids and names from `mocks/crew-fixtures.ts`. */
const crewId = (n: number) =>
  `00000000-0000-4000-9000-${n.toString().padStart(12, "0")}`;
const COLLEGE_GANG = { crewId: crewId(1), name: "College gang" };
const WHOLE_BATCH = { crewId: crewId(201), name: "Whole batch" };
const OLD_FLATMATES = { crewId: crewId(301), name: "Old flatmates" };
/* From `mocks/people-fixtures.ts`: Kiran, the first member of College gang. */
const KIRAN_ID = "00000000-0000-4000-8000-000000000106";
/** No scenario starts with a crew of this id. */
const NO_SUCH_CREW = crewId(999);

/** A crew's page after a save: a uuid, then `?saved=1`. */
const SAVED_URL = /\/people\/crews\/[0-9a-f-]{36}\?saved=1$/;

/** A number of this test's own, the same on every run of it. */
function numberFor(info: TestInfo): string {
  let h = 0;
  for (const ch of `${info.project.name}|${info.testId}|${info.retry}`) {
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

/** Alerts on the page, without Next's route announcer. */
const alerts = (page: Page) =>
  page.locator('[role="alert"]:not(#__next-route-announcer__)');

const heading = (page: Page, name: string) =>
  page.getByRole("heading", { level: 1, name, exact: true });

const status = (page: Page, text: string) =>
  page.getByRole("status").filter({ hasText: text });

const crewsSection = (page: Page) =>
  page.getByRole("region", { name: W.head, exact: true });

const crewRows = (page: Page) => page.getByTestId("crew");

const crewRow = (page: Page, name: string) =>
  crewRows(page).filter({ hasText: name });

const members = (page: Page) => page.getByTestId("crew-member");

const saveButton = (page: Page) =>
  page.getByRole("button", { name: W.save, exact: true });

/** The way back in the page, not the arrow in the chrome (named the same). */
const backToPeople = (page: Page) =>
  page.getByRole("link").filter({ hasText: W.goneAction });

/** People under a scenario, once the home has drawn its title. */
async function openPeople(page: Page, scenario: string) {
  await page.goto(withScenario("/people", scenario));
  await expect(heading(page, W.peopleTitle)).toBeVisible();
}

async function openCrew(page: Page, id: string, scenario: string) {
  await page.goto(withScenario(`/people/crews/${id}`, scenario));
}

async function openEditor(page: Page, id: string, scenario: string) {
  await page.goto(withScenario(`/people/crews/${id}/edit`, scenario));
  await expect(heading(page, W.editTitle)).toBeVisible();
}

/** Taps a link, waits for its path, then opens it again with the scenario. */
async function follow(page: Page, link: Locator, scenario: string) {
  const href = await link.getAttribute("href");
  expect(href).toBeTruthy();
  await link.click();
  await page.waitForURL((u) => u.pathname === href);
  await page.goto(withScenario(href!, scenario));
}

/** A call through the app's own proxy, the same session as the page. */
const proxied = (path: string) => `/api/v1${path}`;
const scenarioHeader = (scenario: string) => ({
  "x-yuvoy-scenario": scenario,
});

/**
 * The API as it answers once People closed to this traveller: `method` on
 * `path` and the release read (`GET /me/people`) are both `404`. Everything
 * else still reaches the mocks. `context.route`, not `page.route`: the mock
 * worker sits between the page and the network, and only the context's
 * routes see past it.
 */
async function closeOn(context: BrowserContext, method: string, path: string) {
  const notFound = (route: Route) =>
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
    });
  await context.route(
    (u) => u.pathname === proxied(path),
    (route) =>
      route.request().method() === method ? notFound(route) : route.fallback(),
  );
  await context.route(
    (u) => u.pathname === proxied("/me/people"),
    (route) =>
      route.request().method() === "GET" ? notFound(route) : route.fallback(),
  );
}

async function noSideScroll(page: Page, where: string) {
  const overflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth >
      document.documentElement.clientWidth,
  );
  expect(overflow, `${where} scrolls horizontally`).toBe(false);
}

/* ---------------------------------------------------------- /people */

test("no crews: the section says what a crew is and offers New crew", async ({
  page,
}, info) => {
  await signIn(page, info);
  await openPeople(page, "people-crews-none");
  const section = crewsSection(page);
  await expect(section.getByText(W.empty, { exact: true })).toBeVisible();
  await expect(section.getByText(W.foot, { exact: true })).toBeVisible();
  await expect(crewRows(page)).toHaveCount(0);
  await expect(
    section.getByRole("link", { name: W.newCrew, exact: true }),
  ).toHaveAttribute("href", "/people/crews/new");
});

test("New crew from People: name and friends, save, the crew and the list", async ({
  page,
}, info) => {
  const scenario = "people-crews-none";
  await signIn(page, info);
  await openPeople(page, scenario);
  await follow(
    page,
    crewsSection(page).getByRole("link", { name: W.newCrew, exact: true }),
    scenario,
  );
  await expect(heading(page, W.newTitle)).toBeVisible();

  // Nothing is sent without a name and a friend.
  await saveButton(page).click();
  await expect(alerts(page).filter({ hasText: W.nameBlank })).toBeVisible();
  await expect(alerts(page).filter({ hasText: W.pickOne })).toBeVisible();

  await page.getByLabel(W.nameLabel).fill("Goa trip");
  await page.getByRole("checkbox", { name: "Kiran", exact: true }).check();
  await page.getByRole("checkbox", { name: "Anjali", exact: true }).check();
  await expect(page.getByText(picked(2), { exact: true })).toBeVisible();
  await saveButton(page).click();

  await page.waitForURL(SAVED_URL);
  await expect(heading(page, "Goa trip")).toBeVisible();
  await expect(status(page, W.saved)).toBeVisible();
  await expect(page.getByText("2 friends", { exact: true })).toBeVisible();
  await expect(members(page)).toContainText(["Kiran", "Anjali"]);

  await openPeople(page, scenario);
  await expect(crewRows(page)).toHaveCount(1);
  await expect(crewRow(page, "Goa trip")).toContainText(
    "2 friends: Kiran and Anjali",
  );
});

/* -------------------------------------------------------- a crew's page */

test("a crew opens from People and lists its members", async ({
  page,
}, info) => {
  await signIn(page, info);
  await openPeople(page, "people");
  const row = crewRow(page, COLLEGE_GANG.name);
  await expect(row).toContainText("4 friends: Kiran, Anjali, Rahul and 1 more");
  await follow(page, row.getByRole("link"), "people");

  await expect(heading(page, COLLEGE_GANG.name)).toBeVisible();
  await expect(page.getByText("4 friends", { exact: true })).toBeVisible();
  await expect(members(page)).toHaveCount(4);
  await expect(members(page)).toContainText([
    "Kiran",
    "Anjali",
    "Rahul",
    "Sneha",
  ]);
  await expect(
    page.getByRole("link", { name: W.edit, exact: true }),
  ).toHaveAttribute("href", `/people/crews/${COLLEGE_GANG.crewId}/edit`);
  await expect(
    page.getByRole("button", { name: W.delete, exact: true }),
  ).toBeVisible();
});

test("a friend unfriended while the editor is open: Save names them, Take them out saves", async ({
  page,
}, info) => {
  const scenario = "people";
  await signIn(page, info);
  await openEditor(page, COLLEGE_GANG.crewId, scenario);
  await expect(page.getByText(picked(4), { exact: true })).toBeVisible();

  // Unfriended in another tab, after the editor read the crew: the API takes
  // Kiran out of the crew too, but this page still has them picked.
  const unfriended = await page.request.delete(
    proxied(`/me/friends/${KIRAN_ID}`),
    { headers: scenarioHeader(scenario) },
  );
  expect(unfriended.status()).toBe(204);

  // A change of members sends them all, Kiran with them: 409 not_friends.
  await page.getByRole("checkbox", { name: "Sneha", exact: true }).uncheck();
  await saveButton(page).click();
  const refused = alerts(page).filter({ hasText: NOT_FRIEND_NOW });
  await expect(refused).toBeVisible();
  await expect(page).toHaveURL(/\/edit\?/);
  await expect(status(page, W.saved)).toHaveCount(0);

  await refused.getByRole("button", { name: W.takeOut }).click();
  await expect(status(page, W.takenOut)).toBeVisible();
  await expect(page.getByText(picked(2), { exact: true })).toBeVisible();
  await saveButton(page).click();

  await page.waitForURL(SAVED_URL);
  await expect(status(page, W.saved)).toBeVisible();
  await expect(page.getByText("2 friends", { exact: true })).toBeVisible();
  await expect(members(page)).toHaveCount(2);
  await expect(members(page)).toContainText(["Anjali", "Rahul"]);
});

test("a crew with nobody in it says so on People and on its page", async ({
  page,
}, info) => {
  const scenario = "people-crews-empty";
  await signIn(page, info);
  await openPeople(page, scenario);
  await expect(crewRow(page, OLD_FLATMATES.name)).toContainText(W.nobody);

  await openCrew(page, OLD_FLATMATES.crewId, scenario);
  await expect(heading(page, OLD_FLATMATES.name)).toBeVisible();
  await expect(members(page)).toHaveCount(0);
  await expect(page.getByText(W.nobody, { exact: true }).first()).toBeVisible();
  await expect(
    page.getByRole("link", { name: W.edit, exact: true }),
  ).toBeVisible();
});

/* ----------------------------------------------------- change and delete */

test("Edit crew changes the name, on the crew and on People", async ({
  page,
}, info) => {
  await signIn(page, info);
  await openCrew(page, COLLEGE_GANG.crewId, "people");
  await expect(heading(page, COLLEGE_GANG.name)).toBeVisible();
  await follow(
    page,
    page.getByRole("link", { name: W.edit, exact: true }),
    "people",
  );

  await expect(heading(page, W.editTitle)).toBeVisible();
  const name = page.getByLabel(W.nameLabel);
  await expect(name).toHaveValue(COLLEGE_GANG.name);
  await expect(page.getByText(picked(4), { exact: true })).toBeVisible();
  await name.fill("Uni gang");
  await saveButton(page).click();

  await page.waitForURL(
    (u) =>
      u.pathname === `/people/crews/${COLLEGE_GANG.crewId}` &&
      u.searchParams.get("saved") === "1",
  );
  await expect(heading(page, "Uni gang")).toBeVisible();
  await expect(status(page, W.saved)).toBeVisible();
  await expect(members(page)).toHaveCount(4);

  await openPeople(page, "people");
  await expect(crewRows(page)).toHaveCount(1);
  await expect(crewRow(page, "Uni gang")).toHaveCount(1);
  await expect(crewRow(page, COLLEGE_GANG.name)).toHaveCount(0);
});

test("Delete crew asks first, Keep backs out, Delete goes back to People", async ({
  page,
}, info) => {
  await signIn(page, info);
  await openCrew(page, COLLEGE_GANG.crewId, "people");
  const ask = page.getByRole("group", {
    name: deleteTitle(COLLEGE_GANG.name),
  });

  await page.getByRole("button", { name: W.delete, exact: true }).click();
  await expect(ask).toContainText(W.deleteBody);
  await ask.getByRole("button", { name: W.deleteKeep, exact: true }).click();
  await expect(ask).toHaveCount(0);
  await expect(heading(page, COLLEGE_GANG.name)).toBeVisible();

  await page.getByRole("button", { name: W.delete, exact: true }).click();
  await ask.getByRole("button", { name: W.delete, exact: true }).click();
  await page.waitForURL((u) => u.pathname === "/people");

  await openPeople(page, "people");
  await expect(crewRows(page)).toHaveCount(0);
  await expect(
    crewsSection(page).getByText(W.empty, { exact: true }),
  ).toBeVisible();
  // Its old address now reads as gone.
  await openCrew(page, COLLEGE_GANG.crewId, "people");
  await expect(heading(page, W.goneTitle)).toBeVisible();
});

/* ------------------------------------------------------------- limits */

test("at 20 crews New crew is not offered and the editor says why", async ({
  page,
}, info) => {
  const scenario = "people-crews-full";
  await signIn(page, info);
  await openPeople(page, scenario);
  const section = crewsSection(page);
  await expect(crewRows(page)).toHaveCount(20);
  await expect(crewRows(page).first()).toContainText("Office lunch");
  await expect(section.getByText(W.limit, { exact: true })).toBeVisible();
  await expect(
    section.getByRole("link", { name: W.newCrew, exact: true }),
  ).toHaveCount(0);

  await page.goto(withScenario("/people/crews/new", scenario));
  await expect(heading(page, W.newTitle)).toBeVisible();
  await expect(page.getByText(W.limit, { exact: true })).toBeVisible();
  await expect(backToPeople(page)).toHaveAttribute("href", "/people");
  await expect(page.getByLabel(W.nameLabel)).toHaveCount(0);
  await expect(saveButton(page)).toHaveCount(0);
});

test("a big crew fits a phone: 50 members, no sideways scroll", async ({
  page,
}, info) => {
  const scenario = "people-crews-big";
  await page.setViewportSize({ width: 360, height: 780 });
  await signIn(page, info);
  await openPeople(page, scenario);
  await expect(crewRow(page, WHOLE_BATCH.name)).toContainText(
    "50 friends: Kiran, Anjali, Rahul and 47 more",
  );
  await noSideScroll(page, "/people");

  await openCrew(page, WHOLE_BATCH.crewId, scenario);
  await expect(heading(page, WHOLE_BATCH.name)).toBeVisible();
  await expect(page.getByText("50 friends", { exact: true })).toBeVisible();
  await expect(members(page)).toHaveCount(50);
  await noSideScroll(page, "the crew's page");

  await openEditor(page, WHOLE_BATCH.crewId, scenario);
  await expect(page.getByText(picked(50), { exact: true })).toBeVisible();
  await expect(page.getByText(W.pickMost, { exact: true })).toBeVisible();
  await noSideScroll(page, "the editor");
});

/* ------------------------------------------------------- gone and down */

test("a crew id that is not in the list shows the gone state", async ({
  page,
}, info) => {
  await signIn(page, info);
  for (const path of [
    `/people/crews/${NO_SUCH_CREW}`,
    `/people/crews/${NO_SUCH_CREW}/edit`,
  ]) {
    await test.step(path, async () => {
      await page.goto(withScenario(path, "people"));
      await expect(heading(page, W.goneTitle)).toBeVisible();
      await expect(page.getByText(W.goneBody, { exact: true })).toBeVisible();
      await expect(backToPeople(page)).toHaveAttribute("href", "/people");
      await expect(status(page, W.saved)).toHaveCount(0);
      await expect(members(page)).toHaveCount(0);
      await expect(saveButton(page)).toHaveCount(0);
      await expect(
        page.getByRole("button", { name: W.delete, exact: true }),
      ).toHaveCount(0);
    });
  }
});

test("a crew deleted elsewhere while editing: Save is 404, the release is read, then gone", async ({
  page,
  context,
}, info) => {
  const scenario = "people";
  await signIn(page, info);
  await openEditor(page, COLLEGE_GANG.crewId, scenario);

  // Deleted on another device: the same session, through the app's proxy.
  const deleted = await page.request.delete(
    proxied(`/me/crews/${COLLEGE_GANG.crewId}`),
    { headers: scenarioHeader(scenario) },
  );
  expect(deleted.status()).toBe(204);

  // Every proxied call from here on, in order.
  const calls: string[] = [];
  context.on("request", (request) => {
    const path = new URL(request.url()).pathname;
    if (path.startsWith(proxied("/"))) {
      calls.push(`${request.method()} ${path.slice(proxied("").length)}`);
    }
  });
  const patch = `PATCH /me/crews/${COLLEGE_GANG.crewId}`;
  // Whether the gone screen was up when the release read after the PATCH
  // left the page. It must not be: the read comes first.
  let goneAtRead: boolean | null = null;
  await context.route(
    (u) => u.pathname === proxied("/me/people"),
    async (route) => {
      if (
        route.request().method() === "GET" &&
        goneAtRead === null &&
        calls.includes(patch)
      ) {
        goneAtRead = await heading(page, W.goneTitle).isVisible();
      }
      await route.fallback();
    },
  );

  await page.getByLabel(W.nameLabel).fill("Uni gang");
  await saveButton(page).click();

  await expect(heading(page, W.goneTitle)).toBeVisible();
  await expect(page.getByText(W.goneBody, { exact: true })).toBeVisible();
  await expect(backToPeople(page)).toHaveAttribute("href", "/people");
  await expect(status(page, W.saved)).toHaveCount(0);
  await expect(saveButton(page)).toHaveCount(0);
  await expect(page.getByText(NOT_FOUND, { exact: true })).toHaveCount(0);

  const patchAt = calls.indexOf(patch);
  expect(patchAt, "the PATCH was sent").toBeGreaterThanOrEqual(0);
  expect(
    calls.indexOf("GET /me/people", patchAt),
    "the release is read after the PATCH",
  ).toBeGreaterThan(patchAt);
  expect(goneAtRead, "the gone screen waits for the release read").toBe(false);
});

test("People closed: a crew's page and its editor show People closed, not the crew", async ({
  page,
}, info) => {
  // The release at staff and this traveller not staff: every crew route 404.
  const scenario = "people-outside";
  await signIn(page, info);
  for (const path of [
    `/people/crews/${COLLEGE_GANG.crewId}`,
    `/people/crews/${COLLEGE_GANG.crewId}/edit`,
  ]) {
    await test.step(path, async () => {
      await page.goto(withScenario(path, scenario));
      await expect(heading(page, W.peopleClosed)).toBeVisible();
      await expect(heading(page, COLLEGE_GANG.name)).toHaveCount(0);
      await expect(status(page, W.saved)).toHaveCount(0);
      await expect(members(page)).toHaveCount(0);
      await expect(saveButton(page)).toHaveCount(0);
      await expect(
        page.getByRole("button", { name: W.delete, exact: true }),
      ).toHaveCount(0);
      await expect(
        page.getByRole("link", { name: W.edit, exact: true }),
      ).toHaveCount(0);
      await expect(
        page.getByRole("button", { name: W.edit, exact: true }),
      ).toHaveCount(0);
      await expect(page.getByText(NOT_FOUND, { exact: true })).toHaveCount(0);
    });
  }
});

test("Save answers 404 with People closed: not saved, said in our words", async ({
  page,
  context,
}, info) => {
  await signIn(page, info);
  await openEditor(page, COLLEGE_GANG.crewId, "people");
  // People closes while the editor is open.
  await closeOn(context, "PATCH", `/me/crews/${COLLEGE_GANG.crewId}`);

  await page.getByLabel(W.nameLabel).fill("Uni gang");
  await saveButton(page).click();

  await expect(
    alerts(page).filter({ hasText: W.closedNotSaved }),
  ).toBeVisible();
  await expect(page).toHaveURL(/\/edit\?/);
  await expect(status(page, W.saved)).toHaveCount(0);
  await expect(heading(page, W.goneTitle)).toHaveCount(0);
  await expect(page.getByText(NOT_FOUND, { exact: true })).toHaveCount(0);
});

test("Delete answers 404 with People closed: not deleted, the crew stays", async ({
  page,
  context,
}, info) => {
  const path = `/people/crews/${COLLEGE_GANG.crewId}`;
  await signIn(page, info);
  await openCrew(page, COLLEGE_GANG.crewId, "people");
  await expect(heading(page, COLLEGE_GANG.name)).toBeVisible();
  // People closes while the crew's page is open.
  await closeOn(context, "DELETE", `/me/crews/${COLLEGE_GANG.crewId}`);

  const ask = page.getByRole("group", {
    name: deleteTitle(COLLEGE_GANG.name),
  });
  await page.getByRole("button", { name: W.delete, exact: true }).click();
  await ask.getByRole("button", { name: W.delete, exact: true }).click();

  await expect(
    alerts(page).filter({ hasText: W.closedNotDeleted }),
  ).toBeVisible();
  await expect(heading(page, COLLEGE_GANG.name)).toBeVisible();
  await expect(page).toHaveURL((u) => u.pathname === path);
  await expect(page.getByText(NOT_FOUND, { exact: true })).toHaveCount(0);
});

test("crews down: the failure with Try again, and the rest of People works", async ({
  page,
}, info) => {
  const scenario = "people-crews-down";
  await signIn(page, info);
  await openPeople(page, scenario);
  await expect(page.getByTestId("friend")).toHaveCount(20);
  const section = crewsSection(page);
  const failed = section.getByRole("alert").filter({ hasText: W.failed });
  await expect(failed).toBeVisible();
  const retry = section.getByRole("button", { name: W.retry, exact: true });
  await retry.click();
  await expect(failed).toBeVisible();
  await expect(retry).toBeVisible();
  await expect(crewRows(page)).toHaveCount(0);

  await openCrew(page, COLLEGE_GANG.crewId, scenario);
  await expect(alerts(page).filter({ hasText: W.failed })).toBeVisible();
  await expect(heading(page, W.failed)).toBeVisible();
  await expect(
    page.getByRole("button", { name: W.retry, exact: true }),
  ).toBeVisible();
  await expect(heading(page, W.goneTitle)).toHaveCount(0);
  await expect(heading(page, COLLEGE_GANG.name)).toHaveCount(0);
});
