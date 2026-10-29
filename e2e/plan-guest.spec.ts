import { test, expect } from "@playwright/test";
import { PLAN_IDS, PLAN_PAYEE } from "../mocks/plan-fixtures";
import {
  KEY_COOKIE,
  PLANNER_NUMBER,
  TOKEN,
  asReturningGuest,
  dropNextReplyAnswer,
  envelope,
  everythingSent,
  expectAccessible,
  fillFirstReply,
  freshNumber,
  guestAnswers,
  guestCalls,
  openPlan,
  pageAlert,
  planLink,
  routeGuest,
  signIn,
  signInHere,
} from "./support/plan-guest";

/**
 * The guest page, end to end (yuvoy-mobile#373, cases 1 to 18).
 *
 * The unit tests prove the page and its route handlers apart. What only a
 * real browser and the real server show is the chain: the token stays in
 * the fragment, the page asks its own handlers with it in a JSON body, the
 * handler keeps the guest key in an httpOnly cookie the page cannot read,
 * and every answer is drawn in place. Every state ends with axe.
 *
 * Scenarios are the by-link mock's (`mocks/plan-link-handlers.ts`); where a
 * case needs an answer no scenario gives (a dropped connection, each
 * `plan_closed` reason), the browser's own request is held or answered here.
 */

const NOT_WORKING = /This plan link is not working\./;
const SEND = { name: "Send my reply" } as const;
const UPDATE = { name: "Update my reply" } as const;

test.describe("case 1: plans off and paused", () => {
  test("plans off reads as a link that is not working", async ({ page }) => {
    await page.goto(planLink("plans-off"));
    await expect(page.getByText(NOT_WORKING)).toBeVisible();
    await expectAccessible(page);
  });

  test("plans paused says so, and Try again asks again", async ({ page }) => {
    const calls = guestCalls(page);
    await page.goto(planLink("plans-paused"));
    await expect(
      page.getByRole("heading", {
        level: 1,
        name: "Plans are paused for a moment.",
      }),
    ).toBeVisible();
    await expect(page.getByText("Try again later.")).toBeVisible();
    await expectAccessible(page);
    await page.getByRole("button", { name: "Try again" }).click();
    await expect(page.getByRole("button", { name: "Try again" })).toBeVisible();
    expect(calls.map((c) => c.route)).toEqual(["view", "view"]);
  });
});

test.describe("case 2: no token, or the wrong shape", () => {
  for (const [what, address] of [
    ["nothing after the #", "/p/"],
    ["a token of the wrong shape", "/p/#yp_tooshort"],
  ] as const) {
    test(`${what}: the not working page, and no request`, async ({ page }) => {
      const calls = guestCalls(page);
      await page.goto(address);
      await expect(page.getByText(NOT_WORKING)).toBeVisible();
      await expect(pageAlert(page)).toBeFocused();
      expect(calls).toEqual([]);
      await expectAccessible(page);
    });
  }
});

test.describe("a first reply", () => {
  test("case 3: no name, or no 18+ tick, is said on that field, and the answers stay", async ({
    page,
  }) => {
    const calls = guestCalls(page);
    await openPlan(page);
    await page.getByRole("radio", { name: "Maybe" }).first().check();
    await page.getByRole("button", SEND).click();
    const tick = page.getByRole("checkbox", { name: "I am 18 or older" });
    await expect(tick).toHaveAttribute("aria-invalid", "true");
    await expect(
      page.getByText("Tick to say you are 18 or over."),
    ).toBeVisible();
    await expectAccessible(page);

    await tick.check();
    await page.getByRole("button", SEND).click();
    const name = page.getByRole("textbox", { name: "Your first name" });
    await expect(name).toBeFocused();
    await expect(name).toHaveAttribute("aria-invalid", "true");
    await expect(
      page.getByText("Use your first name, in letters only."),
    ).toHaveCount(1);
    await expect(
      page.getByRole("radio", { name: "Maybe" }).first(),
    ).toBeChecked();
    await expect(tick).toBeChecked();
    // The plan was read, and nothing was sent.
    expect(calls.map((c) => c.route)).toEqual(["view"]);
    await expectAccessible(page);
  });

  test("case 4 and 6: a reply whose answer was lost is sent again as the same guest, and no answer holds the key", async ({
    page,
    context,
  }) => {
    const calls = guestCalls(page);
    const answers = guestAnswers(page);
    await openPlan(page);
    await fillFirstReply(page, "Meera");

    // The first send reaches the server, and its answer never reaches the page.
    await dropNextReplyAnswer(page);
    await page.getByRole("button", SEND).dblclick();
    await expect(
      page.getByText(/Check your connection and send again/),
    ).toBeVisible();
    await page.getByRole("button", SEND).click();
    await expect(
      page.getByText(/Thanks, Meera\. Your reply is in\./),
    ).toBeVisible();

    const replies = calls.filter((c) => c.route === "reply");
    // A double tap is one send.
    expect(replies).toHaveLength(2);
    expect(replies[1].body.nonce).toBe(replies[0].body.nonce);
    // The same guest: the key the server made first is the one the cookie holds.
    await page.reload();
    await expect(page.getByRole("button", UPDATE)).toBeVisible();

    // Case 6: the key is in an httpOnly cookie, and in nothing the page read.
    for (const body of await Promise.all(answers))
      expect(body).not.toContain("ypk_");
    expect(await page.evaluate(() => document.cookie)).not.toContain("ypk_");
    const cookie = (await context.cookies()).find((c) => c.name === KEY_COOKIE);
    expect(cookie?.httpOnly).toBe(true);
    expect(cookie?.path).toBe("/p/");
    await expectAccessible(page);
  });

  test("case 5: the same nonce with another name says send again, with a new nonce next", async ({
    page,
  }) => {
    const calls = guestCalls(page);
    await openPlan(page);
    await fillFirstReply(page, "Meera");
    await dropNextReplyAnswer(page);
    await page.getByRole("button", SEND).click();
    await expect(page.getByText(/Check your connection/)).toBeVisible();

    await page.getByRole("textbox", { name: "Your first name" }).fill("Mira");
    await page.getByRole("button", SEND).click();
    await expect(
      page.getByText("That reply did not go through. Send it again."),
    ).toBeVisible();
    await expectAccessible(page);
    await page.getByRole("button", SEND).click();
    await expect(page.getByText(/Thanks, Mira\./)).toBeVisible();

    const nonces = calls
      .filter((c) => c.route === "reply")
      .map((c) => c.body.nonce);
    expect(nonces).toHaveLength(3);
    expect(nonces[1]).toBe(nonces[0]);
    expect(nonces[2]).not.toBe(nonces[0]);
  });
});

test.describe("a guest who replied before", () => {
  test("case 7: sees their reply on this phone; another phone is a visitor", async ({
    page,
    context,
    browser,
    baseURL,
  }) => {
    await asReturningGuest(context, baseURL);
    await openPlan(page, "plan-guest-returning");
    await expect(page.getByRole("button", UPDATE)).toBeVisible();
    await expect(
      page.getByRole("radio", { name: "Can", exact: true }).first(),
    ).toBeChecked();
    await expect(
      page.getByRole("textbox", { name: "Your first name" }),
    ).toHaveCount(0);
    await expectAccessible(page);

    const other = await browser.newContext({ baseURL });
    const phone = await other.newPage();
    await openPlan(phone, "plan-guest-returning");
    await expect(phone.getByRole("button", SEND)).toBeVisible();
    await expect(
      phone.getByRole("textbox", { name: "Your first name" }),
    ).toBeVisible();
    await other.close();
  });

  test("case 8: a visitor sees no UPI ID; a member sees the link, amount and UPI ID with a copy control", async ({
    page,
    context,
    browser,
    baseURL,
  }) => {
    const other = await browser.newContext({ baseURL });
    const visitor = await other.newPage();
    await openPlan(visitor, "plan-guest-decided");
    await expect(visitor.getByText(PLAN_PAYEE.upiId)).toHaveCount(0);
    await expect(visitor.getByRole("link", { name: /by UPI/ })).toHaveCount(0);
    await expectAccessible(visitor);
    await other.close();

    await asReturningGuest(context, baseURL);
    await openPlan(page, "plan-guest-decided");
    await expect(
      page.getByRole("link", { name: "Pay ₹450 by UPI" }),
    ).toHaveAttribute("href", /^upi:\/\/pay\?pa=asha%40okaxis&/);
    await expect(
      page.getByText(
        `Button not working? Send ₹450 to ${PLAN_PAYEE.upiId} from any UPI app.`,
      ),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Copy UPI ID" }).first(),
    ).toBeVisible();
    await expectAccessible(page);
  });

  test("case 9: an item somebody took first is said, not refused", async ({
    page,
    context,
    baseURL,
  }) => {
    await asReturningGuest(context, baseURL);
    // Charcoal reads free here, as it was before Kiran's reply landed.
    await routeGuest(page, "view", async (route) => {
      const response = await route.fetch();
      const plan = await response.json();
      plan.items[0] = { id: PLAN_IDS.items[0], label: "Charcoal", mine: false };
      await route.fulfill({ response, json: plan });
    });
    await openPlan(page, "plan-guest-returning");
    await page.getByRole("checkbox", { name: /Charcoal/ }).check();
    await page.getByRole("button", UPDATE).click();
    await expect(
      page.getByText("Charcoal was taken by someone else first."),
    ).toBeVisible();
    await expect(page.getByText("Kiran is bringing it")).toBeVisible();
    await expectAccessible(page);
  });

  test("case 10: after the pick, Are you going?, and a Can't keeps no claims", async ({
    page,
    context,
    baseURL,
  }) => {
    await asReturningGuest(context, baseURL);
    await openPlan(page, "plan-guest-decided");
    await expect(page.getByText(/\. Are you going\?$/)).toBeVisible();
    await expect(page.getByRole("checkbox", { name: /Speaker/ })).toBeChecked();
    await page.getByRole("radio", { name: "Can't make it" }).check();
    await page.getByRole("button", UPDATE).click();
    await expect(page.getByText(/Your reply is in\./)).toBeVisible();
    await expect(
      page.getByRole("checkbox", { name: /Speaker/ }),
    ).not.toBeChecked();
    await expectAccessible(page);
  });

  test("case 11: once started, answers are locked, I've paid still works, and last week's shares can be marked", async ({
    page,
    context,
    baseURL,
  }) => {
    const calls = guestCalls(page);
    await asReturningGuest(context, baseURL);
    await openPlan(page, "plan-guest-started");
    await expect(
      page.getByText("Replies are closed because the plan has started."),
    ).toBeVisible();
    await expect(page.getByRole("radio", { name: "Going" })).toBeDisabled();

    await page
      .getByRole("checkbox", { name: /I've paid my share/ })
      .first()
      .check();
    await page.getByRole("button", UPDATE).click();
    await expect(page.getByText(/Your reply is in\./)).toBeVisible();
    expect(Object.keys(calls.at(-1)?.body.reply as object)).toEqual(["paid"]);

    await expect(
      page.getByRole("heading", { name: "Earlier weeks" }),
    ).toBeVisible();
    // No payee comes with last week's share, so no button pays one.
    await expect(
      page.getByRole("link", { name: "Pay ₹400 by UPI" }),
    ).toHaveCount(0);
    await page
      .getByRole("button", { name: "I've paid this share" })
      .first()
      .click();
    await expect(page.getByText("You marked this paid.")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "I've paid this share" }),
    ).toHaveCount(1);
    await expectAccessible(page);
  });

  test("case 12: Remove my reply asks first, then the guest is gone and their item free", async ({
    page,
  }) => {
    // A name the plan has no one else by, so People shows them gone.
    await openPlan(page);
    await fillFirstReply(page, "Priya");
    await page.getByRole("checkbox", { name: /Paper plates/ }).check();
    await page.getByRole("button", SEND).click();
    await expect(page.getByText(/Thanks, Priya/)).toBeVisible();

    await page.getByRole("button", { name: "Remove my reply" }).click();
    const sheet = page.getByRole("dialog", { name: "Remove my reply" });
    await expect(
      sheet.getByText(
        "Your name and answers will be deleted, and your items freed for others.",
      ),
    ).toBeVisible();
    await expectAccessible(page);
    await sheet.getByRole("button", { name: "Remove my reply" }).click();
    await expect(page.getByText("Your reply is removed.")).toBeVisible();

    await page.reload();
    await expect(page.getByRole("button", SEND)).toBeVisible();
    await expect(
      page.getByText("Replied: Asha, Meera and Kiran"),
    ).toBeVisible();
    await expect(page.getByText(/Priya/)).toHaveCount(0);
    await expect(
      page.getByRole("checkbox", { name: /Paper plates/ }),
    ).not.toBeChecked();
    await expectAccessible(page);
  });
});

test.describe("signed in", () => {
  test("case 13: the planner is offered no Remove my reply, and the API says Cancel the plan instead", async ({
    page,
  }) => {
    await signIn(page, PLANNER_NUMBER);
    await openPlan(page);
    await expect(page.getByText("You're planning this")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Remove my reply" }),
    ).toHaveCount(0);
    const answer = await page.evaluate(async (token) => {
      const response = await fetch("/p/api/leave", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      return { status: response.status, body: await response.text() };
    }, TOKEN);
    expect(answer.status).toBe(409);
    expect(answer.body).toContain("planner_leaves");
    await expectAccessible(page);
  });

  test("case 15: link my reply goes through sign-in and back with the fragment put back, never in a query", async ({
    page,
    context,
    baseURL,
  }) => {
    const seen = everythingSent(page);
    await asReturningGuest(context, baseURL);
    await openPlan(page, "plan-guest-returning");
    await page
      .getByRole("link", { name: "Link my reply to my account" })
      .click();
    await expect(page).toHaveURL(
      /\/account\?next=%2Fp%3F__scenario%3Dplan-guest-returning$/,
    );

    await signInHere(page, freshNumber());
    await expect(page).toHaveURL(
      new RegExp(`/p\\?__scenario=plan-guest-returning#${TOKEN}$`),
    );
    await expect(
      page.getByText("Your reply is linked to your account."),
    ).toBeVisible();
    for (const url of seen.urls) expect(url).not.toContain(TOKEN);
    await expectAccessible(page);
  });

  test("case 15: an account that already answered is told so", async ({
    page,
    context,
    baseURL,
  }) => {
    await signIn(page, freshNumber());
    await asReturningGuest(context, baseURL);
    await routeGuest(page, "link", (route) =>
      route.fulfill({
        status: 409,
        contentType: "application/json",
        body: envelope("conflict", { reason: "already_answered" }),
      }),
    );
    await openPlan(page, "plan-guest-returning");
    await page
      .getByRole("button", { name: "Link my reply to my account" })
      .click();
    await expect(pageAlert(page)).toHaveText(
      "This account already answered this plan.",
    );
    await expectAccessible(page);
  });
});

test.describe("refusals", () => {
  test("case 14: plan_full on a first reply, from the API", async ({
    page,
  }) => {
    await openPlan(page, "plan-guest-full");
    await fillFirstReply(page, "Meera");
    await page.getByRole("button", SEND).click();
    await expect(
      page.getByText(
        "This plan has as many people as Yuvoy allows. Ask Asha if there is room.",
      ),
    ).toBeVisible();
    await expect(pageAlert(page)).toBeFocused();
    await expectAccessible(page);
  });

  test("case 14: each plan_closed reason and 429, with their lines", async ({
    page,
    context,
    baseURL,
  }) => {
    await asReturningGuest(context, baseURL);
    const refusals: [
      number,
      string,
      Record<string, unknown> | undefined,
      string,
    ][] = [
      [
        409,
        "plan_closed",
        { reason: "started" },
        "Replies are closed because the plan has started.",
      ],
      [
        409,
        "plan_closed",
        { reason: "cancelled" },
        "Asha cancelled this plan.",
      ],
      [409, "plan_closed", { reason: "done" }, "This plan has happened."],
      [
        409,
        "plan_closed",
        { reason: "closed" },
        "This plan is no longer available.",
      ],
      [
        429,
        "rate_limited",
        undefined,
        "Lots of replies at once. Wait a minute and send again.",
      ],
    ];
    let next = 0;
    await routeGuest(page, "reply", (route) => {
      const [status, code, details] = refusals[next++];
      return route.fulfill({
        status,
        contentType: "application/json",
        body: envelope(code, details),
      });
    });
    await openPlan(page, "plan-guest-returning");
    for (const [, , , line] of refusals) {
      await page.getByRole("button", UPDATE).click();
      await expect(pageAlert(page)).toHaveText(line);
    }
    await expect(
      page.getByRole("radio", { name: "Can", exact: true }).first(),
    ).toBeChecked();
    await expectAccessible(page);
  });

  test("case 16: a removed guest gets the not working page, and can still report the plan", async ({
    page,
    context,
    baseURL,
  }) => {
    await asReturningGuest(context, baseURL);
    await page.goto(planLink("plan-guest-404"));
    await expect(page.getByText(NOT_WORKING)).toBeVisible();
    await page.getByRole("button", { name: "Report this plan" }).click();
    const sheet = page.getByRole("dialog", { name: "Report this plan" });
    await sheet.getByRole("radio", { name: "It is spam or a scam" }).check();
    await expectAccessible(page);
    await sheet.getByRole("button", { name: "Send report" }).click();
    await expect(sheet.getByText(/Thanks for telling us\./)).toBeVisible();
    await expectAccessible(page);
  });
});

test.describe("what leaves the page", () => {
  test("case 17: the token is in no address asked for, no referrer and no console line", async ({
    page,
  }) => {
    const seen = everythingSent(page);
    await openPlan(page);
    await fillFirstReply(page, "Meera");
    await page.getByRole("button", SEND).click();
    await expect(page.getByText(/Thanks, Meera/)).toBeVisible();
    // The skip link, the first stop on the page, leaves the fragment alone.
    await page.keyboard.press("Tab");
    await page.keyboard.press("Enter");
    expect(await page.evaluate(() => window.location.hash)).toBe(`#${TOKEN}`);

    for (const url of seen.urls) expect(url).not.toContain(TOKEN);
    for (const line of seen.console) expect(line).not.toContain(TOKEN);
    // Analytics never starts on /p, so nothing goes to it at all.
    expect(seen.urls.filter((url) => /posthog|\/ingest\//.test(url))).toEqual(
      [],
    );
    await expectAccessible(page);
  });
});

test.describe("case 18: the page itself", () => {
  test("no sideways scroll at 320 px", async ({ page, context, baseURL }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await asReturningGuest(context, baseURL);
    await openPlan(page, "plan-guest-decided");
    const overflow = await page.evaluate(
      () =>
        document.documentElement.scrollWidth >
        document.documentElement.clientWidth,
    );
    expect(overflow).toBe(false);
    await expectAccessible(page);
  });

  test("with no JavaScript, the no-script line", async ({ page, request }) => {
    /*
      Read from the shell as served, parsed with scripting off. Chromium in
      a context with `javaScriptEnabled: false` drew nothing of the
      `<noscript>` (29 Oct: the built HTML held the line, the page showed
      none), so looking for it on screen there tests the browser, not the
      page. `DOMParser` parses with scripting off, as a browser with
      JavaScript off does, so the line must be a paragraph in `main`.
    */
    const response = await request.get("/p/");
    expect(response.ok()).toBe(true);
    const line = await page.evaluate(
      (html) =>
        new DOMParser()
          .parseFromString(html, "text/html")
          .querySelector("main noscript > p")?.textContent ?? null,
      await response.text(),
    );
    expect(line).toBe(
      "Turn on JavaScript to see this plan and reply. Your phone's own browser works too.",
    );
  });
});
