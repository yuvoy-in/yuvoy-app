import { test, expect, type Page } from "@playwright/test";
import { swipe } from "./support/touch";

/**
 * A way in, top right, on every page (yuvoy-app#56).
 *
 * Asked for by the owner on 14 September. It is the answer to the one thing an
 * HttpOnly cookie cannot fix: WhatsApp and Instagram each open a link in their
 * own browser with their own cookie jar, so somebody signed in in Safari opens
 * a shared reel from a message and is a stranger again.
 *
 * ## What only a browser can show here
 *
 * Two things. That the button is actually reachable at each breakpoint, since
 * the mobile placement and the desktop placement are different elements in
 * different files and a unit test sees one at a time. And that the feed's top
 * strip still SCROLLS: the masthead is `pointer-events-none` across its full
 * width on purpose, and putting a button in it is exactly how two inches of
 * every reel become dead to a thumb.
 */

const login = (page: Page) => page.getByRole("link", { name: "Login" });

async function signIn(page: Page) {
  await page.getByLabel("Your WhatsApp number").fill("9111111111");
  await page.getByRole("button", { name: "Send me a code" }).click();
  await page.getByLabel("The code we sent").fill("123456");
  await page.getByRole("button", { name: "Show me my trips" }).click();
}

test("shows on the feed, search and trips when signed out", async ({
  page,
}) => {
  for (const path of ["/", "/search", "/trips"]) {
    await page.goto(path);
    await expect(login(page), `no Login on ${path}`).toBeVisible();
  }
});

test("is not drawn on Account, which is the sign-in form", async ({ page }) => {
  await page.goto("/account");
  await expect(page.getByText("There is no account to make")).toBeVisible();
  await expect(login(page)).toHaveCount(0);
});

test("signing in from it lands back on the same page, with Login gone", async ({
  page,
}) => {
  /*
    The round trip, which is the whole point of carrying `?next=`. Search is
    used rather than the feed because its state lives entirely in the query,
    so landing back on `/search` alone would look like success and be a loss.
  */
  await page.goto("/search?q=diving");
  await login(page).click();

  await page.waitForURL(/\/account\?next=/);
  await expect(page.getByText("There is no account to make")).toBeVisible();

  await signIn(page);

  await page.waitForURL(/\/search\?q=diving/);
  await expect(login(page)).toHaveCount(0);
});

test("no page shows it once signed in", async ({ page }) => {
  await page.goto("/account");
  await signIn(page);
  await expect(page.getByText("You are signed in")).toBeVisible();

  for (const path of ["/", "/search", "/trips"]) {
    /*
      Waited on `/api/session` specifically, not on `networkidle`.

      `signedIn` is undefined until that call answers, so an instant assertion
      would pass while the component was still in its held-space branch and
      would keep passing if the signed-in branch were deleted. But
      `networkidle` never settles on the feed: the reels keep fetching media, so
      the first draft of this test timed out at 30s on `/` and looked like a
      broken button.
    */
    const answered = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === "/api/session" &&
        response.request().method() === "GET",
    );
    await page.goto(path);
    await answered;
    await expect(login(page), `Login on ${path} while signed in`).toHaveCount(
      0,
    );
  }
});

test("never flashes at a signed-in traveller during the read", async ({
  page,
}) => {
  /*
    `undefined` is falsy, so rendering through the loading state would show
    Login to somebody who is signed in on every single page load and then take
    it away. The issue names it: "no page flashes it while loading."

    Sampled rather than watched for, because a flash is a frame and there is no
    event for it. Every sample from first paint onwards must be zero.
  */
  await page.goto("/account");
  await signIn(page);
  await expect(page.getByText("You are signed in")).toBeVisible();

  await page.goto("/trips", { waitUntil: "commit" });
  for (let i = 0; i < 25; i += 1) {
    expect(await login(page).count(), `Login appeared on sample ${i}`).toBe(0);
    await page.waitForTimeout(20);
  }
});

test("the top of a reel still scrolls the feed", async ({ page, isMobile }) => {
  test.skip(!isMobile, "the masthead is a phone surface; the rail replaces it");

  /*
    The regression this placement invites. The masthead spans the full width
    and is `pointer-events-none` so the whole top of a reel stays draggable;
    giving the strip pointer events to hold a button would kill a swipe exactly
    where a thumb rests.

    A REAL touch drag, through CDP. The first draft used `page.mouse` and
    failed with `scrollTop: 0`, which read as "the strip swallowed the swipe"
    and was in fact a mouse drag doing nothing to a `touch-action: pan-y`
    scroller. It would have reported a defect that was not there, and would
    have kept reporting it after any fix.
  */
  await page.goto("/");
  await page.waitForSelector('article[aria-posinset="1"]');
  await expect(login(page)).toBeVisible();

  const viewport = page.viewportSize()!;
  const x = viewport.width / 2;
  const strip = await login(page).boundingBox();
  if (!strip) throw new Error("no Login button to swipe beside");

  // The drag STARTS inside the masthead strip, level with the button.
  await swipe(
    page,
    { x, y: strip.y + strip.height / 2 },
    { x, y: viewport.height * 0.75 },
  );
  await swipe(
    page,
    { x, y: viewport.height * 0.75 },
    { x, y: strip.y + strip.height / 2 },
  );

  /*
    Asserted on the card rather than on a scroll offset, the way the feed's own
    swipe test does: the order is the server's rotation, and a number here
    would break on a fixture change rather than on a dead strip.
  */
  await expect(page.locator('article[aria-posinset="1"]')).not.toBeInViewport();
  expect(new URL(page.url()).pathname).toBe("/");
});

test("the desktop placement is the same on every page", async ({
  page,
  isMobile,
}) => {
  test.skip(Boolean(isMobile), "the rail carries the mark above lg only");

  /*
    Above lg the header strip is hidden on a tab root, because the rail carries
    the mark. So the desktop button lives on the shell rather than in three
    screens, and this is what says it is one position and not three that drift.
  */
  const seen: number[] = [];
  for (const path of ["/", "/search", "/trips"]) {
    await page.goto(path);
    await expect(login(page), `no Login on ${path}`).toBeVisible();
    const box = await login(page).boundingBox();
    if (!box) throw new Error(`no box on ${path}`);
    seen.push(Math.round(box.y));
  }
  expect(new Set(seen).size, `Login moved between pages: ${seen}`).toBe(1);
});

test("an open redirect is refused, and the traveller stays on Account", async ({
  page,
}) => {
  /*
    `next` is attacker-controlled: anybody can send a link to
    `app.yuvoy.in/account?next=https://evil.example/login`. A traveller who
    signs in on OUR domain, with our form, and is then handed to somebody
    else's page in the same tab has been phished by us.

    Unit-tested exhaustively in `next-path.test.ts`; this proves the deployed
    screen actually consults the guard.
  */
  await page.goto("/account?next=https%3A%2F%2Fevil.example%2Flogin");
  await signIn(page);

  await expect(page.getByText("You are signed in")).toBeVisible();
  expect(new URL(page.url()).host).not.toContain("evil.example");
  expect(new URL(page.url()).pathname).toBe("/account");
});
