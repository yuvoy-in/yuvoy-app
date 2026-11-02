import {
  test,
  expect,
  type BrowserContext,
  type Page,
  type TestInfo,
} from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

/**
 * Ways in on Account (yuvoy-app#229, the web half of yuvoy-mobile#340),
 * walked in a real browser against the real `/api/session/link` route.
 *
 * `email-sign-in` opens the email door on a number-only account;
 * `email-door` is an email account with the door shut, and
 * `email-sign-in-email-door` the same account with it open. What a link
 * answers is chosen by what is added (`mocks/ways-in-handlers.ts`): an
 * address starting "taken", "kind" or "stale", the number +91 98111 00409
 * (taken) or +91 98111 00503 (door shut), or a code other than 123456.
 */

const CODE = "123456";
const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8099/v1";

/** A number of this test's own, the same on every run of it. */
function numberFor(info: TestInfo): string {
  let h = 0;
  for (const ch of `${info.project.name}|${info.testId}|${info.retry}`) {
    h = (Math.imul(h, 31) + ch.charCodeAt(0)) >>> 0;
  }
  return `9${String(h % 1e9).padStart(9, "0")}`;
}

async function signIn(page: Page, info: TestInfo, scenario: string) {
  await page.goto("/account");
  await page.getByLabel("Your WhatsApp number").fill(numberFor(info));
  await page.getByRole("button", { name: "Send me a code" }).click();
  await page.getByLabel("Sign-in code").fill(CODE);
  await page.getByRole("button", { name: "Show me my trips" }).click();
  await expect(
    page.getByRole("button", { name: "Sign out on this device" }),
  ).toBeVisible();
  await page.goto(`/account?__scenario=${scenario}`);
  await expect(waysIn(page)).toBeVisible();
}

const waysIn = (page: Page) => page.getByRole("region", { name: "Ways in" });

/** What the page sent and got back, seen past the mock worker. */
function watch(context: BrowserContext) {
  const seen = {
    codeRequests: [] as Array<string | undefined>,
    links: [] as unknown[],
    linkAnswers: [] as string[],
    meReads: 0,
    configReads: 0,
  };
  context.on("request", (request) => {
    const path = new URL(request.url()).pathname;
    if (path.endsWith("/me/sign-in/request")) {
      seen.codeRequests.push(request.headers()["authorization"]);
    }
    if (path === "/api/session/link") seen.links.push(request.postDataJSON());
    if (path === "/api/v1/me") seen.meReads += 1;
    if (path.endsWith("/app-config")) seen.configReads += 1;
  });
  context.on("response", async (response) => {
    if (new URL(response.url()).pathname !== "/api/session/link") return;
    seen.linkAnswers.push(await response.text().catch(() => ""));
  });
  return seen;
}

async function sendEmailCode(page: Page, address: string) {
  await waysIn(page).getByRole("button", { name: "Add an email" }).click();
  await page.getByLabel("Email", { exact: true }).fill(address);
  await page.getByRole("button", { name: "Send me a code" }).click();
  await expect(
    page.getByRole("heading", { name: "Check your email" }),
  ).toBeVisible();
}

async function addWithCode(page: Page, submit: string, code = CODE) {
  await page.getByLabel("Code", { exact: true }).fill(code);
  await page.getByRole("button", { name: submit }).click();
}

const added = (page: Page) =>
  page
    .getByRole("status")
    .filter({ hasText: "Added. You can sign in with it from now on." });

test("an email account with the door shut shows its ways and offers none", async ({
  page,
}, info) => {
  await signIn(page, info, "email-door");

  await expect(waysIn(page).getByText("asha@example.com")).toBeVisible();
  await expect(waysIn(page).getByRole("button")).toHaveCount(0);
});

test("adding an email: the code goes without a session, the link with one, and Ways in names it", async ({
  page,
  context,
}, info) => {
  const seen = watch(context);
  await signIn(page, info, "email-sign-in");

  await sendEmailCode(page, "ravi@example.com");
  expect(seen.codeRequests.length).toBeGreaterThan(0);
  expect(seen.codeRequests.every((auth) => auth === undefined)).toBe(true);

  expect(
    (
      await new AxeBuilder({ page })
        .include("section")
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
        .analyze()
    ).violations,
  ).toEqual([]);

  // The add button must not come back for a moment beside "Added.".
  await page.evaluate(() => {
    const w = window as unknown as { offeredAgain: boolean };
    w.offeredAgain = false;
    new MutationObserver(() => {
      for (const b of document.querySelectorAll("button")) {
        if (b.textContent?.trim() === "Add an email") w.offeredAgain = true;
      }
    }).observe(document.body, {
      subtree: true,
      childList: true,
      characterData: true,
    });
  });
  const readsBefore = seen.meReads;
  await addWithCode(page, "Add this email");

  await expect(added(page)).toBeVisible();
  await expect(waysIn(page).getByText("ravi@example.com")).toBeVisible();
  expect(seen.links).toEqual([{ email: "ravi@example.com", code: CODE }]);
  expect(seen.meReads).toBeGreaterThan(readsBefore);
  expect(
    await page.evaluate(
      () => (window as unknown as { offeredAgain: boolean }).offeredAgain,
    ),
  ).toBe(false);

  // No session token reaches the page, in an answer or in storage.
  expect(seen.linkAnswers.join("")).not.toMatch(/sess_|sessionToken/);
  const stored = await page.evaluate(
    () =>
      JSON.stringify(localStorage) +
      JSON.stringify(sessionStorage) +
      document.cookie,
  );
  expect(stored).not.toContain("sess_");
});

test("adding a number: Send waits for digits past the dial code", async ({
  page,
  context,
}, info) => {
  const seen = watch(context);
  await signIn(page, info, "email-sign-in-email-door");

  await waysIn(page).getByRole("button", { name: "Add a number" }).click();
  const send = page.getByRole("button", { name: "Send me a code" });
  await expect(send).toBeDisabled();
  await page.getByLabel("Number", { exact: true }).fill("9811122233");
  await expect(send).toBeEnabled();
  await send.click();
  await addWithCode(page, "Add this number");

  await expect(added(page)).toBeVisible();
  await expect(waysIn(page).getByText("+919811122233")).toBeVisible();
  expect(seen.links).toEqual([{ phone: "+919811122233", code: CODE }]);
});

test("a taken address offers another, with the code cleared", async ({
  page,
}, info) => {
  await signIn(page, info, "email-sign-in");
  await sendEmailCode(page, "taken@example.com");
  await addWithCode(page, "Add this email");

  const alert = page
    .getByRole("alert")
    .filter({ hasText: "That address is taken" });
  await expect(alert).toBeVisible();
  await alert.getByRole("button", { name: "Use another email" }).click();

  await expect(page.getByLabel("Email", { exact: true })).toBeVisible();
  await page.getByLabel("Email", { exact: true }).fill("ravi@example.com");
  await page.getByRole("button", { name: "Send me a code" }).click();
  await expect(page.getByLabel("Code", { exact: true })).toHaveValue("");
});

test("one email already there: Close, and the account is read again", async ({
  page,
  context,
}, info) => {
  const seen = watch(context);
  await signIn(page, info, "email-sign-in");
  await sendEmailCode(page, "kind@example.com");
  const readsBefore = seen.meReads;
  await addWithCode(page, "Add this email");

  const alert = page.getByRole("alert").filter({
    hasText: "Nothing was added",
  });
  await expect(alert).toContainText("This account already has an email.");
  await expect.poll(() => seen.meReads).toBeGreaterThan(readsBefore);
  await alert.getByRole("button", { name: "Close" }).click();
  await expect(page.getByLabel("Code", { exact: true })).toHaveCount(0);
});

test("a session too old to add to offers signing out, and signs out", async ({
  page,
}, info) => {
  await signIn(page, info, "email-sign-in");
  await sendEmailCode(page, "stale@example.com");
  await addWithCode(page, "Add this email");

  const alert = page
    .getByRole("alert")
    .filter({ hasText: "Sign in again first" });
  await alert
    .getByRole("button", { name: "Sign out and sign in again" })
    .click();
  await expect(page.getByLabel("Your WhatsApp number")).toBeVisible();
});

test("a wrong code stays on the code, still signed in", async ({
  page,
}, info) => {
  await signIn(page, info, "email-sign-in");
  await sendEmailCode(page, "ravi@example.com");
  await addWithCode(page, "Add this email", "000000");

  await expect(page.getByLabel("Code", { exact: true })).toHaveAttribute(
    "aria-invalid",
    "true",
  );
  await expect(
    page.getByRole("button", { name: "Sign out on this device" }),
  ).toBeVisible();
  await expect(added(page)).toHaveCount(0);
});

test("a session gone by the time of the code ends on the sign-in form", async ({
  page,
  context,
}, info) => {
  await signIn(page, info, "email-sign-in");
  await sendEmailCode(page, "ravi@example.com");
  await context.clearCookies();
  await addWithCode(page, "Add this email");

  await expect(page.getByLabel("Your WhatsApp number")).toBeVisible();
});

test("the door shut on the add: said, the config read again, and nothing offered", async ({
  page,
  context,
}, info) => {
  const seen = watch(context);
  await signIn(page, info, "email-sign-in-email-door");

  // The config as the mock serves it, with the door then shut.
  const open = await page.evaluate(
    async (url) =>
      (
        await fetch(url, {
          headers: { "x-yuvoy-scenario": "email-sign-in-email-door" },
        })
      ).json(),
    `${API}/app-config`,
  );
  let shut = false;
  await context.route("**/app-config*", (route) =>
    shut
      ? route.fulfill({
          contentType: "application/json",
          body: JSON.stringify({
            ...open,
            features: {
              ...open.features,
              signIn: { ...open.features.signIn, email: false },
            },
          }),
        })
      : route.fallback(),
  );

  await waysIn(page).getByRole("button", { name: "Add a number" }).click();
  await page.getByLabel("Number", { exact: true }).fill("9811100503");
  await page.getByRole("button", { name: "Send me a code" }).click();
  shut = true;
  const readsBefore = seen.configReads;
  await addWithCode(page, "Add this number");

  const alert = page
    .getByRole("alert")
    .filter({ hasText: "Adding a way in is closed right now" });
  await expect(alert).toBeVisible();
  await expect.poll(() => seen.configReads).toBeGreaterThan(readsBefore);
  await alert.getByRole("button", { name: "Close" }).click();
  await expect(
    waysIn(page).getByRole("button", { name: "Add a number" }),
  ).toHaveCount(0);
});

test("the door shut on a number-only account: the section and its alert stay until Close", async ({
  page,
  context,
}, info) => {
  const seen = watch(context);
  await signIn(page, info, "email-sign-in");
  const open = await page.evaluate(
    async (url) =>
      (
        await fetch(url, { headers: { "x-yuvoy-scenario": "email-sign-in" } })
      ).json(),
    `${API}/app-config`,
  );
  let shut = false;
  await context.route("**/app-config*", (route) =>
    shut
      ? route.fulfill({
          contentType: "application/json",
          body: JSON.stringify({
            ...open,
            features: {
              ...open.features,
              signIn: { ...open.features.signIn, email: false },
            },
          }),
        })
      : route.fallback(),
  );

  await sendEmailCode(page, "shut@example.com");
  shut = true;
  const readsBefore = seen.configReads;
  await addWithCode(page, "Add this email");

  const alert = waysIn(page)
    .getByRole("alert")
    .filter({ hasText: "Adding a way in is closed right now" });
  await expect(alert).toBeVisible();
  await expect.poll(() => seen.configReads).toBeGreaterThan(readsBefore);
  // The config says shut now, and the section and the alert are still there.
  await page.waitForTimeout(500);
  await expect(alert).toBeVisible();
  await alert.getByRole("button", { name: "Close" }).click();
  await expect(waysIn(page)).toHaveCount(0);
});

test("a 5xx on the add is a passing failure: the door stays open", async ({
  page,
  context,
}, info) => {
  const seen = watch(context);
  await signIn(page, info, "email-sign-in");
  await sendEmailCode(page, "ravi@example.com");
  await context.route("**/api/session/link", (route) =>
    route.fulfill({ status: 503, body: "" }),
  );
  const readsBefore = seen.configReads;
  await addWithCode(page, "Add this email");

  const alert = waysIn(page)
    .getByRole("alert")
    .filter({ hasText: "We could not connect" });
  await expect(alert).toBeVisible();
  await expect(alert).not.toContainText("closed");
  expect(seen.configReads).toBe(readsBefore);
  await waysIn(page).getByRole("button", { name: "Not now" }).click();
  await expect(
    waysIn(page).getByRole("button", { name: "Add an email" }),
  ).toBeVisible();
});

test("no answer, but the account holds it: Added", async ({
  page,
  context,
}, info) => {
  await signIn(page, info, "email-sign-in");
  await sendEmailCode(page, "ravi@example.com");
  // The link reaches the server, and the answer is lost on the way back.
  await context.route("**/api/session/link", async (route) => {
    await route.fetch();
    await route.abort("internetdisconnected");
  });
  await addWithCode(page, "Add this email");

  await expect(added(page)).toBeVisible();
  await expect(waysIn(page).getByText("ravi@example.com")).toBeVisible();
});

test("no answer, but the account holds it: Trips is read again", async ({
  page,
  context,
}, info) => {
  const trips = { bookings: 0, invited: 0 };
  context.on("request", (request) => {
    const path = new URL(request.url()).pathname;
    if (path === "/api/v1/me/bookings") trips.bookings += 1;
    if (path === "/api/v1/me/invited-trips") trips.invited += 1;
  });
  const bar = page.locator('nav[aria-label="Primary"]:visible');
  await signIn(page, info, "email-sign-in");

  // Trips read once and kept: inside its 30 s it would not be read again.
  await bar.getByRole("link", { name: "Trips" }).click();
  await page.waitForURL("**/trips");
  await expect.poll(() => trips.bookings).toBeGreaterThan(0);
  await expect.poll(() => trips.invited).toBeGreaterThan(0);
  await page.goBack();
  await page.waitForURL("**/account?__scenario=email-sign-in");

  await sendEmailCode(page, "ravi@example.com");
  await context.route("**/api/session/link", async (route) => {
    await route.fetch();
    await route.abort("internetdisconnected");
  });
  await addWithCode(page, "Add this email");
  await expect(added(page)).toBeVisible();

  // The accounts are one now, so their trips are read again.
  const before = { ...trips };
  await bar.getByRole("link", { name: "Trips" }).click();
  await page.waitForURL("**/trips");
  await expect.poll(() => trips.bookings).toBeGreaterThan(before.bookings);
  await expect.poll(() => trips.invited).toBeGreaterThan(before.invited);
});

test("no answer, and the account does not hold it: could not confirm", async ({
  page,
  context,
}, info) => {
  await signIn(page, info, "email-sign-in");
  await sendEmailCode(page, "ravi@example.com");
  await context.route("**/api/session/link", (route) =>
    route.abort("internetdisconnected"),
  );
  await addWithCode(page, "Add this email");

  await expect(
    page.getByRole("alert").filter({ hasText: "We could not confirm that" }),
  ).toBeVisible();
  await expect(added(page)).toHaveCount(0);
});

test("Use another email clears the code and its hint; Not now closes", async ({
  page,
}, info) => {
  await signIn(page, info, "email-sign-in");
  await sendEmailCode(page, "ravi@example.com");
  await page.getByLabel("Code", { exact: true }).fill(CODE);
  await expect(page.getByText(`the code is ${CODE}`)).toBeVisible();

  await page.getByRole("button", { name: "Use another email" }).click();
  await expect(page.getByLabel("Email", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Code", { exact: true })).toHaveCount(0);
  await expect(page.getByText(`the code is ${CODE}`)).toHaveCount(0);

  await page.getByRole("button", { name: "Not now" }).click();
  await expect(page.getByLabel("Email", { exact: true })).toHaveCount(0);
  await expect(
    waysIn(page).getByRole("button", { name: "Add an email" }),
  ).toBeVisible();
});
