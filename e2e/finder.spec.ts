import { test, expect } from "@playwright/test";

/**
 * The page YuvoyFinder names in every request (yuvoy-api#324).
 *
 * The finder sends `YuvoyFinder/1.0 (+https://app.yuvoy.in/finder)`, and it may
 * not read a live page until this answers, so a site owner who follows that
 * link always finds who we are and how to stop us. The words are the R1-T3
 * spec's; the robots.txt rule and the address are what a site owner acts on.
 */
test("the finder's page says what it is and how a site stops it", async ({
  page,
}) => {
  const response = await page.goto("/finder");
  expect(response?.status()).toBe(200);

  await expect(
    page.getByRole("heading", { level: 1, name: "YuvoyFinder" }),
  ).toBeVisible();
  await expect(
    page.getByText("YuvoyFinder/1.0 (+https://app.yuvoy.in/finder)"),
  ).toBeVisible();
  await expect(
    page.getByText(/It follows robots\.txt, waits at least five seconds/),
  ).toBeVisible();
  await expect(
    page.getByText(/It keeps the text of a page for 30 days/),
  ).toBeVisible();
  await expect(
    page.getByText(/User-agent: YuvoyFinder\s+Disallow: \//),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "info@yuvoy.in" }),
  ).toHaveAttribute("href", "mailto:info@yuvoy.in");
});
