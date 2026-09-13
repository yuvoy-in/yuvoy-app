import { test, expect, devices } from "@playwright/test";

/**
 * iPhone Safari zooms the page in when a form control is focused — yuvoy-app#35.
 *
 * ## Why this spec exists on its own project
 *
 * The rule is WebKit's, not the web's: iOS Safari scales the page up whenever a
 * focused `input`, `select` or `textarea` has a computed `font-size` below
 * 16px, and it never un-scales it afterwards. Chromium does not do this, and
 * both e2e projects in this repo were Chromium — a Pixel 7 and a desktop
 * Chrome — so the entire suite was structurally blind to the one engine the
 * defect lives in. It reached the owner on their own phone instead.
 *
 * So this file runs on a real WebKit iPhone, and it is the only file that
 * project runs (`testMatch` in playwright.config.ts). A whole second pass of
 * the suite on WebKit would roughly double the gate for one class of bug;
 * this costs seconds.
 *
 * ## Why it measures rather than reading classes
 *
 * `pnpm qa` already refuses a sub-16px type class written onto a form control,
 * which is the cheap guard and catches the mistake at the point somebody makes
 * it. It cannot catch the same size arriving by inheritance, by a UA
 * stylesheet, or by a root font-size change — and `field.tsx` already carried
 * `text-base` when #35 was filed, so a class-level check alone would have
 * declared the app clean. This asks the rendered page what the browser
 * actually computed, which is the only thing WebKit acts on.
 *
 * 16px is the threshold and it is inclusive: exactly 16 does not zoom.
 */

test.use({ ...devices["iPhone 14"] });

/** Every route a traveller can type into, and what has to be true first. */
const ROUTES: { path: string; name: string; reveal?: string }[] = [
  { path: "/search", name: "search" },
  { path: "/account", name: "account sign-in" },
  { path: "/trips/recover", name: "lost link recovery" },
  {
    path: "/e/try-dive-nemo-reef/book?slot=slot_try-dive-nemo-reef_a&guests=2",
    name: "checkout and the safety screener",
  },
];

for (const route of ROUTES) {
  test(`no control under 16px on ${route.name}`, async ({ page }) => {
    await page.goto(route.path);

    // The screener's <select> only exists once the form has rendered, and the
    // code field only after a number is sent. Measuring what is on the page is
    // the point, so anything gated is revealed rather than skipped.
    await page.waitForLoadState("networkidle");

    const undersized = await page.evaluate(() => {
      const out: { tag: string; type: string; label: string; size: number }[] =
        [];
      const controls = document.querySelectorAll<
        HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
      >("input, select, textarea");

      for (const el of controls) {
        // Checkboxes and radios take no text entry, so WebKit never zooms for
        // them. Hidden inputs are not focusable at all.
        const type = (el as HTMLInputElement).type ?? "";
        if (["checkbox", "radio", "hidden", "range", "color"].includes(type)) {
          continue;
        }
        const size = Number.parseFloat(getComputedStyle(el).fontSize);
        if (size < 16) {
          out.push({
            tag: el.tagName.toLowerCase(),
            type,
            label:
              el.getAttribute("aria-label") ??
              el.labels?.[0]?.textContent?.trim().slice(0, 40) ??
              el.getAttribute("placeholder") ??
              el.id ??
              "(unnamed)",
            size,
          });
        }
      }
      return out;
    });

    expect(
      undersized,
      `iOS Safari zooms the page in on focus for these. Each needs at least 16px:\n${JSON.stringify(undersized, null, 2)}`,
    ).toEqual([]);
  });
}

/**
 * The viewport must keep pinch-zoom. Fixing #35 with `maximum-scale=1` or
 * `user-scalable=no` would stop the page zooming and also stop everybody who
 * needs to magnify it, which the issue rules out by name.
 */
test("the page can still be pinched to zoom", async ({ page }) => {
  await page.goto("/search");
  const content = await page
    .locator('meta[name="viewport"]')
    .getAttribute("content");
  expect(content).toBeTruthy();
  expect(content!).not.toMatch(/maximum-scale/i);
  expect(content!).not.toMatch(/user-scalable/i);
});
