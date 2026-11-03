import { test, expect, type Page } from "@playwright/test";

/**
 * The door, end to end (yuvoy-app#226, the web half of yuvoy-mobile#394).
 *
 * The unit tests prove each answer against a handler. What only a real
 * browser can show is the chain: the session and the scenario reaching the
 * mock through the proxy on a check-in, the code in the address being read,
 * sent once and taken off the address, and the way in from the organiser hub.
 *
 * The mock keeps the codes used per scenario and session, so each test signs
 * in with its own number. Every address opened carries `__scenario`.
 */

const SEEDED = "Sample Island Walkers"; // verified, owner (organiser-fixtures.ts)

const DOOR = "organisers-door";

/** A number nobody else in this run signs in with, so the mock store is ours. */
function freshNumber(): string {
  return `9${String(Math.floor(Math.random() * 1e9)).padStart(9, "0")}`;
}

function withScenario(path: string, scenario: string): string {
  const [base, fragment] = path.split("#");
  const query = `${base}${base?.includes("?") ? "&" : "?"}__scenario=${scenario}`;
  return fragment === undefined ? query : `${query}#${fragment}`;
}

/** The traveller sign-in, as in organisers.spec.ts, with a number of our own. */
async function signIn(page: Page, scenario: string) {
  await page.goto(withScenario("/account", scenario));
  await page.getByLabel("Your WhatsApp number").fill(freshNumber());
  await page.getByRole("button", { name: "Send me a code" }).click();
  await page.getByLabel("Sign-in code").fill("123456");
  await page.getByRole("button", { name: "Show me my trips" }).click();
  await expect(
    page.getByRole("button", { name: "Sign out on this device" }),
  ).toBeVisible();
}

async function typeCode(page: Page, code: string) {
  await page.getByLabel("Code from their phone").fill(code);
  await page.getByRole("button", { name: "Check in", exact: true }).click();
}

test.describe("the door", () => {
  test("checks in a typed code, then the same code again reads calm", async ({
    page,
  }) => {
    await signIn(page, DOOR);
    await page.goto(withScenario("/door", DOOR));
    await expect(
      page.getByRole("heading", { level: 1, name: "Check people in" }),
    ).toBeVisible();

    await typeCode(page, "asha-2345");
    const done = page.getByTestId("door-done");
    await expect(done).toContainText("Asha is checked in");
    await expect(done).toContainText("Sample Sunday Run");
    const field = page.getByLabel("Code from their phone");
    await expect(field).toHaveValue("");
    await expect(field).toBeFocused();

    await typeCode(page, "ASHA2345");
    await expect(done).toContainText("Already checked in at");
    await expect(page.getByLabel("Code from their phone")).toHaveValue("");
  });

  test("checks in the code in the address and takes it off", async ({
    page,
  }) => {
    await signIn(page, DOOR);
    await page.goto(withScenario("/door#asha-2345", DOOR));
    await expect(page.getByTestId("door-done")).toContainText(
      "Asha is checked in",
    );
    await expect.poll(() => new URL(page.url()).hash).toBe("");
    expect(new URL(page.url()).searchParams.get("__scenario")).toBe(DOOR);

    // A reload sends nothing: the address no longer holds the code.
    await page.reload();
    await expect(
      page.getByRole("heading", { level: 1, name: "Check people in" }),
    ).toBeVisible();
    await expect(page.getByTestId("door-done")).toHaveCount(0);
  });

  test("keeps a code that is not for one of the events, and says so", async ({
    page,
  }) => {
    await signIn(page, DOOR);
    await page.goto(withScenario("/door", DOOR));
    await typeCode(page, "ZZZZ9999");
    await expect(
      page.getByText("This code is not for one of your events."),
    ).toBeVisible();
    await expect(page.getByLabel("Code from their phone")).toHaveValue(
      "ZZZZ9999",
    );
    await expect(page.getByTestId("door-done")).toHaveCount(0);
  });

  test("while paused, says so with Try again and keeps the code", async ({
    page,
  }) => {
    const scenario = "organisers-door-paused";
    await signIn(page, scenario);
    await page.goto(withScenario("/door", scenario));
    await typeCode(page, "ASHA2345");
    const paused = page.getByTestId("door-paused");
    await expect(paused).toContainText(
      "Door check-in is paused for a moment. Try again soon.",
    );
    await expect(
      paused.getByRole("button", { name: "Try again" }),
    ).toBeVisible();
    await expect(page.getByLabel("Code from their phone")).toHaveValue(
      "ASHA2345",
    );
  });

  test("the organiser hub leads to the door", async ({ page }) => {
    await signIn(page, DOOR);
    await page.goto(withScenario("/organiser", DOOR));
    await expect(
      page.getByRole("link", { name: new RegExp(SEEDED) }),
    ).toBeVisible();
    await page.getByRole("link", { name: "Check people in" }).click();
    await expect(page).toHaveURL(/\/door$/);
    await expect(
      page.getByRole("heading", { level: 1, name: "Check people in" }),
    ).toBeVisible();
  });

  test("the door is kept out of search", async ({ page }) => {
    await page.goto(withScenario("/door", DOOR));
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
      "content",
      /noindex/,
    );
  });
});
