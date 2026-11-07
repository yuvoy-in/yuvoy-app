import { test, expect } from "@playwright/test";
import { CREATOR_LINKS } from "../mocks/creator-link-fixtures";
import {
  expectAccessible,
  signIn,
  INTRO,
  EMPTY,
  FAILED,
  UNAVAILABLE,
  BOOKED,
  UNLISTED,
  account,
  yourLinks,
  linkRows,
  linkRow,
  counts,
} from "./support/creator-links-kit";

/**
 * A traveller's share links (yuvoy-app#207, R12-T2, the web half of
 * yuvoy-mobile#389): "Your links" on Me (`/account`) and "Get my link" on a
 * past trip (`/trips`, Past), in a real browser against the mocks.
 *
 * The unit tests hold each part's rules. What only a browser answers is how
 * the parts meet: that a trip's slug becomes the experience id the API is
 * sent, that a link made on Trips is the one Me lists, that Copy and Share
 * hand over the `link` exactly as sent, and that the section stays away
 * wherever the release is closed.
 *
 * ## Which world each test runs in
 *
 * With no scenario `creator` is `off`, as in production. Every
 * `creator-*` scenario opens it at `staff` (`mocks/creator-link-handlers.ts`
 * says what each does), and the signed-in number is staff under all of them
 * but `creator-outside`. The links a test makes are kept per session, so each
 * test signs in as a number of its own: two projects running the same walk at
 * once never see each other's links, and a retry starts clean.
 *
 * The case numbers are the issue's (from yuvoy-mobile#389). The words are the
 * issue's and the API's, as no spec here imports app code; the links and
 * their counts come from the mock, so a fixture edit cannot leave this file
 * naming a link that is gone.
 */

/* ---------------------------------------------------------------- the list */

test("Your links: the intro, one row per link newest first, with its counts and latest booking", async ({
  page,
}, testInfo) => {
  await signIn(page, testInfo);
  await page.goto(account("creator-links"));

  const section = yourLinks(page);
  await expect(
    section.getByRole("heading", { name: "Your links" }),
  ).toBeVisible();
  await expect(section.getByText(INTRO, { exact: true })).toBeVisible();

  const rows = linkRows(page);
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(0)).toContainText(BOOKED.target.title);
  await expect(rows.nth(1)).toContainText(UNLISTED.target.title);

  const booked = linkRow(page, BOOKED.target.title);
  await expect(booked.getByText(counts(BOOKED), { exact: true })).toBeVisible();
  // `lastBookingOn` 2026-08-09, as d MMM.
  await expect(
    booked.getByText("Latest booking 9 Aug", { exact: true }),
  ).toBeVisible();
  await expect(booked.getByRole("button", { name: "Copy link" })).toBeVisible();
  await expect(booked.getByRole("button", { name: "Share" })).toBeVisible();

  await expectAccessible(page);
});

test("case 12: a link whose listing is no longer listed stays, with its counts", async ({
  page,
}, testInfo) => {
  await signIn(page, testInfo);
  await page.goto(account("creator-links"));

  const unlisted = linkRow(page, UNLISTED.target.title);
  await expect(
    unlisted.getByText(counts(UNLISTED), { exact: true }),
  ).toBeVisible();
  // No booking through it, so no latest one.
  await expect(unlisted.getByText(/Latest booking/)).toHaveCount(0);
  await expect(
    unlisted.getByRole("button", { name: "Copy link" }),
  ).toBeVisible();
});

test("case 13: no amount, earnings, name or other person's trip date anywhere in Your links", async ({
  page,
}, testInfo) => {
  await signIn(page, testInfo);
  await page.goto(account("creator-links"));
  const section = yourLinks(page);
  await expect(linkRows(page)).toHaveCount(2);

  const text = (await section.innerText()).replace(/\s+/g, " ");
  // Money of any kind.
  expect(text).not.toMatch(
    /₹|\bINR\b|\bRs\.?\s*\d|rupee|earn|payout|commission|income/i,
  );
  // Nobody's name: not the account's, and no booker's.
  expect(text).not.toMatch(/Asha|Menon|Sample Traveller|Guest/);
  // The one date shown is the owner's own latest booking.
  const dates =
    text.match(
      /\b\d{1,2} (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\w*\b/g,
    ) ?? [];
  expect(dates).toEqual(["9 Aug"]);
  expect(text).not.toMatch(/\b20\d\d-\d\d-\d\d\b/);
  // The address is handed over by Copy and Share, never drawn.
  expect(text).not.toContain("/go/");
  for (const link of CREATOR_LINKS) expect(text).not.toContain(link.code);
});

test("Your links: empty, with tools on and no link yet", async ({
  page,
}, testInfo) => {
  await signIn(page, testInfo);
  await page.goto(account("creator-links-empty"));

  const section = yourLinks(page);
  await expect(section.getByText(EMPTY, { exact: true })).toBeVisible();
  await expect(linkRows(page)).toHaveCount(0);
  await expectAccessible(page);
});

test("Your links: an error offers Try again, and Try again reads the list", async ({
  page,
  context,
}, testInfo) => {
  await signIn(page, testInfo);

  /*
    `context.route`, not `page.route`: the mock worker sits between the page
    and the network, and only the context's routes see past it. Every read
    fails until the switch is let go, so an automatic retry cannot hide the
    error state.
  */
  let failing = true;
  await context.route("**/api/v1/me/creator-links", (route) => {
    if (failing && route.request().method() === "GET") {
      return route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({
          error: {
            code: "unavailable",
            message: UNAVAILABLE,
            requestId: "01JE2EMOCK",
          },
        }),
      });
    }
    return route.fallback();
  });

  await page.goto(account("creator-links"));
  const failed = yourLinks(page).getByRole("alert");
  await expect(failed.getByText(FAILED, { exact: true })).toBeVisible();
  const tryAgain = failed.getByRole("button", { name: "Try again" });
  await expect(tryAgain).toBeVisible();
  await expectAccessible(page);

  failing = false;
  await tryAgain.click();
  await expect(linkRows(page)).toHaveCount(2);
  await expect(failed).toHaveCount(0);
});
