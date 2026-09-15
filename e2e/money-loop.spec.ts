import { test, expect } from "@playwright/test";
import { chooseDeparture } from "./support/checkout";

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

  await chooseDeparture(page);

  await expect(page).toHaveURL(/\/book\?/);

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
  /*
    The rule is unchanged and the place moved. It used to be inside the date
    pop-up on the listing; yuvoy-app#62 deleted that, so it is now a time chip
    on checkout. Hiding a closed departure makes a traveller think the day does
    not exist, which sends them looking for a boat that is right there.

    "Closed" rather than "Full", and the distinction is the point: a full boat
    says try another day, a passed cutoff says you are too late for this one.
  */
  await page.goto("/e/try-dive-nemo-reef");
  await page.waitForLoadState("networkidle");
  await page.getByRole("link", { name: /^Pick a day/ }).click();
  await page.waitForURL(/\/book$/);

  const calendar = page.getByRole("region", { name: "Pick a day" });
  await expect(
    calendar.locator("button[aria-pressed]:not([disabled])").first(),
  ).toBeVisible();

  /*
    A day that HAS departures but none that can be taken reads "Full" on the
    square and is not tappable, rather than looking like a day with nothing on.
  */
  await expect(calendar.getByText("Full").first()).toBeVisible();

  // And a closed departure sitting beside an open one, on a day that is open.
  await chooseDeparture(page);
  const times = page.getByRole("region", { name: "What time?" });
  await expect(times.getByRole("button").first()).toBeVisible();
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
  await expect(page).toHaveURL(/\/book\?/);

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

test("a required question stops a booking, and answering it books", async ({
  page,
}) => {
  /*
    THE LISTING'S OWN QUESTIONS — yuvoy-app#46.

    The issue's own "how to tell it works": a listing with a required `yes_no`
    refuses a checkout that does not answer it, answering it books, and the
    booking page shows what was answered and what was skipped.

    The dive is the fixture that asks them, and it also carries the safety
    screener — which is the point. They are different gates with different
    refusals behind them, and a form that conflated them would pass one test
    and fail a traveller.
  */
  await page.goto("/e/try-dive-nemo-reef");
  await page.waitForLoadState("networkidle");

  await chooseDeparture(page);

  await page.getByLabel(/Your name/i).fill("Asha Menon");
  await page.getByLabel(/WhatsApp number/i).fill("+919000000000");
  await page.getByRole("checkbox", { name: /called off/i }).check();
  await page
    .getByRole("radio", { name: /nobody in my party has any/i })
    .check();
  await page.getByLabel("Your age range").selectOption("18_plus");

  // Blocked, and it names the operator's questions rather than only going grey.
  await expect(
    page.getByRole("button", { name: /Hold these seats/i }),
  ).toBeDisabled();
  await expect(
    page.getByText(/Still needed:.*the operator's questions/i),
  ).toBeVisible();

  // The choice question is a select over the listing's own options, so an
  // answer the server would silently drop cannot be produced here at all.
  await page
    .getByLabel("Which agency certified you? (optional)")
    .selectOption("SSI");

  await page.getByRole("radio", { name: "Yes" }).check();
  const hold = page.getByRole("button", { name: /Hold these seats/i });
  await expect(hold).toBeEnabled();
  await hold.click();

  await expect(page).toHaveURL(/\/booking#t=/);

  // And the booking page carries what was answered, and what was not.
  await expect(page.getByText("What the operator asked")).toBeVisible();
  await expect(page.getByRole("radio", { name: "Yes" }).first()).toBeChecked();

  // The optional one was skipped, so it is still answerable from here.
  const hotel = page.getByLabel(
    "Which hotel should we collect you from? (optional)",
  );
  await expect(hotel).toBeVisible();
  await expect(hotel).toHaveValue("");

  await hotel.fill("Sea View, Havelock");
  await page.getByRole("button", { name: /Save answers/i }).click();
  await expect(page.getByText(/Saved\./)).toBeVisible();
  await expect(hotel).toHaveValue("Sea View, Havelock");
});

test("the conversation refuses a phone number and takes a date", async ({
  page,
}) => {
  /*
    THE CONVERSATION WITH THE BUSINESS — yuvoy-app#47.

    Two of the issue's own checks, and they are the pair that matters: the
    contact-detail rule has to bite, and it has to bite ONLY on contact
    details. "see you on 14.09.2026" is seven digits written close together and
    must still send, because a rule that swallowed dates would make the feature
    useless on the one subject travellers write about.

    Nothing here re-implements that rule. The server owns it, the app renders
    the sentence it answers with, and this walks both sides.
  */
  await page.goto("/e/mangrove-kayak-at-dawn");
  await page.waitForLoadState("networkidle");

  await chooseDeparture(page);
  await page.getByLabel(/Your name/i).fill("Asha Menon");
  await page.getByLabel(/WhatsApp number/i).fill("+919000000000");
  await page.getByRole("checkbox", { name: /called off/i }).check();
  await page.getByRole("button", { name: /Hold these seats/i }).click();
  await expect(page).toHaveURL(/\/booking#t=/);

  // A hold is not a booking, so there is nobody to write to yet — and that is
  // a state with a sentence, not an error.
  await expect(
    page.getByText(/Messages open once the booking is made/),
  ).toBeVisible();
  await expect(page.getByLabel("Write to the operator")).toHaveCount(0);

  // Book it, which is what opens the conversation.
  await page.getByRole("button", { name: /^Pay /i }).click();
  await page.getByRole("button", { name: /Book now, pay .* cash/i }).click();
  await expect(page.getByText("You are going")).toBeVisible();

  const box = page.getByLabel("Write to the operator");
  await expect(box).toBeVisible();

  // A phone number is refused, and nothing lands in the thread.
  await box.fill("call me on 98765 43210");
  /*
    `exact` because Playwright matches an accessible name as a SUBSTRING by
    default, and the booking page grew a "Send us a message" button under
    "Need help?" (yuvoy-app#38 item 4). Without it this resolves to two
    elements and fails strict mode, which is the test being imprecise rather
    than the page being wrong: the two buttons are distinct and correctly
    named.
  */
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(
    page.getByText(/looks like it has a phone number/),
  ).toBeVisible();
  // Nothing was stored, so nothing appears in the thread ...
  await expect(
    page.getByRole("listitem").filter({ hasText: "call me on 98765 43210" }),
  ).toHaveCount(0);
  // ... and the draft is KEPT, so the fix is an edit rather than a retype.
  await expect(box).toHaveValue("call me on 98765 43210");

  // A date written like a date is not a phone number.
  await box.fill("see you on 14.09.2026");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(
    page.getByRole("listitem").filter({ hasText: "see you on 14.09.2026" }),
  ).toBeVisible();
  // And the refusal is gone with it.
  await expect(page.getByText(/looks like it has a phone number/)).toHaveCount(
    0,
  );
});

test("a message whose text was removed reads as removed, never as blank", async ({
  page,
}) => {
  /*
    "The message stays, with `textRemovedAt` in place of `text`. Show it as a
    message whose text was removed, never as an empty one." A blank bubble
    reads as something the app lost.
  */
  await page.setExtraHTTPHeaders({ "x-yuvoy-scenario": "text-removed" });

  await page.goto("/e/mangrove-kayak-at-dawn");
  await page.waitForLoadState("networkidle");
  await chooseDeparture(page);
  await page.getByLabel(/Your name/i).fill("Asha Menon");
  await page.getByLabel(/WhatsApp number/i).fill("+919000000000");
  await page.getByRole("checkbox", { name: /called off/i }).check();
  await page.getByRole("button", { name: /Hold these seats/i }).click();
  await expect(page).toHaveURL(/\/booking#t=/);

  await expect(
    page.getByText("The text of this message was removed."),
  ).toBeVisible();
  // Still a message: it keeps who wrote it.
  await expect(
    page.getByRole("listitem").filter({ hasText: "The text of this message" }),
  ).toContainText("Sample Dive Operator");
});
