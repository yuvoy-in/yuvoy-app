import { test, expect, devices, type Page } from "@playwright/test";

/**
 * The server's HTML and the browser's first render must agree (yuvoy-app#67).
 *
 * ## Why this spec exists, and why on WebKit
 *
 * On 15 September 2026 every reel with a departure threw React error #418 in
 * production. `Intl.DateTimeFormat` with `month: "short"` renders "Sept" in
 * node and "Sep" in WebKit, because the two carry different CLDR versions, so
 * the server HTML and the client's first render disagreed by one character.
 *
 * Nothing in the suite could see it, and the reason is structural rather than
 * an oversight. A unit test runs one runtime, so both halves are the same
 * half. The `mobile` and `desktop` e2e projects are both Chromium, and
 * Chromium agrees with node here, so the built app rendered identically on
 * both sides and the whole suite was green. It was found by a person reading
 * the console on the live site.
 *
 * This runs on a real WebKit iPhone for exactly that reason: the divergence
 * only exists between two different ICU builds, and node against WebKit is the
 * pair a traveller on an iPhone actually gets. It joins `ios-input-zoom` in
 * the `iphone` project, which is the project for engine differences.
 *
 * ## Why it reads the console rather than the DOM
 *
 * A hydration mismatch is not visible in the settled DOM. React patches the
 * text and moves on, so the page LOOKS right afterwards and any assertion
 * about content passes. The error is the only evidence, which is why the
 * defect survived a green gate and reached production: the one signal was in a
 * place nothing was looking.
 *
 * ## Why it is not about dates
 *
 * A check for "Sept" would guard the character rather than the class, and the
 * class is much wider: a random value, `Date.now()`, a `localStorage` read, a
 * `window` measurement, any locale-dependent formatting. `pnpm qa` guards the
 * specific `Intl` mistake statically, at the point somebody makes it. This is
 * the net underneath, and it catches the ones nobody has thought of yet.
 */

test.use({ ...devices["iPhone 14"] });

/*
  React numbers its hydration failures. #418 is "text content does not match",
  which is what a month name produces; #423 and #425 are the tree-shaped
  variants, which is what a conditional on `typeof window` produces. Matched by
  the message text too, because React logs the readable form in development and
  the numbered link in production, and this suite runs a production build.
*/
const HYDRATION =
  /minified React error #(418|423|425)|Hydration failed|did not match|hydrat/i;

/** Every route that renders server HTML a traveller lands on directly. */
const ROUTES: { path: string; name: string; settled: string }[] = [
  { path: "/", name: "the feed", settled: 'article[aria-posinset="1"]' },
  {
    path: "/r/med_dive",
    name: "a shared reel",
    settled: 'article[aria-posinset="1"]',
  },
  {
    path: "/e/try-dive-nemo-reef",
    name: "a listing",
    settled: "h1",
  },
  { path: "/search", name: "search", settled: "h1" },
  { path: "/trips", name: "trips", settled: "h1" },
  { path: "/guides", name: "the guides index", settled: "h1" },
];

/**
 * Collects console errors and page exceptions for the life of a page.
 *
 * Both, because React reports a mismatch through `console.error` while a
 * throw during hydration arrives as a page error, and a recovered render
 * produces the first without the second.
 */
function watchConsole(page: Page): string[] {
  const seen: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") seen.push(msg.text());
  });
  page.on("pageerror", (err) => seen.push(String(err)));
  return seen;
}

for (const route of ROUTES) {
  test(`${route.name} hydrates without disagreeing with the server`, async ({
    page,
  }) => {
    const errors = watchConsole(page);

    await page.goto(route.path);
    await page.waitForSelector(route.settled);
    /*
      Hydration is not finished when the first element appears. Waiting for the
      network to fall quiet lets the client render land, including the parts
      that only mount once a query resolves.
    */
    await page.waitForLoadState("networkidle");

    const mismatches = errors.filter((e) => HYDRATION.test(e));
    expect(
      mismatches,
      `${route.path} hydrated with a mismatch. The server HTML and WebKit's ` +
        `first render disagree. The usual cause is a value the two runtimes ` +
        `spell differently: see src/lib/format/date.ts.`,
    ).toEqual([]);
  });
}
