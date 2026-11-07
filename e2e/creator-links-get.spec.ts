import { test, expect } from "@playwright/test";
import {
  expectAccessible,
  signIn,
  INTRO,
  EMPTY,
  MADE,
  ALREADY,
  MESSAGE_COPIED,
  NOT_WENT,
  NOT_OPEN_YET,
  RATE_LIMITED,
  UNAVAILABLE,
  NOT_FOUND,
  WENT,
  MISSED,
  BOOKED,
  UNLISTED,
  account,
  linkRows,
  linkRow,
  tripRow,
  openPast,
  releaseKnown,
  isList,
  workerAnswer,
  getMyLink,
  counts,
  shareText,
  recordHandOver,
  handedOver,
} from "./support/creator-links-kit";

/*
  The rest of the share-link walk: Get my link on a past trip, Copy and
  Share, the refusals, and where the section stays hidden. Moved out of
  creator-links.spec.ts as they were (yuvoy-app#243); that file says which
  world each test runs in.
*/

/* ------------------------------------------------------ Get my link, case 1 */

test("case 1: Get my link on a past trip makes the link (201), Your links lists it, and again is the same link (200)", async ({
  page,
}, testInfo) => {
  await signIn(page, testInfo);
  await openPast(page, "creator-links");

  /*
    The trip carries its listing's id (yuvoy-app#278), so the tap reads no
    listing. This one is not served at all, as an unpublished listing is not.
  */
  const listingReads: string[] = [];
  page.context().on("request", (request) => {
    const kind = request.resourceType();
    if (kind !== "fetch" && kind !== "xhr") return;
    const path = new URL(request.url()).pathname;
    if (path.endsWith("/experiences/sunset-cruise-off-radhanagar")) {
      listingReads.push(path);
    }
  });

  const first = await getMyLink(page, WENT);
  expect(first.status).toBe(201);
  expect(listingReads).toEqual([]);
  expect(first.body.target?.title).toBe(WENT);
  const link = first.body.link!;
  expect(link).toMatch(/\/go\/C-[A-Z0-9]{8}$/);
  // Then Copy link and Share, on the trip itself, in place of the button.
  const trip = tripRow(page, WENT);
  await expect(trip.getByText(MADE, { exact: true })).toBeVisible();
  await expect(trip.getByRole("button", { name: "Get my link" })).toHaveCount(
    0,
  );
  await expect(trip.getByRole("button", { name: "Copy link" })).toBeVisible();
  await expect(trip.getByRole("button", { name: "Share" })).toBeVisible();
  await expectAccessible(page);

  // Newest first: the new link heads the list, with nothing counted yet.
  await page.goto(account("creator-links"));
  const rows = linkRows(page);
  await expect(rows).toHaveCount(3);
  await expect(rows.nth(0)).toContainText(WENT);
  await expect(
    linkRow(page, WENT).getByText(
      counts({ opens30Days: 0, opensTotal: 0, bookings: 0 }),
      { exact: true },
    ),
  ).toBeVisible();

  // Again: the link they already had, and still one row for it.
  await openPast(page, "creator-links");
  const again = await getMyLink(page, WENT);
  expect(again.status).toBe(200);
  expect(again.body.link).toBe(link);
  await expect(
    tripRow(page, WENT).getByText(ALREADY, { exact: true }),
  ).toBeVisible();

  await page.goto(account("creator-links"));
  await expect(linkRows(page)).toHaveCount(3);
  await expect(linkRow(page, WENT)).toHaveCount(1);
});

/* ---------------------------------------------------------- Copy and Share */

test("case 2: Copy link and Share hand over the link as sent, and the share text has the title", async ({
  page,
}, testInfo) => {
  await recordHandOver(page, true);
  await signIn(page, testInfo);
  await page.goto(account("creator-links"));

  const row = linkRow(page, BOOKED.target.title);
  await row.getByRole("button", { name: "Copy link" }).click();
  await expect
    .poll(async () => (await handedOver(page)).copied)
    .toEqual([BOOKED.link]);
  // "Copied" for two seconds, then back.
  await expect(row.getByRole("button", { name: "Copied" })).toBeVisible();
  await expect(row.getByRole("button", { name: "Copy link" })).toBeVisible({
    timeout: 5_000,
  });

  // The whole sentence, the link in it as sent, and nothing else.
  await row.getByRole("button", { name: "Share" }).click();
  await expect
    .poll(async () => (await handedOver(page)).shared)
    .toEqual([{ text: shareText(BOOKED) }]);
  // Sharing copies nothing when the browser can share.
  expect((await handedOver(page)).copied).toEqual([BOOKED.link]);
});

test("case 2: with no Web Share API, Share copies instead", async ({
  page,
}, testInfo) => {
  await recordHandOver(page, false);
  await signIn(page, testInfo);
  await page.goto(account("creator-links"));

  const row = linkRow(page, UNLISTED.target.title);
  await row.getByRole("button", { name: "Share" }).click();
  // The whole sentence goes to the clipboard, and the line says so.
  await expect
    .poll(async () => (await handedOver(page)).copied)
    .toEqual([shareText(UNLISTED)]);
  await expect(
    row.getByRole("status").filter({ hasText: MESSAGE_COPIED }),
  ).toHaveText(MESSAGE_COPIED);
  await expectAccessible(page);
});

/* ---------------------------------------------------------------- refusals */

test("a trip the traveller missed (no_show) is offered no Get my link", async ({
  page,
}, testInfo) => {
  await signIn(page, testInfo);
  await openPast(page, "creator-links");

  // The release is open: the trip they went on has the button.
  await expect(
    tripRow(page, WENT).getByRole("button", { name: "Get my link" }),
  ).toBeVisible();
  await expect(page.getByText(MISSED).first()).toBeVisible();
  await expect(
    tripRow(page, MISSED).getByRole("button", { name: "Get my link" }),
  ).toHaveCount(0);
});

for (const { name, scenario, status, sentence } of [
  {
    name: "case 6: someone who did not go (403 not_went)",
    scenario: "creator-links-not-went",
    status: 403,
    sentence: NOT_WENT,
  },
  {
    name: "case 7: not over yet (403 not_open_yet)",
    scenario: "creator-links-not-open-yet",
    status: 403,
    sentence: NOT_OPEN_YET,
  },
  {
    name: "case 10: the 21st link in a day (429)",
    scenario: "creator-links-rate-limited",
    status: 429,
    sentence: RATE_LIMITED,
  },
  {
    name: "links cannot be made right now (503)",
    scenario: "creator-links-down",
    status: 503,
    sentence: UNAVAILABLE,
  },
]) {
  test(`${name}: the API's sentence shows on the trip`, async ({
    page,
  }, testInfo) => {
    await signIn(page, testInfo);
    await openPast(page, scenario);

    const answer = await getMyLink(page, WENT);
    expect(answer.status).toBe(status);
    expect(answer.body.error?.message).toBe(sentence);
    await expect(
      tripRow(page, WENT).getByRole("alert").filter({ hasText: sentence }),
    ).toHaveText(sentence);
    // No link was made, so nothing to copy, and the button stays.
    await expect(
      tripRow(page, WENT).getByRole("button", { name: "Get my link" }),
    ).toBeVisible();
    await expect(
      tripRow(page, WENT).getByRole("button", { name: "Copy link" }),
    ).toHaveCount(0);
    await expectAccessible(page);
  });
}

test("a sign-in that has ended gets the sign-in answer on the trip (401)", async ({
  page,
  context,
}, testInfo) => {
  await signIn(page, testInfo);
  // The API's 401, answered before the proxy so the cookie stays for the page.
  await context.route("**/api/v1/me/creator-links", (route) => {
    if (route.request().method() !== "POST") return route.fallback();
    return route.fulfill({
      status: 401,
      contentType: "application/json",
      body: JSON.stringify({
        error: {
          code: "unauthorized",
          message: "Sign in with your WhatsApp number to see your trips.",
          requestId: "01JE2EMOCK",
        },
      }),
    });
  });
  await openPast(page, "creator-links");

  const answer = await getMyLink(page, WENT);
  expect(answer.status).toBe(401);
  const alert = tripRow(page, WENT).getByRole("alert");
  await expect(
    alert.getByText("Your sign-in has expired", { exact: true }),
  ).toBeVisible();
  await expect(
    alert.getByRole("link", { name: "Sign in again" }),
  ).toHaveAttribute("href", "/account?next=/trips");
  await expectAccessible(page);
});

/* ------------------------------------------------------------------ hidden */

for (const { world, scenario } of [
  { world: "the release off", scenario: undefined },
  {
    world: "the release at staff, the caller not staff",
    scenario: "creator-outside",
  },
]) {
  test(`case 8: with ${world}, the list is 404 and neither Your links nor Get my link shows`, async ({
    page,
  }, testInfo) => {
    await signIn(page, testInfo);

    // What the API says to this caller, through the app's own proxy.
    const listed = await page.request.get("/api/v1/me/creator-links", {
      headers: scenario ? { "x-yuvoy-scenario": scenario } : {},
    });
    expect(listed.status()).toBe(404);
    expect(
      ((await listed.json()) as { error: { message: string } }).error,
    ).toMatchObject({ message: NOT_FOUND });

    // And the app never asks: both pieces wait for the release to be open.
    const asked: string[] = [];
    page.context().on("request", (request) => {
      if (new URL(request.url()).pathname === "/api/v1/me/creator-links") {
        asked.push(request.method());
      }
    });

    const onAccount = releaseKnown(page, scenario);
    await page.goto(account(scenario));
    await expect(
      page.getByRole("button", { name: "Sign out on this device" }),
    ).toBeVisible();
    await onAccount();
    await expect(page.getByRole("heading", { name: "Your links" })).toHaveCount(
      0,
    );
    await expect(page.getByText(INTRO)).toHaveCount(0);

    const onTrips = releaseKnown(page, scenario);
    await openPast(page, scenario);
    await onTrips();
    await expect(page.getByRole("button", { name: "Get my link" })).toHaveCount(
      0,
    );
    expect(asked).toEqual([]);
  });
}

test("case 11: creator tools off and no links, the section is hidden", async ({
  page,
}, testInfo) => {
  await signIn(page, testInfo);

  // Whether there is any link has to be asked, so the answer is waited for.
  const listed = workerAnswer(page, isList);
  await page.goto(account("creator-tools-off"));
  const answer = await listed;
  expect(answer.status()).toBe(200);
  expect(((await answer.json()) as { items: unknown[] }).items).toEqual([]);

  await expect(
    page.getByRole("button", { name: "Sign out on this device" }),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "Your links" })).toHaveCount(
    0,
  );
  await expect(page.getByText(EMPTY)).toHaveCount(0);
  await expect(page.getByText(INTRO)).toHaveCount(0);
  await expectAccessible(page);
});
