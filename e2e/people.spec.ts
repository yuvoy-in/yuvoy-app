import { test, expect, type Page, type TestInfo } from "@playwright/test";
import { PEOPLE_WORDS as W, indiaYear } from "../src/lib/people/people-words";
import {
  ARJUN,
  FRIEND_LINK_CODES as CODES,
  KIRAN,
  MEERA,
  OWN_LINK_CODE,
  PRIYA,
  RAVI,
} from "../mocks/people-fixtures";

/**
 * People (yuvoy-app#222): friend requests, friends, the friend link and the
 * `/add/{code}` page, in a real browser against the mocks.
 *
 * The unit tests hold each part's rules. What only a browser answers is how
 * the parts meet: an answer moves a person between the lists, a new link
 * retires the old code on `/add`, and the age, name and sharing steps lead
 * into the screen one after the other.
 *
 * With no scenario `people` is `off`, as in production. Each `people*`
 * scenario opens it (`mocks/people-handlers.ts` says how). The mock keeps
 * People per scenario and session, so each test signs in as a number of its
 * own, and the scenario is on every page url, after every navigation too.
 */

/* The API's own sentences, shown as sent (`mocks/people-handlers.ts`). */
const UNDER_AGE =
  "Yuvoy is for people 18 and over, so we have closed your account. We have sent you an email about it.";
const AGE_LOCKED =
  "Your age can only be changed by the Yuvoy team. Write to us from Help.";
const ANSWER_PAUSED = "Your use of People is paused for now.";
const ASK_PAUSED = "You can't ask anyone to be your friend for now.";

/** A phone number in any form the account could hold one. */
const PHONE = /\+91|(?<!\d)\d{10}(?!\d)/;

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

const withScenario = (path: string, scenario?: string) =>
  scenario ? `${path}?__scenario=${scenario}` : path;

/** Alerts on the page, without Next's route announcer. */
const alerts = (page: Page) =>
  page.locator('[role="alert"]:not(#__next-route-announcer__)');

const heading = (page: Page, name: string) =>
  page.getByRole("heading", { level: 1, name, exact: true });

const status = (page: Page, text: string) =>
  page.getByRole("status").filter({ hasText: text });

const requestIn = (page: Page, shortName: string) =>
  page.getByTestId("request-in").filter({ hasText: shortName });

const friendRows = (page: Page) => page.getByTestId("friend");

const friendRow = (page: Page, name: string) =>
  friendRows(page).filter({ hasText: name });

const linkCard = (page: Page) =>
  page.getByRole("region", { name: W.linkTitle });

const peopleRow = (page: Page) => page.locator('a[href="/people"]');

/** People under a scenario, once the home has drawn its title. */
async function openPeople(page: Page, scenario = "people") {
  await page.goto(withScenario("/people", scenario));
  await expect(heading(page, W.title)).toBeVisible();
}

/** People under `people`, once the first page of friends is in. */
async function openFullPeople(page: Page) {
  await openPeople(page);
  await expect(friendRows(page)).toHaveCount(20);
}

async function openAdd(page: Page, code: string, scenario = "people") {
  await page.goto(withScenario(`/add/${code}`, scenario));
}

/**
 * Waits until Account knows whether People is open to this caller: the
 * browser's `GET /app-config`, and under a scenario the caller's cohort and
 * `people` from `GET /me`. Then two frames, so a row that would draw has.
 */
function releaseKnown(page: Page, scenario?: string) {
  const config = page.waitForResponse((r) =>
    new URL(r.url()).pathname.endsWith("/app-config"),
  );
  const me = scenario
    ? page.waitForResponse((r) => new URL(r.url()).pathname === "/api/v1/me")
    : Promise.resolve(null);
  return async () => {
    await Promise.all([config, me]);
    await page.evaluate(
      () =>
        new Promise((done) =>
          requestAnimationFrame(() => requestAnimationFrame(done)),
        ),
    );
  };
}

/* ------------------------------------------------------------ Account */

test("the Account row shows with a dot for the requests waiting", async ({
  page,
}, info) => {
  await signIn(page, info);
  await page.goto(withScenario("/account", "people"));
  const row = peopleRow(page);
  await expect(row).toBeVisible();
  await expect(row).toContainText(W.row);
  await expect(row).toContainText(W.rowWaiting(2));
  await expect(row.getByTestId("people-dot")).toBeAttached();
});

for (const scenario of [undefined, "people-outside"]) {
  test(`no Account row where People is closed (${scenario ?? "default"})`, async ({
    page,
  }, info) => {
    await signIn(page, info);
    const known = releaseKnown(page, scenario);
    await page.goto(withScenario("/account", scenario));
    await known();
    await expect(peopleRow(page)).toHaveCount(0);
  });
}

test("People says it is not open yet where the release is closed", async ({
  page,
}, info) => {
  await signIn(page, info);
  await page.goto("/people");
  await expect(heading(page, W.closed.title)).toBeVisible();
  await expect(page.getByText(W.closed.body)).toBeVisible();
  await expect(page.getByTestId("friend")).toHaveCount(0);
});

/* ------------------------------------------------------------- lists */

test("Accept moves a request into Friends", async ({ page }, info) => {
  await signIn(page, info);
  await openFullPeople(page);
  await expect(page.getByText(W.friendCount(23))).toBeVisible();
  const priya = requestIn(page, PRIYA.shortName);
  await expect(priya).toContainText(W.mutual(3));
  await priya.getByRole("button", { name: W.accept }).click();
  await expect(priya).toHaveCount(0);
  await expect(friendRows(page).first()).toContainText("Priya");
  await expect(page.getByText(W.friendCount(24))).toBeVisible();
});

test("Decline removes the request and never says declined", async ({
  page,
}, info) => {
  await signIn(page, info);
  await openFullPeople(page);
  const arjun = requestIn(page, ARJUN.shortName);
  await expect(arjun).not.toContainText("mutual");
  await arjun.getByRole("button", { name: W.decline }).click();
  await expect(arjun).toHaveCount(0);
  await expect(friendRow(page, "Arjun")).toHaveCount(0);
  await expect(page.getByText(W.friendCount(23))).toBeVisible();
  await expect(page.locator("body")).not.toContainText(/\bdeclined\b/i);
});

test("Take back removes a request you sent", async ({ page }, info) => {
  await signIn(page, info);
  await openFullPeople(page);
  const out = page.getByTestId("request-out");
  await expect(out).toHaveCount(1);
  await expect(out).toContainText(MEERA.shortName);
  await out.getByRole("button", { name: W.takeBack }).click();
  await expect(out).toHaveCount(0);
  await expect(page.getByRole("heading", { name: W.requestsOut })).toHaveCount(
    0,
  );
});

test("Unfriend asks first, Keep backs out, Yes removes the friend", async ({
  page,
}, info) => {
  await signIn(page, info);
  await openFullPeople(page);
  const kiran = friendRow(page, "Kiran");
  const ask = page.getByRole("group", { name: W.unfriendAsk("Kiran") });

  await kiran.getByRole("button", { name: W.unfriend, exact: true }).click();
  await expect(ask).toContainText(W.unfriendNote);
  await ask.getByRole("button", { name: W.keep }).click();
  await expect(ask).toHaveCount(0);
  await expect(kiran).toHaveCount(1);

  await kiran.getByRole("button", { name: W.unfriend, exact: true }).click();
  await ask.getByRole("button", { name: W.unfriendConfirm }).click();
  await expect(kiran).toHaveCount(0);
  await expect(page.getByText(W.friendCount(22))).toBeVisible();
  // The friend's link now reads as somebody who is not a friend.
  await openAdd(page, CODES.friends);
  await expect(heading(page, W.add.asks(KIRAN.shortName))).toBeVisible();
});

test("Show more friends loads the second page", async ({ page }, info) => {
  await signIn(page, info);
  await openFullPeople(page);
  await page.getByRole("button", { name: W.more }).click();
  await expect(friendRows(page)).toHaveCount(23);
  await expect(page.getByRole("button", { name: W.more })).toHaveCount(0);
});

test("no phone number shows anywhere on People", async ({ page }, info) => {
  await signIn(page, info);
  await openFullPeople(page);
  await page.getByRole("button", { name: W.more }).click();
  await expect(friendRows(page)).toHaveCount(23);
  expect(await page.locator("body").innerText()).not.toMatch(PHONE);
});

/* ------------------------------------------------------- friend link */

test("a new link changes the link and the old code stops working", async ({
  page,
}, info) => {
  await signIn(page, info);
  await openPeople(page);
  const card = linkCard(page);
  const url = card.getByText(/^https:\/\/app\.yuvoy\.in\/add\//);
  await expect(url).toHaveText(`https://app.yuvoy.in/add/${OWN_LINK_CODE}`);
  await expect(card).toContainText("17 requests left");

  await card.getByRole("button", { name: W.newLink }).click();
  await expect(url).not.toHaveText(new RegExp(OWN_LINK_CODE));
  await expect(card).toContainText("20 requests left");
  const fresh = (await url.innerText()).split("/add/")[1];

  await openAdd(page, OWN_LINK_CODE);
  await expect(heading(page, W.add.unavailable.title)).toBeVisible();
  await openAdd(page, fresh);
  await expect(heading(page, W.add.self)).toBeVisible();
});

test("Switch the link off leaves no link", async ({ page }, info) => {
  await signIn(page, info);
  await openPeople(page);
  const card = linkCard(page);
  await card.getByRole("button", { name: W.switchOff }).click();
  await expect(status(page, W.linkOff)).toBeVisible();
  await expect(card.getByText(/app\.yuvoy\.in\/add\//)).toHaveCount(0);
  await expect(card.getByRole("button", { name: W.getLink })).toBeVisible();

  await openAdd(page, OWN_LINK_CODE);
  await expect(heading(page, W.add.unavailable.title)).toBeVisible();
});

/* ---------------------------------------------------------- settings */

test("the sharing choice and the request emails stay as saved", async ({
  page,
}, info) => {
  await signIn(page, info);
  await openPeople(page);
  const sharing = page.getByRole("form", { name: W.sharingTitle });
  const onlyMe = sharing.getByRole("radio", { name: /^Only me/ });
  const emails = page.getByRole("switch", { name: W.emailsTitle });

  await expect(sharing.getByRole("radio", { name: /^Friends/ })).toBeChecked();
  await expect(sharing).toContainText(W.sharingWhoFriends);
  await onlyMe.check();
  await expect(sharing).toContainText(W.sharingWhoMe);
  await sharing.getByRole("button", { name: W.sharingSave }).click();
  await expect(status(page, W.saved)).toBeVisible();

  await expect(emails).toHaveAttribute("aria-checked", "true");
  await emails.click();
  await expect(emails).toHaveAttribute("aria-checked", "false");

  await openPeople(page);
  await expect(onlyMe).toBeChecked();
  await expect(emails).toHaveAttribute("aria-checked", "false");
});

/* -------------------------------------------------------------- /add */

test("/add reads each fixed code as its state", async ({ page }, info) => {
  await signIn(page, info);
  const cases: [string, string, string?][] = [
    [CODES.requested, W.add.asks(MEERA.shortName), W.add.sent],
    [CODES.friends, KIRAN.shortName.split(" ")[0], W.add.friends],
    [CODES.self, W.add.self],
    [CODES.expired, W.add.expired.title],
    [CODES.full, W.add.full.title],
    [CODES.unavailable, W.add.unavailable.title],
    // Any case, hyphen optional, as the API reads a code.
    [CODES.none.toLowerCase().replace("-", ""), W.add.asks(RAVI.shortName)],
  ];
  for (const [code, title, said] of cases) {
    await test.step(code, async () => {
      await openAdd(page, code);
      await expect(heading(page, title)).toBeVisible();
      if (said) await expect(status(page, said)).toBeVisible();
    });
  }
});

test("/add Send request says Request sent and lists it on People", async ({
  page,
}, info) => {
  await signIn(page, info);
  await openAdd(page, CODES.none);
  await expect(page.getByText(W.add.asksBody)).toBeVisible();
  await page.getByRole("button", { name: W.add.send }).click();
  await expect(status(page, W.add.sent)).toBeVisible();
  await expect(page.getByRole("button", { name: W.add.send })).toHaveCount(0);

  await openPeople(page);
  await expect(
    page.getByTestId("request-out").filter({ hasText: RAVI.shortName }),
  ).toHaveCount(1);
});

test("/add Accept on somebody who asked makes you friends", async ({
  page,
}, info) => {
  await signIn(page, info);
  await openAdd(page, CODES.requestIn);
  await expect(heading(page, W.add.acceptIn(PRIYA.shortName))).toBeVisible();
  await page.getByRole("button", { name: W.accept }).click();
  await expect(status(page, W.add.friends)).toBeVisible();
  await expect(page.getByText(W.add.friendsBody)).toBeVisible();

  await openFullPeople(page);
  await expect(requestIn(page, PRIYA.shortName)).toHaveCount(0);
  await expect(friendRows(page).first()).toContainText("Priya");
});

test("/add with a code that cannot be one never asks the API", async ({
  page,
}, info) => {
  await signIn(page, info);
  const lookups: string[] = [];
  page.on("request", (r) => {
    if (new URL(r.url()).pathname.endsWith("/friend-links/lookup")) {
      lookups.push(r.url());
    }
  });
  await openAdd(page, "no!");
  await expect(heading(page, W.add.unavailable.title)).toBeVisible();
  expect(lookups).toEqual([]);
});

test("/add signed out asks to sign in and says nothing of whose link", async ({
  page,
}) => {
  await openAdd(page, CODES.none, "people-all");
  await expect(heading(page, W.add.signedOut.title)).toBeVisible();
  await expect(
    page.getByRole("link", { name: W.add.signedOut.action }),
  ).toHaveAttribute("href", `/account?next=/add/${CODES.none}`);
  await expect(page.locator("body")).not.toContainText(RAVI.shortName);
});

/* ------------------------------------------------- age, name, sharing */

test("under 18: the API's sentence stays after the sign-out", async ({
  page,
}, info) => {
  await signIn(page, info);
  await openPeopleStep(page, "people-first", W.age.title);
  const signedOut = page.waitForResponse(
    (r) =>
      new URL(r.url()).pathname === "/api/session" &&
      r.request().method() === "DELETE",
  );
  await page.getByLabel(W.age.year).fill(String(indiaYear() - 10));
  await page.getByRole("button", { name: W.age.action }).click();
  await expect(alerts(page).filter({ hasText: UNDER_AGE })).toBeVisible();
  await signedOut;
  await expect(alerts(page).filter({ hasText: UNDER_AGE })).toBeVisible();
  await expect(
    page.getByRole("link", { name: W.age.closedAction }),
  ).toBeVisible();

  await page.goto("/account");
  await expect(page.getByLabel("Your WhatsApp number")).toBeVisible();
});

test("the year turning 18 asks about the birthday, then name and sharing", async ({
  page,
}, info) => {
  await signIn(page, info);
  await openPeopleStep(page, "people-first", W.age.title);
  const year = page.getByLabel(W.age.year);
  const proceed = (name: string) =>
    page.getByRole("button", { name, exact: true }).click();

  await year.fill("19");
  await proceed(W.age.action);
  await expect(page.getByText(W.age.yearBad)).toBeVisible();

  await year.fill(String(indiaYear() - 18));
  const birthday = page.getByRole("group", { name: W.age.birthday });
  await expect(birthday).toBeVisible();
  await proceed(W.age.action);
  await expect(
    alerts(page).filter({ hasText: W.age.birthdayMissing }),
  ).toBeVisible();
  await birthday.getByRole("radio", { name: W.age.yes }).check();
  await proceed(W.age.action);

  await expect(heading(page, W.name.title)).toBeVisible();
  await proceed(W.name.action);
  await expect(page.getByText(W.name.missing)).toBeVisible();
  await page.getByLabel(W.name.field).fill("Asha");
  await proceed(W.name.action);

  await expect(heading(page, W.sharingFirst.title)).toBeVisible();
  await expect(page.getByRole("radio", { name: /^Only me/ })).toBeChecked();
  await page.getByRole("radio", { name: /^Friends/ }).check();
  await page.getByRole("checkbox", { name: W.shareUpcoming(2) }).check();
  await proceed(W.sharingFirst.action);

  await expect(heading(page, W.title)).toBeVisible();
  await expect(page.getByText(W.friendsEmpty)).toBeVisible();
  await expect(status(page, W.noLink)).toBeVisible();
  const sharing = page.getByRole("form", { name: W.sharingTitle });
  await expect(sharing.getByRole("radio", { name: /^Friends/ })).toBeChecked();
  await expect(sharing.getByRole("checkbox")).toHaveCount(0);
});

test("an age already set shows the API's age_locked sentence", async ({
  page,
}, info) => {
  await signIn(page, info);
  await openPeopleStep(page, "people-age-locked", W.age.title);
  await page.getByLabel(W.age.year).fill("1990");
  await page.getByRole("button", { name: W.age.action }).click();
  await expect(alerts(page).filter({ hasText: AGE_LOCKED })).toBeVisible();
  await expect(heading(page, W.age.title)).toBeVisible();
});

/** People under a scenario that opens on a step, once its title shows. */
async function openPeopleStep(page: Page, scenario: string, title: string) {
  await page.goto(withScenario("/people", scenario));
  await expect(heading(page, title)).toBeVisible();
}

/* ---------------------------------------------------------- refusals */

test("paused: answering and asking show the API's sentence", async ({
  page,
}, info) => {
  await signIn(page, info);
  await openPeople(page, "people-paused");
  await expect(status(page, W.requestsPaused)).toBeVisible();
  const priya = requestIn(page, PRIYA.shortName);
  await priya.getByRole("button", { name: W.accept }).click();
  await expect(alerts(page).filter({ hasText: ANSWER_PAUSED })).toBeVisible();
  await expect(priya).toHaveCount(1);

  await openAdd(page, CODES.none, "people-paused");
  await page.getByRole("button", { name: W.add.send }).click();
  await expect(alerts(page).filter({ hasText: ASK_PAUSED })).toBeVisible();
  await expect(status(page, W.add.sent)).toHaveCount(0);
});

test("People down shows the failure with Try again", async ({ page }, info) => {
  await signIn(page, info);
  await page.goto(withScenario("/people", "people-down"));
  const failed = alerts(page).filter({ hasText: W.failed });
  await expect(failed).toBeVisible();
  const retry = page.getByRole("button", { name: W.retry });
  await retry.click();
  await expect(failed).toBeVisible();
  await expect(retry).toBeVisible();
});
