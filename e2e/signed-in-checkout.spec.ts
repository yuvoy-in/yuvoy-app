import { test, expect, type Page } from "@playwright/test";

/**
 * A SIGNED-IN traveller can book (yuvoy-app#75).
 *
 * Live on app.yuvoy.in from 14 September: every signed-in booking and request
 * was refused with `idempotency_key_malformed`, and nothing was created.
 *
 * Signed in, checkout goes through this app's own proxy rather than calling
 * the API directly. `callUpstream` builds a FRESH header set and forwards
 * nothing of the caller's that is not on an allowlist, so the
 * `Idempotency-Key` checkout had correctly generated was dropped on the hop.
 * The API requires it, saw none, and refused.
 *
 * ## Why the suite did not catch it
 *
 * Every existing checkout test is a GUEST checkout, and a guest calls the API
 * directly — the proxy is not in that path at all. So the header survived, the
 * money loop stayed green, and the signed-in journey was completely broken.
 * The whole value of this spec is the two words "signed in" before "checkout".
 *
 * The mock refuses a missing or malformed key with the API's own
 * `idempotency_key_malformed`, and MSW runs inside the Next server as well as
 * the browser, so the proxy's call is genuinely intercepted: reaching the
 * booking IS the assertion that the header arrived. `upstream.test.ts` asserts
 * the exact value, and a `pnpm qa` check reads the pinned contract so the next
 * required header cannot go missing the same silent way.
 */

/** The refusal the owner hit, in the API's own words. */
const IDEMPOTENCY_FAILURE = /Idempotency-Key|idempotenc|16-128/i;

/**
 * A listing no other spec books, in REQUEST mode.
 *
 * Three reasons, and each cost a run to learn:
 *
 *   - The mock's availability is server state shared by every test in a run.
 *     Booking what `money-loop.spec.ts` books meant competing for the same
 *     seats, and an exhausted departure looks exactly like this change
 *     breaking checkout.
 *   - Request mode holds no seats — the fixture withholds counts on purpose,
 *     because "a request promises an answer, never a seat" — so these tests
 *     cannot deplete anything, for themselves or for anyone else.
 *   - It is the mode the issue reproduces against: `testactivity` on
 *     production is request mode, and the owner's report is a request that
 *     would not send.
 */
const LISTING = "/e/night-fishing-with-a-local-crew";
const SUBMIT = /Send request/i;

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

/**
 * Opens checkout and leaves a departure actually SELECTED.
 *
 * Not `support/checkout.ts`, and the difference is the session. That helper
 * clicks the first open day and the first open time once. The checkout form
 * reads the traveller session, and that answer lands AFTER the first render
 * and re-renders the form with it — signed in, the contact fields collapse
 * into "Booking as …". A selection made before it arrived was discarded, and
 * the helper then waited for a time chip on a day nothing had selected.
 *
 * It failed only when signed in, so it read as signed-in checkout being
 * broken rather than as the test being early. Retrying the whole selection,
 * and asserting a time is actually pressed rather than merely clicked, is
 * what makes it indifferent to when the session lands.
 */
async function chooseOpenDeparture(page: Page) {
  await page.getByRole("link", { name: /^Pick a day/ }).click();
  await page.waitForURL(/\/book(\?|$)/);

  const times = page.getByRole("region", { name: "What time?" });
  const openDays = page
    .getByRole("region", { name: "Pick a day" })
    .locator("button[aria-pressed]:not([disabled])");
  const openTimes = times.locator("button[aria-pressed]:not([disabled])");
  const chosenTime = times.locator('button[aria-pressed="true"]');

  await expect(async () => {
    const days = await openDays.count();
    expect(days, `no open day on ${LISTING}`).toBeGreaterThan(0);

    for (let i = 0; i < days; i += 1) {
      await openDays.nth(i).click();
      if (await openTimes.count()) {
        await openTimes.first().click();
        break;
      }
    }

    // The selection SURVIVED, rather than merely having been clicked.
    await expect(chosenTime).toHaveCount(1, { timeout: 2000 });
  }).toPass({ timeout: 20_000 });
}

/** Fills whatever of the contact form this checkout actually shows. */
async function fillContact(page: Page) {
  /*
    Signed in, the API takes the booking on the number the session proved and
    ignores a typed one, so the form prefills and drops these. Which fields a
    signed-in checkout shows is `checkout-form`'s business, not this spec's.
  */
  const name = page.getByLabel(/Your name/i);
  if (await name.count()) await name.fill("Asha Menon");
  const whatsapp = page.getByLabel(/WhatsApp number/i);
  if (await whatsapp.count()) await whatsapp.fill("+919000000000");
  const screener = page.getByRole("checkbox", { name: /called off/i });
  if (await screener.count()) await screener.check();
}

async function expectItWentThrough(page: Page) {
  await expect(page).toHaveURL(/\/booking#t=/);
  await expect(page.getByText(IDEMPOTENCY_FAILURE)).toHaveCount(0);
  await expect(page.getByText(/Something went wrong/i)).toHaveCount(0);
}

test("a signed-in traveller can send a request", async ({ page }) => {
  await signIn(page);

  await page.goto(LISTING);
  await chooseOpenDeparture(page);
  await fillContact(page);

  await page.getByRole("button", { name: SUBMIT }).click();

  // The whole point: it goes through, rather than being refused on a header.
  await expectItWentThrough(page);
});

test("the guest checkout still works, unchanged", async ({ page }) => {
  /*
    The path that kept working while the signed-in one was broken, asserted
    here so a later change to the proxy cannot fix one by breaking the other.
    A guest reaches the API directly and must continue to.
  */
  await page.goto(LISTING);
  await chooseOpenDeparture(page);
  await fillContact(page);

  await page.getByRole("button", { name: SUBMIT }).click();

  await expectItWentThrough(page);
});
