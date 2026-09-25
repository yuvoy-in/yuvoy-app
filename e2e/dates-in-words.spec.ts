import { test, expect } from "@playwright/test";

/**
 * No page prints a date the way it arrived on the wire (yuvoy-app#113).
 *
 * `/o/{slug}/listings` printed `nextAvailable` as "2026-09-25" while the feed
 * printed the same field as "Fri, 25 Sep", and nothing noticed: every unit
 * test of that card asserted the sentence for a MISSING date. A raw date is
 * an absence of formatting, which a code review cannot see and a build does
 * not fail on, so this reads what each public page actually shows once its
 * queries have landed, the way a traveller would.
 *
 * Add a route here when a new traveller page renders dates.
 */

const RAW_DATE = /\b\d{4}-\d{2}-\d{2}\b/;

const PAGES: { path: string; settled: string }[] = [
  { path: "/", settled: 'article[aria-posinset="1"]' },
  { path: "/e/try-dive-nemo-reef", settled: "h1" },
  { path: "/e/snorkel-elephant-beach", settled: "h1" },
  { path: "/o/sample-boat-operator", settled: "h1" },
  { path: "/o/sample-boat-operator/listings", settled: "h1" },
  { path: "/search", settled: "h1" },
  { path: "/trips", settled: "h1" },
  { path: "/guides", settled: "h1" },
];

for (const { path, settled } of PAGES) {
  test(`${path} prints no date as it arrived`, async ({ page }) => {
    await page.goto(path);
    await page.waitForSelector(settled);
    /*
      The dates this is about arrive with client queries (the listing bar's
      next open day, the operator rows), so the text is read after the
      network falls quiet, not at first paint.
    */
    await page.waitForLoadState("networkidle");

    const text = await page.locator("body").innerText();
    expect(
      text.match(RAW_DATE)?.[0] ?? null,
      `${path} shows a raw date. Format it through src/lib/format/date.ts, ` +
        `the way the feed does ("Fri, 25 Sep").`,
    ).toBeNull();
  });
}
