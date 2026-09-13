import { test, expect, type Page } from "@playwright/test";

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

/**
 * Picks the first departure that can be picked, through the date pop-up.
 *
 * Every day in the window used to be stacked on the listing, so a test could
 * click a slot row directly. yuvoy-app#32 made it a pop-up showing one day at
 * a time — the owner called the old list an endless scroll — so choosing is
 * now: open, walk the day chips, take the first row that is not disabled.
 *
 * Walking the chips rather than trusting the first is deliberate: a day whose
 * only departure is past its cutoff is still OFFERED, because hiding it would
 * tell a traveller the day does not exist.
 */
async function chooseDeparture(page: Page) {
  await page.getByRole("button", { name: /Choose a departure|Change/ }).click();
  const sheet = page.getByRole("dialog", { name: "Pick a day" });
  await expect(sheet).toBeVisible();

  const group = sheet.getByRole("group", { name: "Which day" });
  // The chips arrive with the availability read, so counting before they do
  // gives zero and walks straight past every day to the throw below.
  await expect(group.getByRole("button").first()).toBeVisible();

  const chips = group.getByRole("button");
  for (let i = 0; i < (await chips.count()); i++) {
    await chips.nth(i).click();

    /*
      Wait for the chip to BE the chosen one before reading the rows under it.

      Two races, and the second is the one that survived a first fix. A day
      chip re-renders the list below it, so `count()` straight after the click
      is a snapshot that can catch nothing at all — or, worse, the OUTGOING
      day's rows, in which case the helper reads the wrong day's departure,
      finds it disabled, and moves on having silently skipped a day that had
      seats. It threw "no selectable departure" on listings with several,
      about one full run in three, and moved between specs — which is what a
      race looks like when the contended resource is the render.

      React commits the pressed chip and its rows together, so waiting on
      `aria-pressed` ties the two: once it is true, the rows are this day's.
    */
    await expect(chips.nth(i)).toHaveAttribute("aria-pressed", "true");

    const rows = sheet.getByRole("button", { name: /^\d\d:\d\d/ });
    // A chip exists only because that day has departures, so this cannot hang
    // on a legitimately empty day.
    await expect.poll(() => rows.count()).toBeGreaterThan(0);

    const first = rows.first();
    if (await first.isEnabled()) {
      await first.click();
      await expect(sheet).toBeHidden();
      return;
    }
  }
  throw new Error("no selectable departure in any day of the fixture");
}

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

  await chooseDeparture(page);
  await page.getByRole("link", { name: /continue/i }).click();

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

  /*
    Inside the date pop-up since yuvoy-app#32. The rule is unchanged and is the
    reason the pop-up offers every day rather than only the ones with seats:
    hiding a closed departure makes the traveller think the day does not exist.
  */
  await page.getByRole("button", { name: /Choose a departure/ }).click();
  const sheet = page.getByRole("dialog", { name: "Pick a day" });
  await expect(sheet).toBeVisible();

  await expect(
    sheet.getByText("Booking for this departure has closed."),
  ).toBeVisible();
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

  await chooseDeparture(page);
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

test("a listing with no cancellation terms says so, and offers no dead button", async ({
  page,
}) => {
  /*
    THE BUG THAT STOPPED EVERY SALE — yuvoy-app#28.

    Checkout required acceptance of the cancellation policy unconditionally
    and rendered the checkbox that accepts it only when the field was present.
    `cancellationPolicy` is `omitempty` and the API populated it with nothing,
    so it was absent from EVERY response: the traveller was asked to accept
    something that was never on the page, and nothing on `app.yuvoy.in` could
    be booked, by anybody, from launch until 9 Sep 2026.

    The header carries the scenario because it survives the client-side
    navigation into `/book` — a `?__scenario=` on the first URL does not.
  */
  await page.setExtraHTTPHeaders({
    "x-yuvoy-scenario": "no-cancellation-policy",
  });
  await page.goto("/e/mangrove-kayak-at-dawn");
  await page.waitForLoadState("networkidle");

  await chooseDeparture(page);
  await page.getByRole("link", { name: /continue|ask the operator/i }).click();
  await expect(page).toHaveURL(/\/book\?slot=/);

  // It says why, in a sentence that blames us rather than the traveller.
  await expect(
    page.getByText(/cannot take a booking for this one yet/i),
  ).toBeVisible();

  /*
    And there is no form at all. A dead submit button with a hint naming a
    control that does not exist is the worst of the available outcomes, and it
    is what shipped — so the assertion is that none of it is reachable.
  */
  await expect(
    page.getByRole("button", { name: /Hold these seats|Ask the operator/i }),
  ).toHaveCount(0);
  await expect(page.getByLabel(/Your name/i)).toHaveCount(0);
  await expect(page.getByText(/Still needed:/i)).toHaveCount(0);

  // A way onward rather than a dead end.
  await expect(
    page.getByRole("link", { name: /back to this experience/i }),
  ).toBeVisible();
});

test("a traveller can finish a booking by paying the operator in cash", async ({
  page,
}) => {
  /*
    THE LOOP CLOSING — yuvoy-app#29.

    Before this, checkout reached the payment step, got `coming_soon`, told the
    traveller to wait for a message nothing sends, and the held seats lapsed
    fifteen minutes later. Nothing in the app could be booked to completion.

    This is the whole journey, in the state production is actually in.
  */
  await page.goto("/e/mangrove-kayak-at-dawn");
  await page.waitForLoadState("networkidle");

  await chooseDeparture(page);
  await page.getByRole("link", { name: /continue|ask the operator/i }).click();

  await page.getByLabel(/Your name/i).fill("Asha Menon");
  await page.getByLabel(/WhatsApp number/i).fill("+919000000000");
  await page.getByRole("checkbox", { name: /called off/i }).check();
  await page.getByRole("button", { name: /Hold these seats/i }).click();
  await expect(page).toHaveURL(/\/booking#t=/);

  // The payment step, and the way out of it that actually exists.
  await page.getByRole("button", { name: /^Pay /i }).click();
  const cash = page.getByRole("button", { name: /Book now, pay .* cash/i });
  await expect(cash).toBeVisible();
  await cash.click();

  /*
    Booked, and this asserts the SETTLED screen rather than the moment.

    The success panel is transient by design: the status refetches the instant
    the booking lands, the pay area unmounts and the panel goes with it. So a
    test racing it is a test that fails on a fast machine — and this one did,
    intermittently, reported as a flake on #36.

    It survived that long by accident. The panel's headline and the headline
    for `paid_pending_ops` were the same words, so whichever won the race the
    assertion passed. D-034 made a cash booking settle at `confirmed`, whose
    headline is "You are going", and the accident stopped covering it.

    The transient panel is worth testing and is tested — deterministically, in
    `booking-screen.test.tsx`, where the refetch can be held. What belongs
    here is the journey and what a traveller is left holding.
  */
  await expect(page.getByText("You are going")).toBeVisible();

  /*
    `.first()` on the reference, and that is the other half of the same race:
    it is in the success panel AND in the details below, so an unqualified
    locator resolved to one element or two depending on which won and failed
    strict mode. The claim is that the reference is on the page, not that it
    is there exactly once.
  */
  await expect(page.getByText(/^YV-/).first()).toBeVisible();
  await expect(page.getByText(/Bring ₹.* in cash/)).toBeVisible();
  // Said more than once by design — in the state line and beside the amount —
  // so this asserts it is said at all rather than exactly where.
  await expect(page.getByText(/Pay the operator/i).first()).toBeVisible();

  /*
    And the amount is NOT labelled "Paid". The money has not moved: they hand
    it over on the day, and our ledger holds nothing.
  */
  await expect(page.getByText("To pay on the day")).toBeVisible();

  /*
    And never our internal word for it. `paid_pending_ops` means "committed,
    ops have not confirmed"; the traveller-facing word is booked.

    D-034 stopped `GET /bookings/status` returning that state at all — it
    answers `confirmed` with a `payment` object now — but the assertion stays:
    it is about a class of word reaching a traveller, and `/me/bookings` still
    carries the raw value one screen away.
  */
  const body = (await page.locator("body").textContent()) ?? "";
  expect(body).not.toMatch(/paid_pending_ops|unpaid|pending payment/i);
  expect(body).not.toMatch(/pay Yuvoy|amount due/i);
});
