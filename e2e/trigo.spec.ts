import { test, expect, type Page, type TestInfo } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

/**
 * The Trigo chat on the web (yuvoy-app#223, the web half of
 * yuvoy-mobile#356, R5-T5), in a real browser against the mocks.
 *
 * The unit tests hold each part's rules. What only a browser answers is how
 * the parts meet: that the masthead button and a listing's "Ask Trigo about
 * this" open the one sheet through the address, that a typed message goes out
 * and comes back as the server's answer, and that each refusal the API can
 * give (notice, birth year, daily limit, Trigo down) leaves the traveller a
 * way on.
 *
 * ## Which world each test runs in
 *
 * With no scenario `trigo` is `off`, as in production. Every `trigo-*`
 * scenario opens it at `staff` and makes the signed-in number staff
 * (`mocks/trigo-handlers.ts` says what each does). The mock keeps a chat per
 * scenario and session, so each test signs in as a number of its own and a
 * retry starts clean.
 *
 * The words are the issue's and the mock's, written out here, as no spec
 * imports app code.
 */

const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

/** The same check `redesign-axe.spec.ts` runs, once entrances finish. */
async function expectAccessible(page: Page) {
  await page.evaluate(() =>
    Promise.allSettled(
      document
        .getAnimations()
        .filter(
          (a) =>
            a.timeline === document.timeline &&
            a.effect?.getTiming().iterations !== Infinity,
        )
        .map((a) => a.finished),
    ),
  );
  const results = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  expect(results.violations).toEqual([]);
}

/** A number of this test's own, the same on every run of it. */
function numberFor(info: TestInfo): string {
  let h = 0;
  for (const ch of `trigo|${info.project.name}|${info.testId}|${info.retry}`) {
    h = (Math.imul(h, 31) + ch.charCodeAt(0)) >>> 0;
  }
  return `9${String(h % 1e9).padStart(9, "0")}`;
}

/** Signs in on Account, as `session-cookie.spec.ts` does. */
async function signIn(page: Page, info: TestInfo) {
  await page.goto("/account");
  await page.getByLabel("Your WhatsApp number").fill(numberFor(info));
  await page.getByRole("button", { name: "Send me a code" }).click();
  await page.getByLabel("Sign-in code").fill("123456");
  await page.getByRole("button", { name: "Show me my trips" }).click();
  await expect(
    page.getByRole("button", { name: "Sign out on this device" }),
  ).toBeVisible();
}

const GREETING =
  "Hi, I'm Trigo. Ask me what to do, where to go or what to bring. I answer from what is listed on Yuvoy.";
const REPLY =
  "On Saturday morning the Sunrise Kayak Trip leaves from the beach at six.";

const sheet = (page: Page) => page.getByRole("dialog", { name: "Ask Trigo" });

/** The masthead button that is on screen at this width (phone or desktop). */
const askTrigo = (page: Page) =>
  page
    .getByRole("button", { name: "Ask Trigo", exact: true })
    .filter({ visible: true })
    .first();

/** Opens the sheet from the masthead under a scenario, signed in. */
async function openChat(page: Page, info: TestInfo, scenario: string) {
  await signIn(page, info);
  await page.goto(`/?__scenario=${scenario}`);
  await askTrigo(page).click();
  await expect(sheet(page)).toBeVisible();
  await expect(page).toHaveURL(/[?&]trigo=open/);
}

async function send(page: Page, text: string) {
  await sheet(page).getByLabel("Message to Trigo").fill(text);
  await sheet(page).getByRole("button", { name: "Send" }).click();
}

test.describe("Ask Trigo", () => {
  test("is not there while the release is off, even with ?trigo= in the address", async ({
    page,
  }, info) => {
    await signIn(page, info);
    const config = page.waitForResponse((r) =>
      new URL(r.url()).pathname.endsWith("/app-config"),
    );
    await page.goto("/?trigo=open");
    await config;
    await page.evaluate(
      () =>
        new Promise((done) =>
          requestAnimationFrame(() => requestAnimationFrame(done)),
        ),
    );
    await expect(
      page.getByRole("button", { name: "Ask Trigo", exact: true }),
    ).toHaveCount(0);
    await expect(sheet(page)).toHaveCount(0);
  });

  test("a question from the masthead comes back as Trigo's answer", async ({
    page,
  }, info) => {
    await openChat(page, info, "trigo-reply");
    await expect(sheet(page).getByText(GREETING)).toBeVisible();
    await expect(
      sheet(page).getByRole("list", { name: "Ways to start" }),
    ).toBeVisible();
    await expectAccessible(page);

    await send(page, "What should I do on Saturday?");
    const log = sheet(page).getByRole("log", { name: "Messages" });
    await expect(log.getByText(REPLY)).toBeVisible();
    await expect(log.getByText("What should I do on Saturday?")).toHaveCount(1);
    await expect(sheet(page).getByLabel("Message to Trigo")).toHaveValue("");
    await expect(sheet(page).getByLabel("Message to Trigo")).toBeFocused();
    await expectAccessible(page);

    await page.keyboard.press("Escape");
    await expect(sheet(page)).toBeHidden();
    await expect(page).not.toHaveURL(/[?&]trigo=/);
  });

  test("a listing's Ask Trigo about this opens the sheet about it", async ({
    page,
  }, info) => {
    await signIn(page, info);
    await page.goto("/e/try-dive-nemo-reef?__scenario=trigo-reply");
    await page.getByRole("button", { name: "Ask Trigo about this" }).click();
    await expect(sheet(page)).toBeVisible();
    await expect(page).toHaveURL(
      /[?&]trigo=about%3Aexp%3Atry-dive-nemo-reef|[?&]trigo=about:exp:try-dive-nemo-reef/,
    );
    await expect(sheet(page).getByText("Do I need to swim?")).toBeVisible();
  });

  test("the notice comes first and I understand opens the chat", async ({
    page,
  }, info) => {
    await openChat(page, info, "trigo-consent");
    const notice = sheet(page).getByRole("region", {
      name: "Before you start",
    });
    await expect(notice).toBeVisible();
    await expectAccessible(page);
    await notice.getByRole("button", { name: "I understand" }).click();
    await expect(notice).toBeHidden();
    await send(page, "Free things this weekend?");
    await expect(sheet(page).getByText(REPLY)).toBeVisible();
  });

  test("a birth year is asked once and the same message goes out after it", async ({
    page,
  }, info) => {
    await openChat(page, info, "trigo-age");
    await send(page, "Something calm with my parents?");
    await expect(
      sheet(page).getByText("Add your birth year to use Trigo."),
    ).toBeVisible();
    await expectAccessible(page);
    await sheet(page).getByLabel("Year you were born").fill("1990");
    await sheet(page).getByRole("button", { name: "Save" }).click();
    const log = sheet(page).getByRole("log", { name: "Messages" });
    await expect(log.getByText(REPLY)).toBeVisible();
    await expect(log.getByText("Something calm with my parents?")).toHaveCount(
      1,
    );
  });

  test("the day's last messages are counted and the limit says what next", async ({
    page,
  }, info) => {
    await openChat(page, info, "trigo-limit");
    await expect(sheet(page).getByText("3 messages left today")).toBeVisible();
    await send(page, "Sunset on the water?");
    await expect(
      sheet(page).getByText(
        "You've used today's 20 messages. You can ask again after midnight, or talk to a person.",
      ),
    ).toBeVisible();
    await expectAccessible(page);
  });

  test("Trigo down shows the API's sentence and keeps the message", async ({
    page,
  }, info) => {
    await openChat(page, info, "trigo-down");
    await send(page, "Beginner dive Saturday for two");
    await expect(
      sheet(page).getByText(
        "Trigo is not available right now. Try again later.",
      ),
    ).toBeVisible();
    await expect(
      sheet(page).getByRole("button", { name: "Try again" }),
    ).toBeVisible();
    await expect(sheet(page).getByLabel("Message to Trigo")).toHaveValue(
      "Beginner dive Saturday for two",
    );
    await expectAccessible(page);
  });
});

/**
 * The confirm cards under a reply (yuvoy-app#223 part 2, yuvoy-mobile#391),
 * under the `trigo-card-*` scenarios of `mocks/trigo-card-handlers.ts`: every
 * reply there carries one card.
 */
test.describe("Trigo's cards", () => {
  const card = (page: Page) =>
    sheet(page).getByRole("group", {
      name: "Trigo's card: Book Try-dive at Nemo Reef",
    });

  test("a reply's card is drawn as sent and passes axe", async ({
    page,
  }, info) => {
    await openChat(page, info, "trigo-card-book");
    await send(page, "Beginner dive Saturday for two");
    await expect(card(page)).toBeVisible();
    await expect(card(page)).toHaveAttribute("data-state", "proposed");
    await expect(card(page).getByText("2 people")).toBeVisible();
    await expect(
      card(page).getByRole("button", { name: "Book" }),
    ).toBeVisible();
    await expect(
      card(page).getByRole("button", { name: "Not now" }),
    ).toBeVisible();
    await expectAccessible(page);
  });

  test("Book opens the checkout with the departure, date and party", async ({
    page,
  }, info) => {
    await openChat(page, info, "trigo-card-book");
    await send(page, "Beginner dive Saturday for two");
    await card(page).getByRole("button", { name: "Book" }).click();
    await expect(page).toHaveURL(
      /\/e\/try-dive-nemo-reef\/book\?date=\d{4}-\d{2}-\d{2}&slot=slot_try-dive-nemo-reef_a&guests=2/,
    );
    const kept = await page.evaluate(() => ({
      session: sessionStorage.getItem(
        "yuvoy.trigo.checkout.try-dive-nemo-reef",
      ),
      /*
        eslint-disable no-restricted-syntax --
        The rule bans `localStorage` in app code. This runs in the browser
        and proves the card's checkout was not put there.
      */
      local: Object.keys(localStorage).filter((k) => k.includes("trigo")),
      /* eslint-enable no-restricted-syntax */
    }));
    expect(kept.session).toContain('"idempotencyKey":"trg_');
    expect(kept.local).toEqual([]);
  });

  test("Not now says so and Trigo's line joins the chat", async ({
    page,
  }, info) => {
    await openChat(page, info, "trigo-card-book");
    await send(page, "Beginner dive Saturday for two");
    await card(page).getByRole("button", { name: "Not now" }).click();
    await expect(card(page)).toHaveAttribute("data-state", "declined");
    await expect(card(page).getByText("You said not now.")).toBeVisible();
    await expect(card(page).getByRole("button")).toHaveCount(0);
    const log = sheet(page).getByRole("log", { name: "Messages" });
    await expect(
      log.getByText("No problem. Nothing has been booked or changed."),
    ).toHaveCount(1);
    await expectAccessible(page);
  });

  test("a card whose departure sold out shows the API's sentence", async ({
    page,
  }, info) => {
    await openChat(page, info, "trigo-card-sold-out");
    await send(page, "Beginner dive Saturday for two");
    await card(page).getByRole("button", { name: "Book" }).click();
    await expect(
      card(page).getByText(
        "This changed since I made this card. Ask Trigo again.",
      ),
    ).toBeVisible();
    await expect(card(page).getByRole("button")).toHaveCount(0);
    await expect(page).not.toHaveURL(/\/book/);
    await expectAccessible(page);
  });
});
