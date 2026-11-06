import { test, expect } from "@playwright/test";
import {
  W,
  NOT_FRIEND_NOW,
  picked,
  deleteTitle,
  COLLEGE_GANG,
  OLD_FLATMATES,
  KIRAN_ID,
  SAVED_URL,
  signIn,
  alerts,
  heading,
  status,
  crewsSection,
  crewRows,
  crewRow,
  members,
  saveButton,
  openPeople,
  openCrew,
  openEditor,
  follow,
  proxied,
  scenarioHeader,
} from "./support/crews";

/**
 * Crews (yuvoy-app#227) from People: none yet, a new one, a crew's page,
 * change and delete. The way these specs work, and the words and ids they
 * share, are in `support/crews.ts`.
 */

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
