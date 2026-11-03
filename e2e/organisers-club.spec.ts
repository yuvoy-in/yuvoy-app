import { test, expect, type Page } from "@playwright/test";
import { CLUBS_HELD } from "../mocks/organiser-fixtures";
import { ORGANISER_WORDS as W } from "../src/lib/organisers/words";

/**
 * A group's organiser page, end to end (yuvoy-app#225, the web half of
 * yuvoy-mobile#395).
 *
 * The unit tests prove the card, the form and the page against the mocks.
 * What only a browser shows is the chain: the hub's card leads to the form
 * for that group, the form to the group's page, checked already, and a
 * second setup of the same group to the first page.
 *
 * As in organisers.spec.ts: the mock keeps one store per scenario and
 * session, so each test signs in with its own number, and a move by
 * `router.replace` or a link drops `__scenario`, so after each hop the test
 * opens the same address again with it.
 */

const SCENARIO = "organisers-club";
const [RUNNERS, QUIZ] = CLUBS_HELD;

/** A number nobody else in this run signs in with, so the mock store is ours. */
function freshNumber(): string {
  return `9${String(Math.floor(Math.random() * 1e9)).padStart(9, "0")}`;
}

function withScenario(path: string): string {
  return `${path}${path.includes("?") ? "&" : "?"}__scenario=${SCENARIO}`;
}

/** Open the address the app moved to again, this time with the scenario. */
async function reopen(page: Page) {
  const at = new URL(page.url());
  await page.goto(withScenario(at.pathname + at.search));
}

/** The traveller sign-in, as in organisers.spec.ts, with a number of our own. */
async function signIn(page: Page) {
  await page.goto("/account");
  await page.getByLabel("Your WhatsApp number").fill(freshNumber());
  await page.getByRole("button", { name: "Send me a code" }).click();
  await page.getByLabel("Sign-in code").fill("123456");
  await page.getByRole("button", { name: "Show me my trips" }).click();
  await expect(
    page.getByRole("button", { name: "Sign out on this device" }),
  ).toBeVisible();
}

/** The group's form, ready to send: its category ticked already, the line ticked. */
async function readyClubForm(page: Page) {
  await expect(page.getByTestId("organiser-form-fixed-name")).toHaveText(
    RUNNERS.name,
  );
  await page
    .getByLabel("I run this group or these events, and I am 18 or over.")
    .check();
}

test.describe("a group's organiser page", () => {
  test("the hub's card sets up the group's page, checked at once", async ({
    page,
  }) => {
    await signIn(page);
    await page.goto(withScenario("/organiser"));

    // One card per group held, by name, above the plain setup.
    const cards = page.getByTestId("organiser-club-card");
    await expect(cards).toHaveCount(2);
    await expect(cards.nth(0)).toContainText(W.clubCard(RUNNERS.name));
    await expect(cards.nth(1)).toContainText(W.clubCard(QUIZ.name));
    await expect(
      page.getByRole("link", { name: "Set up your organiser page" }),
    ).toBeVisible();

    await cards.nth(0).getByRole("link", { name: W.clubCardButton }).click();
    await expect(page).toHaveURL(/\/organiser\/new\?club=/);
    await reopen(page);

    // The name and place are the group's, shown, not asked for.
    await expect(page.getByTestId("organiser-form-fixed-place")).toHaveText(
      "Havelock (Swaraj Dweep)",
    );
    await expect(page.getByText(W.clubFixed)).toBeVisible();
    await expect(page.getByLabel("Name people know you by")).toHaveCount(0);
    await expect(
      page
        .getByRole("group", { name: "What you run (up to 3)" })
        .getByRole("button", { name: "Sports" }),
    ).toHaveAttribute("aria-pressed", "true");
    await readyClubForm(page);
    await page.getByRole("button", { name: W.clubCardButton }).click();

    // The group's page, verified, with the line `?made=club` hands over and no code.
    await page.waitForURL(/\/organiser\/[^/?]+\?made=club$/);
    await reopen(page);
    await expect(
      page.getByRole("heading", { level: 1, name: RUNNERS.name }),
    ).toBeVisible();
    await expect(page.getByTestId("organiser-made")).toHaveText(
      W.clubMade(RUNNERS.name),
    );
    await expect(page.getByTestId("organiser-state-card")).toContainText(
      W.verifiedLine(RUNNERS.name),
    );
    await expect(page.getByTestId("organiser-code")).toHaveCount(0);

    // Back on the hub: the page is listed, and only the other group's card is left.
    await page.goto(withScenario("/organiser"));
    await expect(
      page.getByTestId("organiser-hub-list").getByText(RUNNERS.name),
    ).toBeVisible();
    await expect(cards).toHaveCount(1);
    await expect(cards.nth(0)).toContainText(W.clubCard(QUIZ.name));
  });

  test("a second setup of the same group opens the first page", async ({
    context,
    page,
  }) => {
    await signIn(page);
    const form = withScenario(
      `/organiser/new?club=${encodeURIComponent(RUNNERS.clubId)}`,
    );

    // Two tabs on the same form, before either is sent.
    const other = await context.newPage();
    await page.goto(form);
    await other.goto(form);
    await readyClubForm(page);
    await readyClubForm(other);

    await page.getByRole("button", { name: W.clubCardButton }).click();
    await page.waitForURL(/\/organiser\/[^/?]+\?made=club$/);
    const first = new URL(page.url()).pathname;

    await other.getByRole("button", { name: W.clubCardButton }).click();
    await other.waitForURL(
      (url) => url.pathname === first && url.search === "",
    );
    await reopen(other);
    await expect(
      other.getByRole("heading", { level: 1, name: RUNNERS.name }),
    ).toBeVisible();
    await other.close();
  });
});
