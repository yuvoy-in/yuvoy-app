import {
  test,
  expect,
  type Page,
  type Response,
  type TestInfo,
} from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import type { components } from "../src/lib/api/schema.gen";
import { CREATOR_LINKS } from "../mocks/creator-link-fixtures";

type CreatorLink = components["schemas"]["CreatorLink"];

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

const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

/** The same check `redesign-axe.spec.ts` runs, once entrances finish. */
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

/* The words, as the issue writes them. */
const INTRO =
  "Share a link to something you went on. We count opens and bookings through it. The counts are indicative. Yuvoy does not pay for links yet.";
const EMPTY = "No links yet. Get one from a trip you went on.";
const FAILED = "Your links did not load";
const MADE = "Your link is ready. It is in Your links on Account too.";
const ALREADY = "You already have this link. It is in Your links on Account.";
const MESSAGE_COPIED = "Message copied. Paste it where you want to send it.";

/* The API's sentences (yuvoy-mobile#389), shown as sent. */
const NOT_WENT =
  "You can get a link only to something you went on, once it is over.";
const NOT_OPEN_YET = "You can get a link once the event is over.";
const RATE_LIMITED =
  "You have made 20 links today. You can make more tomorrow.";
const UNAVAILABLE = "Links cannot be made on this service right now.";
const NOT_FOUND = "We could not find your links.";

/* The past trips (`PAST_TRIP`, `MISSED_TRIP` in `booking-handlers.ts`). */
const WENT = "Sunset cruise off Radhanagar"; // completed: offered a link
const MISSED = "Dawn birdwatching at Chidiya Tapu"; // no_show: no button

/* The two links the list starts with. */
const [BOOKED, UNLISTED] = CREATOR_LINKS;

const CARD = 'a[href^="/booking"]';

const account = (scenario?: string) =>
  scenario ? `/account?__scenario=${scenario}` : "/account";

const yourLinks = (page: Page) =>
  page.getByRole("region", { name: "Your links" });

/* One row per link (`your-links.tsx`). */
const linkRows = (page: Page) => yourLinks(page).getByTestId("creator-link");

const linkRow = (page: Page, title: string) =>
  linkRows(page).filter({ hasText: title });

const tripRow = (page: Page, title: string) =>
  page.getByRole("listitem").filter({ hasText: title });

/** Trips, Past tab, under a scenario. */
async function openPast(page: Page, scenario?: string) {
  await page.goto(scenario ? `/trips?__scenario=${scenario}` : "/trips");
  await page.getByRole("tab", { name: /past/i }).click();
  await page.waitForSelector(CARD);
  await expect(page.getByText(WENT).first()).toBeVisible();
}

const isList = (r: Response) =>
  new URL(r.url()).pathname === "/api/v1/me/creator-links" &&
  r.request().method() === "GET";

const isMake = (r: Response) =>
  new URL(r.url()).pathname === "/api/v1/me/creator-links" &&
  r.request().method() === "POST";

/** Presses Get my link on a trip and returns the API's answer. */
async function getMyLink(page: Page, title: string) {
  const answered = page.waitForResponse(isMake);
  await tripRow(page, title)
    .getByRole("button", { name: "Get my link" })
    .click();
  const response = await answered;
  return {
    status: response.status(),
    body: (await response.json()) as {
      link?: string;
      target?: { id: string; title: string };
      error?: { message: string };
    },
  };
}

/**
 * The row's counts line, word for word as the issue has it at every count,
 * 1 included ("1 opens", "1 bookings"), as the phone app reads.
 */
const counts = (
  l: Pick<CreatorLink, "opens30Days" | "opensTotal" | "bookings">,
) =>
  `${l.opens30Days} opens in the last 30 days · ${l.opensTotal} in all · ${l.bookings} bookings`;

/** The sentence Share hands over. */
const shareText = (l: CreatorLink) =>
  `I went on ${l.target.title} with Yuvoy. Have a look: ${l.link}`;

/**
 * Records what Copy and Share hand over. `share` false leaves the browser
 * with no Web Share API, so Share has to copy instead.
 */
async function recordHandOver(page: Page, share: boolean) {
  await page.addInitScript((withShare: boolean) => {
    const w = window as unknown as { __copied: string[]; __shared: unknown[] };
    w.__copied = [];
    w.__shared = [];
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: async (text: string) => {
          w.__copied.push(text);
        },
      },
    });
    if (withShare) {
      Object.defineProperty(navigator, "share", {
        configurable: true,
        value: async (data: unknown) => {
          w.__shared.push(data);
        },
      });
      Object.defineProperty(navigator, "canShare", {
        configurable: true,
        value: () => true,
      });
    } else {
      const proto = Navigator.prototype as unknown as Record<string, unknown>;
      delete proto.share;
      delete proto.canShare;
    }
  }, share);
}

const handedOver = (page: Page) =>
  page.evaluate(() => {
    const w = window as unknown as { __copied: string[]; __shared: unknown[] };
    return { copied: w.__copied, shared: w.__shared };
  });

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

/* ------------------------------------------------------ Get my link, case 1 */

test("case 1: Get my link on a past trip makes the link (201), Your links lists it, and again is the same link (200)", async ({
  page,
}, testInfo) => {
  await signIn(page, testInfo);
  await openPast(page, "creator-links");

  const first = await getMyLink(page, WENT);
  expect(first.status).toBe(201);
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

    await page.goto(account(scenario));
    await expect(
      page.getByRole("button", { name: "Sign out on this device" }),
    ).toBeVisible();
    await page.waitForLoadState("networkidle");
    await expect(page.getByRole("heading", { name: "Your links" })).toHaveCount(
      0,
    );
    await expect(page.getByText(INTRO)).toHaveCount(0);

    await openPast(page, scenario);
    await page.waitForLoadState("networkidle");
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
  const listed = page.waitForResponse(isList);
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
