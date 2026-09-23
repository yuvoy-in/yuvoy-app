import { test, expect, type Page } from "@playwright/test";
import { chooseDeparture } from "./support/checkout";

/**
 * Checkout, refused with `403 invite_required` (yuvoy-api#195).
 *
 * ## Why this one state, and not the whole gate
 *
 * The suite is built with `NEXT_PUBLIC_INVITE_ONLY` OFF, which is how the app
 * ships, so the four gated routes are not gated in this build and there is
 * nothing to walk. This state is the exception: it is what a traveller meets
 * when the API's gate is turned on before this app's, which is the sequence
 * Hima described on the issue and the one that will actually happen.
 *
 * `?__scenario=invite-required` is that production. It is sent as a HEADER
 * rather than a query, because a `?__scenario=` on the first URL does not
 * survive the client-side navigation into `/book`.
 *
 * ## The listing
 *
 * `private-boat-charter` is booked by no other spec, so nothing here competes
 * with another test for the mock's shared availability. Nothing is held
 * either way: every submit in this file is refused before the API reads the
 * body.
 */

const LISTING = "/e/private-boat-charter";
const HOLD = /Hold these seats/i;

/** Every reservation that actually left the browser. */
function countReservations(page: Page) {
  const seen = { posts: 0 };
  page.on("request", (request) => {
    if (request.method() === "POST" && /\/reservations$/.test(request.url())) {
      seen.posts += 1;
    }
  });
  return seen;
}

/** A guest at checkout with a departure chosen and the form filled in. */
async function guestAtCheckout(page: Page) {
  await page.setExtraHTTPHeaders({ "x-yuvoy-scenario": "invite-required" });
  await page.goto(LISTING);
  await chooseDeparture(page);
  await expect(page).toHaveURL(/\/book\?/);

  await page.getByLabel("Your name").fill("Asha Menon");
  await page
    .getByLabel("WhatsApp number", { exact: true })
    .fill("+919000000000");
  await page.getByRole("checkbox", { name: /called off/i }).check();
}

test("a guest refused by the API is asked for an invitation, and keeps the form", async ({
  page,
}) => {
  await guestAtCheckout(page);

  // A party of two, so the refusal has something to lose besides the text.
  await page.getByRole("button", { name: "One more guest" }).click();
  await expect(page.getByText(/2 people/)).toBeVisible();

  await page.getByRole("button", { name: HOLD }).click();

  // The gate, in place, rather than a failure they cannot act on.
  await expect(
    page.getByText("Booking is by invitation for now"),
  ).toBeVisible();
  await expect(
    page.getByText(/Nothing was held and nothing was charged/),
  ).toBeVisible();

  // Everything they filled in is exactly where they left it, and so are they.
  await expect(page).toHaveURL(/\/book\?/);
  await expect(page.getByLabel("Your name")).toHaveValue("Asha Menon");
  await expect(
    page.getByRole("checkbox", { name: /called off/i }),
  ).toBeChecked();
  await expect(page.getByText(/2 people/)).toBeVisible();
  // And the way on is the same button, still live.
  await expect(page.getByRole("button", { name: HOLD })).toBeEnabled();
});

test("the gate's own steps do not submit the booking form under them", async ({
  page,
}) => {
  /*
    THE DEFECT THIS EXISTS FOR.

    The gate draws its sign-in steps inside checkout's own `<form>`, and React
    dispatches `submit` up its tree: "Send me a code" would otherwise also run
    the Hold these seats handler and send a reservation nobody asked for. A
    unit test pins it in jsdom; this pins it in a real browser, which is the
    one that decides what a form element does.
  */
  const seen = countReservations(page);
  await guestAtCheckout(page);

  await page.getByRole("button", { name: HOLD }).click();
  await expect(
    page.getByText("Booking is by invitation for now"),
  ).toBeVisible();
  expect(seen.posts).toBe(1);

  // The steps are open from the start here: they have already tried to book.
  /*
    `exact`, on both this and checkout's own field above: "WhatsApp number" is
    a substring of "Your WhatsApp number", so with the gate panel open a loose
    match finds two inputs and Playwright refuses the ambiguity. Which is the
    right complaint, and this is the answer to it.
  */
  await page
    .getByLabel("Your WhatsApp number", { exact: true })
    .fill("9000003210");
  await page.getByRole("button", { name: "Send me a code" }).click();

  // The next step of signing in, and NOT a second reservation.
  await expect(page.getByLabel("The code we sent")).toBeVisible();
  await expect(page).toHaveURL(/\/book\?/);
  expect(seen.posts).toBe(1);
});
