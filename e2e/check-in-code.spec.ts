import { test, expect } from "@playwright/test";
import { qrPath } from "../src/lib/format/qr-path";

/**
 * Show at check-in on the booking page (yuvoy-app#218), in a real browser on
 * both viewports. The seeded booking from another phone (YV-OTHERPH) opens by
 * its link; the mocks send a check-in code only under the `check-in` and
 * `checked-in` scenarios, as the API does only for a business that checks
 * people in by code.
 */

const LINK = "https://operators.yuvoy.in/check-in#YV-OTHERPH.K7QM2XPA";

test("the booking shows its check-in code and QR, whole, on the screen", async ({
  page,
}) => {
  await page.goto("/booking?__scenario=check-in#t=tok_other_phone");

  const qr = page.getByRole("img", { name: "Check-in QR code" });
  await expect(qr).toBeVisible();
  await expect(page.getByText("K7QM-2XPA", { exact: true })).toBeVisible();
  await expect(page.getByText("For Saturday, 22 August")).toBeVisible();

  // Scannable as drawn: square, at the size asked for, and inside the screen.
  const box = (await qr.boundingBox())!;
  expect(Math.round(box.width)).toBe(232);
  expect(Math.round(box.height)).toBe(232);
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(page.viewportSize()!.width);

  // What it holds is the check-in link, module for module, and not the token.
  const drawn = await qr.locator("path").getAttribute("d");
  expect(drawn).toBe(qrPath(LINK)!.d);
  expect(drawn).not.toBe(qrPath("tok_other_phone")!.d);
});

test("a used code says when, in place of the day", async ({ page }) => {
  await page.goto("/booking?__scenario=checked-in#t=tok_other_phone");
  await expect(page.getByText("Checked in at 07:42")).toBeVisible();
  await expect(page.getByText("For Saturday, 22 August")).toHaveCount(0);
});

test("no code, no block", async ({ page }) => {
  await page.goto("/booking#t=tok_other_phone");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByText("YV-OTHERPH").first()).toBeVisible();
  await expect(page.getByText("Show at check-in")).toHaveCount(0);
});
