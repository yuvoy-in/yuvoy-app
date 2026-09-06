import { test, expect } from "@playwright/test";

/**
 * The money loop, end to end.
 *
 * NOTE ON SELECTORS: the `label` utility applies `text-transform: uppercase`,
 * and Playwright resolves an accessible name from RENDERED text — so
 * getByLabel("Your name") does not match a label that paints as "YOUR NAME".
 * jsdom ignores text-transform, which is why the unit tests pass on exact
 * case and these must not. Every name matcher here is a case-insensitive
 * regex on purpose.
 *
 * This is the journey that must not break: find a departure, hold seats, and
 * land on a booking page that tells the truth. Everything else in the product
 * can degrade; this cannot.
 */

test("a traveller can go from the feed to a held booking", async ({ page }) => {
  await page.goto("/");

  // The feed shows a real price rather than a placeholder.
  await expect(page.getByText("Try-dive at Nemo Reef").first()).toBeVisible();

  await page.goto("/e/mangrove-kayak-at-dawn");

  // No contracted price on this one — it must SAY so, never render ₹0.
  await expect(
    page.getByText(/No price set yet|Price on request/),
  ).toBeVisible();
  await expect(page.getByText("₹0")).toHaveCount(0);

  // Pick the first open departure.
  await page
    .getByRole("button", { name: /seats left|available/i })
    .first()
    .click();
  await page.getByRole("link", { name: /continue|ask the operator/i }).click();

  await expect(page).toHaveURL(/\/book\?slot=/);

  await page.getByLabel(/Your name/i).fill("Asha Menon");
  await page.getByLabel(/WhatsApp number/i).fill("+919000000000");
  await page.getByRole("checkbox", { name: /called off/i }).check();
  await page.getByRole("button", { name: /Hold these seats/i }).click();

  // Landed on the booking, with the token in the FRAGMENT.
  await expect(page).toHaveURL(/\/booking#t=/);
  await expect(page.getByText("Your seats are held")).toBeVisible();
  await expect(page.getByRole("timer")).toBeVisible();

  /*
    And the tab names this booking — yuvoy-app#16.

    The token is in the fragment, which never reaches the server, so
    `generateMetadata` cannot tell one booking from another and every tab read
    "Your booking · Yuvoy". Set client-side once the booking loads, which is
    the only place that knows. A hold has no reference yet, so the experience
    name stands in.

    The reference leads, because it is what somebody with two tabs open is
    looking for, and it is "human-quotable and not a credential" — it goes on
    the operator's manifest and is read aloud on a jetty. Matched on its SHAPE
    rather than a fixture value, so a mock that mints a different one still
    proves the right field is in front.

    The token must never be in the title: it is already in browser history and
    a title is one more place it would not belong.
  */
  await expect(page).toHaveTitle(/^YV-[A-Z0-9]+ · Yuvoy$/);
  await expect(page).not.toHaveTitle(/t=/);
});

test("a poster is never a dead end — reduced motion still gets a play control", async ({
  page,
}) => {
  /*
    yuvoy-app#17, reported by the owner as "videos are not getting played
    correctly" with correct media behind it the whole time.

    `detectAutoplayAllowed()` returned false whenever `navigator.connection`
    was absent — Safari, Firefox and all of iOS, which `feed-player.tsx` calls
    "most of our traffic" in its own header. The `<video>` element was gated on
    that same flag, so it was never mounted and there was no control anywhere
    to press. Every reel, a still image, permanently.

    Reduced motion is emulated here because it is the one path to "autoplay
    refused" that a test can force in Chromium, which HAS the Network
    Information API and would otherwise just autoplay. It exercises the same
    branch, and it is a real user besides: preferring less movement should not
    mean never seeing the video.

    ❌ NOT proven here: that a clip actually plays. The fixture's `hlsUrl` does
    not resolve, and real HLS playback is not something this suite can stand
    up. What this pins is the regression — that there is a way in at all.
  */
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await page.waitForLoadState("networkidle");

  const play = page.getByRole("button", { name: /^Play / });
  await expect(play).toBeVisible();

  // And it is a real target, not a decoration: 56px is the floor everywhere
  // else in this app and a play control on a moving feed is no exception.
  const box = await play.boundingBox();
  expect(box!.width).toBeGreaterThanOrEqual(56);
  expect(box!.height).toBeGreaterThanOrEqual(56);
});

test("a card with no clip draws no play control", async ({ page }) => {
  /*
    The other half, and the reason the fixtures are not all given a clip: "a
    card is COMPLETE with only a poster." A play button on a card that has no
    video is a control that does nothing, which is the same class of defect as
    no control at all.

    The second card is poster-only. Scrolled to, so it is the active one —
    the control is drawn for the active card only.
  */
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await page.waitForLoadState("networkidle");

  await page.locator("[data-feed-index='1']").scrollIntoViewIfNeeded();
  await expect(page.locator("[data-feed-index='1']")).toBeInViewport();
  await expect(
    page
      .locator("[data-feed-index='1']")
      .getByRole("button", { name: /^Play / }),
  ).toHaveCount(0);
});

test("a closed departure is shown disabled, never hidden", async ({ page }) => {
  await page.goto("/e/try-dive-nemo-reef");
  await page.waitForLoadState("networkidle");

  // Hiding it makes the traveller think the day does not exist.
  // The `label` utility uppercases, so an accessible name is uppercase too.
  // Case-sensitive selectors here pass locally and fail the moment a class
  // changes, which is the worst kind of test.
  const closed = page.getByText("Booking for this departure has closed.");
  await expect(closed).toBeVisible();
});

test("a paused kill switch reads as deliberate, not as a crash", async ({
  page,
}) => {
  await page.goto("/?__scenario=booking-disabled");
  await page.waitForLoadState("networkidle");

  await expect(page.getByText("Booking is paused")).toBeVisible();
  // No retry: retrying just asks a human's decision again.
  await expect(page.getByRole("button", { name: /Try again/i })).toHaveCount(0);
});

test("the health check blocks a dive booking until it is answered", async ({
  page,
}) => {
  await page.goto("/e/try-dive-nemo-reef");
  await page.waitForLoadState("networkidle");

  await page
    .getByRole("button", { name: /seats left|available/i })
    .first()
    .click();
  await page.getByRole("link", { name: /continue/i }).click();

  await page.getByLabel(/Your name/i).fill("Asha Menon");
  await page.getByLabel(/WhatsApp number/i).fill("+919000000000");
  await page.getByRole("checkbox", { name: /called off/i }).check();

  // Omitted is not false — the form must not let this through.
  await expect(
    page.getByRole("button", { name: /Hold these seats/i }),
  ).toBeDisabled();
  // The blocker list specifically, not the fieldset legend — both contain the
  // words "health check", and asserting on the vaguer one is how a test starts
  // passing for the wrong reason.
  await expect(page.getByText(/Still needed:.*health check/i)).toBeVisible();
});
