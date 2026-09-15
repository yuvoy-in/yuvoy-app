import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

/**
 * Inviting somebody onto a trip, end to end (yuvoy-app#38 items 6, 7, 11, 12).
 *
 * The unit tests prove each screen against a handler. What only a real browser
 * can show is the chain: the booker invites, a link comes back, the link opens
 * a page a signed-out stranger can read, signing in returns to it, and joining
 * lands on the guest's own view of the trip.
 *
 * `/i/{token}` is the piece most worth walking here. It is the one address in
 * this product that a complete stranger opens, from a message, with no account
 * and no context, and every other screen in the app assumes at least one of
 * those.
 */

const INVITE = "/i/inv_joined";

test.describe("an invitation link", () => {
  test("names the trip to somebody signed out, and offers a way in", async ({
    page,
  }) => {
    await page.goto(INVITE);

    await expect(
      page.getByRole("link", { name: "Try-dive at Nemo Reef" }),
    ).toBeVisible();
    await expect(page.getByText("Sample Dive Operator")).toBeVisible();

    /*
      `next` carries them back. Without it, signing in lands on Account and the
      traveller has to find their own way to an invitation they reached from a
      forwarded message.
    */
    await expect(
      page.getByRole("link", { name: "Sign in to join" }),
    ).toHaveAttribute("href", "/account?next=/i/inv_joined");
  });

  test("shows nothing about money or the person who paid", async ({ page }) => {
    /*
      This page is one forward of a group chat. The server's guarantee is
      "Nothing personal and nothing about money", and this is the surface where
      breaking it would be most expensive.
    */
    await page.goto(INVITE);
    await expect(page.getByText("Sample Dive Operator")).toBeVisible();

    const body = (await page.locator("body").textContent()) ?? "";
    expect(body).not.toMatch(/₹/);
    expect(body).not.toMatch(/YV-/);
    expect(body).not.toMatch(/Invited by/i);
  });

  test("is never offered to a crawler", async ({ page }) => {
    /*
      The token in the path is a credential: whoever opens it takes a place in
      somebody's party. It is also single-use, so an indexed one would be a
      leak that turns into a 404.
    */
    await page.goto(INVITE);
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
      "content",
      /noindex/,
    );

    const robots = await (await page.request.get("/robots.txt")).text();
    expect(
      robots.includes("Disallow: /\n") || robots.includes("/i/"),
      `robots.txt neither blanket-disallows nor names /i/:\n${robots}`,
    ).toBe(true);
  });

  test("says so plainly when the link is finished with", async ({ page }) => {
    // Unknown, revoked, declined and past are one answer on purpose: telling
    // them apart confirms that a particular invitation once existed.
    await page.goto("/i/gone");
    await expect(page.getByText("This invitation does not work")).toBeVisible();
    await expect(
      page.getByText("Ask the person who invited you to send it again."),
    ).toBeVisible();
  });

  test("is accessible", async ({ page }) => {
    await page.goto(INVITE);
    await expect(page.getByText("Sample Dive Operator")).toBeVisible();

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
      .analyze();
    expect(results.violations).toEqual([]);
  });
});

test.describe("the guest's own trip", () => {
  test("asks a signed-out visitor for the number that was invited", async ({
    page,
  }) => {
    await page.goto("/trips/invited/inv_joined");
    await expect(page.getByRole("link", { name: "Sign in" })).toHaveAttribute(
      "href",
      "/account?next=/trips/invited/inv_joined",
    );
  });

  test("shows the trip, and nothing a guest may not see", async ({ page }) => {
    // Sign in first: a guest's trip is keyed by their own number.
    await page.goto("/account");
    await page.getByLabel("Your WhatsApp number").fill("9111111111");
    await page.getByRole("button", { name: "Send me a code" }).click();
    await page.getByLabel("The code we sent").fill("123456");
    await page.getByRole("button", { name: "Show me my trips" }).click();
    await expect(
      page.getByRole("button", { name: "Sign out on this device" }),
    ).toBeVisible();

    await page.goto("/trips/invited/inv_joined");
    await expect(
      page.getByRole("link", { name: "Try-dive at Nemo Reef" }),
    ).toBeVisible();
    await expect(page.getByText(/Jetty 2, Havelock/)).toBeVisible();

    const body = (await page.locator("body").textContent()) ?? "";
    expect(body).not.toMatch(/₹/);
    expect(body).not.toMatch(/YV-/);
    // A guest cannot cancel or change the booking.
    await expect(page.getByRole("button", { name: /cancel/i })).toHaveCount(0);
  });
});
