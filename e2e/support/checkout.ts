import { expect, type Page } from "@playwright/test";

/**
 * From a listing to a departure chosen, the way a traveller does it now.
 *
 * ## What this replaced
 *
 * Both specs carried their own copy of a helper that opened a "Pick a day"
 * pop-up on the LISTING page, walked a row of day chips, and clicked the first
 * departure that was not disabled. Around thirty lines each, most of it
 * defending against two races in that pop-up's re-render.
 *
 * yuvoy-app#62 deleted the pop-up. The listing has one button, it opens
 * checkout, and the day and the time are chosen there. So this helper is now
 * the whole journey up to "a departure is selected", and the caller's next
 * step is the form rather than a Continue link.
 *
 * ## The two races are gone with it
 *
 * The old helper's comments described a day chip re-rendering the list under
 * it, so a count taken straight after a click could catch the OUTGOING day's
 * rows. There is nothing to race here: the whole window is fetched once, the
 * calendar renders from it, and choosing a day re-renders a list of chips that
 * are already in the same payload.
 */

/** The calendar's open days. `aria-pressed` is what tells them from the arrows. */
const openDays = (page: Page) =>
  page
    .getByRole("region", { name: "Pick a day" })
    .locator("button[aria-pressed]:not([disabled])");

/**
 * Opens checkout from a listing page and picks the first bookable departure.
 *
 * Leaves the page on `/e/{slug}/book` with a day and a time chosen, which is
 * the state every caller wants before it starts filling in the form.
 */
export async function chooseDeparture(page: Page) {
  const onCheckout = /\/book(\?|$)/.test(page.url());
  if (!onCheckout) {
    await page.getByRole("link", { name: /^Pick a day/ }).click();
    await page.waitForURL(/\/book(\?|$)/);
  }

  /*
    The calendar opens on the first month that HAS an open day, so the first
    enabled square is always on screen. Waiting for it rather than counting
    immediately: the squares arrive with the availability read, and a count
    taken first is zero.
  */
  const days = openDays(page);
  await expect(days.first()).toBeVisible();
  await days.first().click();

  /*
    A day with one open departure selects it already. Clicking the first chip
    either confirms that or makes the choice, and re-selecting the same one is
    a no-op, so this is correct for both shapes without branching on which.
  */
  const times = page
    .getByRole("region", { name: "What time?" })
    .locator("button[aria-pressed]:not([disabled])");
  await expect(times.first()).toBeVisible();
  await times.first().click();
}
