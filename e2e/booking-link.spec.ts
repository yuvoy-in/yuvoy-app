import { test, expect, type Page } from "@playwright/test";

/**
 * A booking link survives being arrived at, then navigated back to.
 *
 * The owner's report, 19 September: tapping a trip under PAST showed "This
 * link no longer opens anything" on a booking that was perfectly good, and
 * the URL had grown a second fragment — `/booking#t=A#t=B`.
 *
 * Next's app router remembers the canonical URL of the FIRST document load,
 * fragment included. A booking link is hard-loaded by definition — it arrives
 * over WhatsApp — so after that, every client-side navigation back to
 * `/booking` appended its fragment instead of replacing it. The router pushes
 * the doubled URL itself; the browser is not involved, and both engines do it.
 *
 * `URLSearchParams` has no concept of `#`, so the token read out was `A#t=B`.
 * The API had never issued it, and 401 for an unknown token is deliberately
 * indistinguishable from 401 for a revoked one — so the screen offered to
 * replace a link that was fine.
 *
 * This walks a real browser because nothing smaller can: the defect lives in
 * the router's history rather than in any function a unit test can call.
 * `token-store.test.ts` covers the parsing half.
 */

const CARD = 'a[href^="/booking"]';
const DEAD_LINK = /no longer opens anything|link has expired/i;

async function signIn(page: Page) {
  await page.goto("/account");
  await page.getByLabel("Your WhatsApp number").fill("9111111111");
  await page.getByRole("button", { name: "Send me a code" }).click();
  await page.getByLabel("The code we sent").fill("123456");
  await page.getByRole("button", { name: "Show me my trips" }).click();
  await expect(
    page.getByRole("button", { name: "Sign out on this device" }),
  ).toBeVisible();
}

/** The control the booking screen offers on every viewport. */
async function backToTrips(page: Page) {
  await page
    .getByRole("link", { name: /your trips/i })
    .first()
    .click();
  await page.waitForURL(/\/trips/);
}

async function openPastTab(page: Page) {
  await page.getByRole("tab", { name: /past/i }).click();
  await page.waitForSelector(CARD);
}

test("a past trip opened after arriving on a booking link is not called dead", async ({
  page,
}) => {
  await signIn(page);

  // Arriving the way a traveller does: the link itself, as a document load.
  await page.goto("/booking#t=tok_other_phone");
  await expect(page.getByText(DEAD_LINK)).toHaveCount(0);

  // Then the owner's journey: back to Trips, into Past, tap a trip.
  await backToTrips(page);
  await openPastTab(page);
  await page.locator(CARD).first().click();
  await page.waitForURL(/\/booking/);

  /*
    What the owner actually saw, and the assertion that matters: the booking
    opens. The token is read correctly from the first render, so this holds
    the whole way through rather than settling into being true.
  */
  await expect(page.getByText(DEAD_LINK)).toHaveCount(0);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

  /*
    And the URL converges on ONE fragment. A URL has one; `#` is not legal
    inside it (RFC 3986 §3.5), so a second means the router appended rather
    than replaced. `toPass` because the repair is an effect: the router still
    pushes the doubled URL, and the first render after the navigation puts it
    back. That one frame is invisible — nothing reads the URL but us, and we
    read it correctly either way.
  */
  await expect(async () => {
    expect(new URL(page.url()).hash.split("#").filter(Boolean)).toHaveLength(1);
  }).toPass({ timeout: 5000 });

  await expect(page.getByText(DEAD_LINK)).toHaveCount(0);
});

test("the token sent to the API is the one the traveller tapped", async ({
  page,
}) => {
  /*
    Reads the bearer token off the WIRE rather than re-deriving it from the
    URL. A test that parsed the fragment itself would be asserting its own
    copy of the fix and would pass against the defect.
  */
  await page.addInitScript(() => {
    const w = window as unknown as { __bearers: string[] };
    w.__bearers = [];
    const real = window.fetch;
    window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
      try {
        const url =
          typeof input === "string"
            ? input
            : input instanceof URL
              ? input.href
              : input.url;
        if (url.includes("/bookings/status")) {
          const headers = new Headers(
            init?.headers ?? (input instanceof Request ? input.headers : {}),
          );
          const auth = headers.get("authorization") ?? "";
          w.__bearers.push(auth.replace(/^Bearer\s+/i, ""));
        }
      } catch {
        // Never let instrumentation break the request it is watching.
      }
      return real(input as RequestInfo, init);
    };
  });

  await signIn(page);
  await page.goto("/booking#t=tok_other_phone");
  await backToTrips(page);
  await openPastTab(page);

  const wanted = (await page.locator(CARD).first().getAttribute("href"))?.split(
    "#t=",
  )[1];
  await page.locator(CARD).first().click();
  await page.waitForURL(/\/booking/);
  await expect(page.getByText(DEAD_LINK)).toHaveCount(0);

  const bearers = async () =>
    page.evaluate(
      () => (window as unknown as { __bearers: string[] }).__bearers,
    );

  await expect(async () => expect(await bearers()).toContain(wanted)).toPass({
    timeout: 5000,
  });
  // The shape that reached the API as a credential it had never issued.
  expect((await bearers()).some((b) => b.includes("#"))).toBe(false);
});

test("the address bar keeps a link that is safe to copy", async ({ page }) => {
  /*
    Not cosmetic. The booking link is the only way back into a booking and
    travellers are told to keep it, so a URL carrying two fragments is one
    paste away from being dead wherever it lands.
  */
  await signIn(page);
  await page.goto("/booking#t=tok_other_phone");
  await backToTrips(page);
  await openPastTab(page);
  await page.locator(CARD).first().click();
  await page.waitForURL(/\/booking/);

  await expect(async () => {
    expect(new URL(page.url()).hash).toBe("#t=tok_past_trip");
  }).toPass({ timeout: 5000 });
});

test("every tab lists its own trips, and each one opens", async ({ page }) => {
  /*
    The mock ignored `?tab=` until 19 September, so all three tabs showed the
    same rows and Past had nothing in it to tap — which is why the suite could
    not see the defect above. This pins the fixture to the contract's promise
    that the tabs "never overlap and together they are the whole list".
  */
  await signIn(page);
  await page.goto("/trips");

  for (const [tab, reference] of [
    ["Past", "YV-PASTONE"],
    ["Cancelled", "YV-CALLOFF"],
  ] as const) {
    await page.getByRole("tab", { name: new RegExp(tab, "i") }).click();
    await page.waitForSelector(CARD);
    await expect(page.getByText(reference)).toBeVisible();

    await page.locator(CARD).first().click();
    await page.waitForURL(/\/booking/);
    // A row from `/me/bookings` carries a token that opens that booking.
    await expect(page.getByText(DEAD_LINK)).toHaveCount(0);
    await backToTrips(page);
  }
});
