import { test, expect } from "@playwright/test";
import {
  PLANNER_NUMBER,
  TOKEN,
  asReturningGuest,
  envelope,
  everythingSent,
  expectAccessible,
  fillFirstReply,
  freshNumber,
  openPlan,
  pageAlert,
  planLink,
  routeGuest,
  signIn,
  signInHere,
} from "./support/plan-guest";

/**
 * The guest page, end to end (yuvoy-mobile#373), cases 13 to 18: signed in,
 * the refusals, what leaves the page and the page itself. Kept apart from
 * `plan-guest.spec.ts` so that file stays under 500 lines; its comment says
 * what the suite proves.
 */

const NOT_WORKING = /This plan link is not working\./;
const NO_SCRIPT =
  "Turn on JavaScript to see this plan and reply. Your phone's own browser works too.";
const SEND = { name: "Send my reply" } as const;
const UPDATE = { name: "Update my reply" } as const;

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
    expect(line).toBe(NO_SCRIPT);
  });

  test("with no JavaScript, the page passes axe", async ({ page, request }) => {
    /*
      What a browser with JavaScript off draws: the shell as served, no
      script run, each `<noscript>` shown. Chromium will not draw that
      itself (the test above), so the shell is parsed with scripting off,
      its scripts are taken out and its `<noscript>` tags unwrapped, and it
      is served at `/p/` so its own styles load. axe then reads the line on
      its paper, in its ink.
    */
    const response = await request.get("/p/");
    expect(response.ok()).toBe(true);
    const drawn = await page.evaluate((html) => {
      const doc = new DOMParser().parseFromString(html, "text/html");
      doc.querySelectorAll("script").forEach((s) => s.remove());
      doc.querySelectorAll("noscript").forEach((n) =>
        n.replaceWith(...Array.from(n.childNodes)),
      );
      return `<!doctype html>${doc.documentElement.outerHTML}`;
    }, await response.text());
    await page.route("**/p/", (route) =>
      route.fulfill({ contentType: "text/html; charset=utf-8", body: drawn }),
    );
    await page.goto("/p/");
    await expect(page.getByText(NO_SCRIPT)).toBeVisible();
    await expectAccessible(page);
  });
});
