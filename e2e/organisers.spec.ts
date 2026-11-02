import { test, expect, type Page, type TestInfo } from "@playwright/test";
import { EVENT_IDS, ORG_IDS } from "../mocks/organiser-fixtures";

/**
 * Organiser pages, end to end (yuvoy-app#224).
 *
 * The unit tests prove each organiser screen against a handler. What only a
 * real browser can show is the chain: Account leads to the hub, the hub to
 * the form, the form to the new page with its thanks line, the page to an
 * event, and the event to its cancel. Each hop is a separate route, and the
 * session and the scenario have to reach the mock through the proxy on every
 * one of them.
 *
 * The gate is the other thing worth walking here: the age step that stands in
 * front of every organiser screen, the paused answer on a write, and the
 * closed release that hides the whole feature.
 *
 * The mock keeps one store per scenario and session, shared by every test in
 * a run and by both projects. So each test signs in with its own number and
 * names what it makes with its own tag.
 *
 * A form that saves moves on with `router.replace`, and a link moves on with
 * a plain href. Neither keeps `__scenario`, as no link in a real build would,
 * so after each hop the test opens the same address again with it.
 */

const SEEDED = "Sample Island Walkers"; // verified, owner (organiser-fixtures.ts)
const SEEDED_LIVE = "Sample Saturday forest walk"; // live, on SEEDED

const PAUSED = "Organiser pages are paused for a moment. Try again soon.";

/** A number nobody else in this run signs in with, so the mock store is ours. */
function freshNumber(): string {
  return `9${String(Math.floor(Math.random() * 1e9)).padStart(9, "0")}`;
}

/** A short tag for names, unique per test and project. */
function tagOf(info: TestInfo): string {
  return `${info.project.name} ${Math.random().toString(36).slice(2, 7)}`;
}

function withScenario(path: string, scenario: string): string {
  return `${path}${path.includes("?") ? "&" : "?"}__scenario=${scenario}`;
}

/** Open the address the app moved to again, this time with the scenario. */
async function reopen(page: Page, scenario: string) {
  const at = new URL(page.url());
  await page.goto(withScenario(at.pathname + at.search, scenario));
}

/** The traveller sign-in, as in signed-in-checkout.spec.ts, with a number of our own. */
async function signIn(page: Page, number = freshNumber()) {
  await page.goto("/account");
  await page.getByLabel("Your WhatsApp number").fill(number);
  await page.getByRole("button", { name: "Send me a code" }).click();
  await page.getByLabel("Sign-in code").fill("123456");
  await page.getByRole("button", { name: "Show me my trips" }).click();
  await expect(
    page.getByRole("button", { name: "Sign out on this device" }),
  ).toBeVisible();
}

/** A start a month from now, as the India clock a datetime-local field holds. */
function startInAMonth(): string {
  const ist = Date.now() + 30 * 24 * 60 * 60_000 + 330 * 60_000;
  return new Date(ist).toISOString().slice(0, 16);
}

/** The page form, filled with the least the mock accepts. */
async function fillPageForm(page: Page, name: string) {
  await page.getByLabel("Name people know you by").fill(name);
  await page
    .getByRole("group", { name: "Where you run things" })
    .getByRole("button", { name: "Port Blair" })
    .click();
  await page
    .getByRole("group", { name: "What you run (up to 3)" })
    .getByRole("button", { name: "Adventure" })
    .click();
  await page
    .getByLabel("Email for Yuvoy to reach you")
    .fill("organiser@example.com");
  await page
    .getByLabel("I run this group or these events, and I am 18 or over.")
    .check();
}

/** The event form, filled with the least the mock accepts. Free is the default. */
async function fillEventForm(page: Page, title: string) {
  await page.getByLabel("Title", { exact: true }).fill(title);
  await page
    .getByRole("radiogroup", { name: "What kind of thing it is" })
    .getByRole("radio", { name: "Nature and wildlife" })
    .click();
  await page.getByLabel("Starts", { exact: true }).fill(startInAMonth());
  await page.getByLabel("Venue name").fill("Sample Town Hall");
  await page.getByLabel("Link to the event").fill("https://example.com/walk");
}

/** Cancel the event on screen, through its confirm sheet. */
async function cancelEvent(page: Page) {
  await page.getByRole("button", { name: "Cancel this event" }).click();
  const sheet = page.getByRole("dialog", { name: "Cancel this event?" });
  await expect(
    sheet.getByText("Everyone who said they are going is told once."),
  ).toBeVisible();
  await sheet.getByRole("button", { name: "Yes, cancel it" }).click();
  await expect(page.getByTestId("organiser-event-state")).toContainText(
    "Cancelled",
  );
}

test.describe("organiser pages", () => {
  test("Account leads to a new page, an event on it, and its cancel", async ({
    page,
  }, info) => {
    const scenario = "organisers-empty";
    const tag = tagOf(info);
    const name = `Sample Rowers ${tag}`;
    const title = `Sample dawn row ${tag}`;

    await signIn(page);

    // Account carries the way in while the release is open.
    await page.goto(withScenario("/account", scenario));
    await page
      .getByRole("link", { name: "Organiser pages", exact: true })
      .first()
      .click();
    await expect(page).toHaveURL(/\/organiser$/);
    await reopen(page, scenario);

    // Nothing yet: the hub says what it is for and offers the form.
    await expect(
      page.getByRole("heading", { level: 1, name: "Organiser pages" }),
    ).toBeVisible();
    await expect(
      page.getByText(
        "Run a group or a series of events? Set up your organiser page, post your events, and see how many people are going.",
      ),
    ).toBeVisible();
    await page
      .getByRole("link", { name: "Set up your organiser page" })
      .click();
    await expect(page).toHaveURL(/\/organiser\/new$/);
    await reopen(page, scenario);

    await expect(
      page.getByRole("heading", { name: "Set up your organiser page" }),
    ).toBeVisible();
    await fillPageForm(page, name);
    await page.getByRole("button", { name: "Send for checking" }).click();

    // The new page, with the thanks line the form hands over in `?made=1`.
    await page.waitForURL(/\/organiser\/[^/?]+\?made=1$/);
    const pagePath = new URL(page.url()).pathname;
    await reopen(page, scenario);
    await expect(page.getByRole("heading", { level: 1, name })).toBeVisible();
    await expect(
      page.getByText(
        "Thanks. We check new organisers by email or a short call, usually within two working days. You can post events now, and we check each one before it shows.",
      ),
    ).toBeVisible();

    await page.getByRole("link", { name: "Post an event" }).click();
    await expect(page).toHaveURL(/\/events\/new$/);
    await reopen(page, scenario);

    await expect(
      page.getByRole("heading", { level: 1, name: "Post an event" }),
    ).toBeVisible();
    await fillEventForm(page, title);
    await page.getByRole("button", { name: "Send for checking" }).click();

    // The event's own screen, in checking, with its thanks line.
    await page.waitForURL(/\/events\/[^/?]+\?sent=in_checking$/);
    const eventPath = new URL(page.url()).pathname;
    await reopen(page, scenario);
    await expect(
      page.getByRole("heading", { level: 1, name: title }),
    ).toBeVisible();
    await expect(
      page.getByText("Thanks. A person at Yuvoy checks it before it shows."),
    ).toBeVisible();
    await expect(page.getByTestId("organiser-event-state")).toContainText(
      "In checking",
    );

    // It is on the page's list of events.
    await page.goto(withScenario(pagePath, scenario));
    await expect(page.getByRole("heading", { name: "Events" })).toBeVisible();
    const row = page.getByRole("link", { name: new RegExp(title) });
    await expect(row).toBeVisible();

    // Cancel it, and it stays cancelled when the list is read again.
    await page.goto(withScenario(eventPath, scenario));
    await cancelEvent(page);

    await page.goto(withScenario(pagePath, scenario));
    await expect(row).toContainText("Cancelled");
  });

  test("while paused, a write is refused in words and a cancel still goes through", async ({
    page,
  }, info) => {
    const scenario = "organisers-paused";
    const tag = tagOf(info);

    await signIn(page);

    // Reads still answer: the hub lists the seeded pages.
    await page.goto(withScenario("/organiser", scenario));
    await expect(
      page.getByRole("link", { name: new RegExp(SEEDED) }),
    ).toBeVisible();

    // A new page is refused with the paused sentence and a way to try again.
    await page.goto(withScenario("/organiser/new", scenario));
    await fillPageForm(page, `Sample Paused Club ${tag}`);
    await page.getByRole("button", { name: "Send for checking" }).click();
    const pageRefusal = page.getByRole("alert").filter({ hasText: PAUSED });
    await expect(pageRefusal).toBeVisible();
    await expect(
      pageRefusal.getByRole("button", { name: "Try again" }),
    ).toBeVisible();
    await expect(page).toHaveURL(/\/organiser\/new\?/);

    // So is a new event on a checked page.
    await page.goto(
      withScenario(`/organiser/${ORG_IDS.verified}/events/new`, scenario),
    );
    await fillEventForm(page, `Sample paused walk ${tag}`);
    await page.getByRole("button", { name: "Send for checking" }).click();
    await expect(
      page.getByRole("alert").filter({ hasText: PAUSED }),
    ).toBeVisible();
    await expect(page).toHaveURL(/\/events\/new\?/);

    // A cancel is not a new write: it still goes through while paused.
    await page.goto(
      withScenario(
        `/organiser/${ORG_IDS.verified}/events/${EVENT_IDS.live}`,
        scenario,
      ),
    );
    await expect(
      page.getByRole("heading", { level: 1, name: SEEDED_LIVE }),
    ).toBeVisible();
    await cancelEvent(page);
  });

  test("asks for a birth year first, and then opens the pages", async ({
    page,
  }) => {
    const scenario = "organisers-age";

    await signIn(page);
    await page.goto(withScenario("/organiser", scenario));

    // The age step stands in front, and the hub behind it is not shown.
    const step = page.getByTestId("organiser-age");
    await expect(
      step.getByRole("heading", { name: "One more thing" }),
    ).toBeVisible();
    await expect(
      step.getByText("Yuvoy accounts are for people 18 and over."),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: new RegExp(SEEDED) }),
    ).toBeHidden();

    await step.getByLabel("What year were you born?").fill("1990");
    await step.getByRole("button", { name: "Continue" }).click();

    // Answered: the step goes and the hub reads again.
    await expect(
      page.getByRole("heading", { name: "One more thing" }),
    ).toBeHidden();
    await expect(
      page.getByRole("heading", { level: 1, name: "Organiser pages" }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: new RegExp(SEEDED) }),
    ).toBeVisible();
  });

  test("with the release closed, Account has no way in and the hub says so", async ({
    page,
  }) => {
    const scenario = "organisers-closed-release";

    await signIn(page);

    // The release is read in the browser, so wait for `GET /app-config` to
    // answer and two frames for a gate that opened to draw. `networkidle`
    // never comes on Account (creator-links.spec.ts says the same).
    const config = page.waitForResponse((r) =>
      new URL(r.url()).pathname.endsWith("/app-config"),
    );
    await page.goto(withScenario("/account", scenario));
    await config;
    await page.evaluate(
      () =>
        new Promise((done) =>
          requestAnimationFrame(() => requestAnimationFrame(done)),
        ),
    );
    await expect(page.locator('a[href="/guides"]').first()).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Organiser pages", exact: true }),
    ).toHaveCount(0);

    // The address still answers, with the closed screen rather than the hub.
    await page.goto(withScenario("/organiser", scenario));
    await expect(
      page.getByRole("heading", { level: 1, name: "Organiser pages" }),
    ).toBeVisible();
    await expect(page.getByText("This is not open yet.")).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Set up your organiser page" }),
    ).toHaveCount(0);
  });

  test("the hub is kept out of search", async ({ page }) => {
    await page.goto("/organiser");
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
      "content",
      /noindex/,
    );
  });
});
