import { test, expect, type Page, type Request } from "@playwright/test";

/**
 * What people do with a card, in a real browser (yuvoy-app#181, R0-T5).
 *
 * The unit tests hold the collector's rules; this is the part only a browser
 * answers: that a reel on screen and a panel opened reach `POST /outcomes`
 * when the page goes, with no session and nothing but the events, and that
 * nothing goes at all without a yes to the words that name them.
 *
 * The answer is written into sessionStorage before the page loads, as the
 * consent card would have written it. A mocked build without a PostHog key
 * asks nothing (`ConsentBanner`), so the card is never over the screen here.
 */

const KEY = "yuvoy.consent.analytics";
const LISTING = "/e/try-dive-nemo-reef";

/** The answer this tab starts with: `granted:2` is a yes to today's words. */
async function answered(page: Page, value: string | null) {
  await page.addInitScript(
    ([key, answer]) => {
      try {
        if (answer === null) sessionStorage.removeItem(key);
        else sessionStorage.setItem(key, answer);
      } catch {
        // A browser that refuses storage starts undecided, which is the point.
      }
    },
    [KEY, value] as const,
  );
}

/** The page going away, which is when what is waiting is sent. */
const leave = (page: Page) =>
  page.evaluate(() =>
    window.dispatchEvent(new PageTransitionEvent("pagehide")),
  );

const toOutcomes = (r: Request) =>
  r.method() === "POST" && new URL(r.url()).pathname.endsWith("/outcomes");

type Sent = {
  kind: string;
  surface: string;
  subjectType: string;
  subjectId: string;
  position?: number;
};

/** Opens the first reel's panel, once the page is listening. */
async function openFirstPanel(page: Page) {
  const card = page.locator('article[aria-posinset="1"]');
  await card.getByRole("button", { name: /Aug|No dates/ }).click();
  await expect(card.getByRole("group", { name: /^Details, / })).toBeVisible();
}

test("sends shown and opened with consent", async ({ page }) => {
  await answered(page, "granted:2");
  await page.goto("/");
  await openFirstPanel(page);
  // A second on screen is a card shown.
  await page.waitForTimeout(1_200);

  const sent = page.waitForRequest(toOutcomes);
  await leave(page);
  const request = await sent;

  // Straight to the API, anonymously: never the proxy, never a session.
  expect(new URL(request.url()).pathname).not.toContain("/api/");
  expect(request.headers()["authorization"]).toBeUndefined();

  const { events } = request.postDataJSON() as { events: Sent[] };
  expect(events.map((e) => `${e.kind} ${e.surface} ${e.position}`)).toEqual(
    expect.arrayContaining(["shown feed 0", "opened feed 0"]),
  );
  for (const event of events) {
    expect(event.subjectType).toBe("experience");
    // Nothing but the event: no device, account, text or place.
    expect(Object.keys(event).sort()).toEqual(
      [
        "eventId",
        "kind",
        "occurredAt",
        "subjectType",
        "subjectId",
        "surface",
        ...("position" in event ? ["position"] : []),
      ].sort(),
    );
  }
});

test("sends nothing without consent", async ({ page }) => {
  const outcomes: Request[] = [];
  const views: Request[] = [];
  page.on("request", (request) => {
    if (toOutcomes(request)) outcomes.push(request);
    if (request.method() === "POST" && request.url().endsWith("/reel-views"))
      views.push(request);
  });

  await test.step("never asked", async () => {
    await answered(page, null);
    await page.goto("/");
    await openFirstPanel(page);
    await page.waitForTimeout(1_200);
    await leave(page);
  });

  await test.step("a yes to the older words, which counts reel views only", async () => {
    await answered(page, "granted");
    await page.goto("/");
    await openFirstPanel(page);
    /*
      The reel views it did agree to still go, which shows the page did send.
      Watched on the SECOND reel, once the page has settled: the mock's clock
      is the fixture's August, so the first answer to land moves the app's
      server clock by weeks, and a view that spans that move is dropped as
      too short (lib/booking/clock). The panel's departures are that first
      answer; a reel started after them is a plain view.
    */
    await expect(
      page
        .getByRole("group", { name: /^Details, / })
        .getByRole("region", { name: "Coming up" })
        .getByRole("link")
        .first(),
    ).toBeVisible();
    await page.locator('[role="feed"]').evaluate((feed) => {
      feed.scrollTop = feed.clientHeight;
    });
    await expect(page.locator('article[aria-posinset="2"]')).toBeInViewport();
    await page.waitForTimeout(1_200);
    await leave(page);
    await expect.poll(() => views.length).toBeGreaterThan(0);
  });

  expect(outcomes, "an outcome left without a yes to its words").toEqual([]);
});

test("a listing page sends opened", async ({ page }) => {
  const outcomes: Request[] = [];
  page.on("request", (request) => {
    if (toOutcomes(request)) outcomes.push(request);
  });
  await answered(page, "granted:2");
  await page.goto(LISTING);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

  /*
    The open is recorded once the page has hydrated, which nothing on a
    server-rendered listing shows, so the page is left until it has been:
    leaving with nothing waiting sends nothing.
  */
  await expect
    .poll(async () => {
      await leave(page);
      return outcomes.length;
    })
    .toBeGreaterThan(0);
  expect(outcomes).toHaveLength(1);
  const { events } = outcomes[0].postDataJSON() as { events: Sent[] };
  expect(events).toEqual([
    expect.objectContaining({
      kind: "opened",
      surface: "listing",
      subjectType: "experience",
      subjectId: "exp_try_dive",
    }),
  ]);
});
