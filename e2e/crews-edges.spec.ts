import { test, expect } from "@playwright/test";
import {
  W,
  NOT_FOUND,
  picked,
  deleteTitle,
  COLLEGE_GANG,
  WHOLE_BATCH,
  NO_SUCH_CREW,
  signIn,
  withScenario,
  alerts,
  heading,
  status,
  crewsSection,
  crewRows,
  crewRow,
  members,
  saveButton,
  backToPeople,
  openPeople,
  openCrew,
  openEditor,
  proxied,
  scenarioHeader,
  closePeople,
  expectPeopleClosed,
  noSideScroll,
} from "./support/crews";

/**
 * Crews (yuvoy-app#227) at the edges: the limits, a crew gone, People
 * closed and crews down. The way these specs work, and the words and ids
 * they share, are in `support/crews.ts`.
 */

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

test("Save answers 404 with People closed: People closed, nothing saved", async ({
  page,
  context,
}, info) => {
  await signIn(page, info);
  await openEditor(page, COLLEGE_GANG.crewId, "people");
  // People closes while the editor is open: every People route answers 404.
  await closePeople(context);

  await page.getByLabel(W.nameLabel).fill("Uni gang");
  await saveButton(page).click();

  // The 404 refreshes People, the list answers 404 too, and the page closes.
  await expectPeopleClosed(page, COLLEGE_GANG.name);
  // The editor itself is gone, not only the crew's name.
  await expect(heading(page, W.editTitle)).toHaveCount(0);
  await expect(page.getByLabel(W.nameLabel)).toHaveCount(0);
  await expect(heading(page, W.goneTitle)).toHaveCount(0);
});

test("Delete answers 404 with People closed: People closed, nothing deleted", async ({
  page,
  context,
}, info) => {
  const path = `/people/crews/${COLLEGE_GANG.crewId}`;
  await signIn(page, info);
  await openCrew(page, COLLEGE_GANG.crewId, "people");
  await expect(heading(page, COLLEGE_GANG.name)).toBeVisible();
  // People closes while the crew's page is open: every People route answers 404.
  await closePeople(context);

  const ask = page.getByRole("group", {
    name: deleteTitle(COLLEGE_GANG.name),
  });
  await page.getByRole("button", { name: W.delete, exact: true }).click();
  await ask.getByRole("button", { name: W.delete, exact: true }).click();

  await expectPeopleClosed(page, COLLEGE_GANG.name);
  await expect(page).toHaveURL((u) => u.pathname === path);
  await expect(heading(page, W.goneTitle)).toHaveCount(0);
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
