import { expect, type BrowserContext, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { PLAN_IDS } from "../../mocks/plan-fixtures";

/**
 * What the guest page's spec shares (yuvoy-mobile#373): a link token and
 * guest keys of the contract's shapes, the way to open a plan by its link
 * in a scenario, a returning guest's cookie, and the watchers that prove
 * what the page sent and read.
 *
 * Every spec runs against one mocked server, in parallel, and the by-link
 * mock keeps its guests by key. So each test makes its own key: two tests
 * answering as "Ravi" with one key would read each other's replies.
 */

/** A link token: `yp_` and 43 characters. */
export const TOKEN = `yp_${"E2eGuestPlanLink".padEnd(43, "x")}`;

/** The cookie the reply route sets, named after the plan's weekly series. */
export const KEY_COOKIE = `ypk_${PLAN_IDS.series}`;

/** A guest key of its own for one test: `ypk_` and 43 characters. */
export function freshKey(): string {
  const random = Math.random()
    .toString(36)
    .slice(2)
    .replace(/[^a-z0-9]/g, "");
  return `ypk_${`e2e${random}`.padEnd(43, "k").slice(0, 43)}`;
}

/** The plan's link in a scenario, as WhatsApp opens it: `/p/`, the query, the token. */
export function planLink(scenario?: string, token = TOKEN): string {
  return `/p/${scenario ? `?__scenario=${scenario}` : ""}#${token}`;
}

/** Opens a plan by its link and waits for its heading. */
export async function openPlan(page: Page, scenario?: string) {
  await page.goto(planLink(scenario));
  await expect(
    page.getByRole("heading", { level: 1, name: "Dinner at the beach shack" }),
  ).toBeVisible();
}

/**
 * This browser has replied before: the httpOnly key cookie the reply route
 * would have set, on `/p/` only, as the route sets it.
 */
export async function asReturningGuest(
  context: BrowserContext,
  baseURL: string | undefined,
  key = freshKey(),
): Promise<string> {
  await context.addCookies([
    {
      name: KEY_COOKIE,
      value: key,
      url: new URL("/p/", baseURL ?? "http://127.0.0.1:3100").href,
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
  return key;
}

/** One call the page made to its own route handlers, with what it sent. */
export interface GuestCall {
  route: string;
  body: Record<string, unknown>;
}

/** Every call to `/p/api/*`, in order, with its JSON body. */
export function guestCalls(page: Page): GuestCall[] {
  const calls: GuestCall[] = [];
  page.on("request", (request) => {
    const { pathname } = new URL(request.url());
    if (!pathname.startsWith("/p/api/")) return;
    let body: Record<string, unknown> = {};
    try {
      body = (request.postDataJSON() as Record<string, unknown>) ?? {};
    } catch {
      // Not JSON: the route refuses it, and the spec says so where it matters.
    }
    calls.push({ route: pathname.slice("/p/api/".length), body });
  });
  return calls;
}

/** The body of every `/p/api/*` answer the page read. */
export function guestAnswers(page: Page): Promise<string>[] {
  const bodies: Promise<string>[] = [];
  page.on("response", (response) => {
    if (new URL(response.url()).pathname.startsWith("/p/api/")) {
      bodies.push(response.text().catch(() => ""));
    }
  });
  return bodies;
}

/**
 * Every address the page asked for and every referrer it sent, as they
 * leave the browser, and every line it logged. A browser never sends a
 * fragment, so what is after `#` is cut off here as it is on the wire: the
 * check is that the token is in nothing BEFORE it, a query or a path.
 */
export function everythingSent(page: Page): {
  urls: string[];
  console: string[];
} {
  const seen = { urls: [] as string[], console: [] as string[] };
  const sent = (url: string) => url.split("#")[0];
  page.on("request", (request) => {
    seen.urls.push(sent(request.url()));
    const referer = request.headers()["referer"];
    if (referer) seen.urls.push(sent(referer));
  });
  page.on("console", (message) => seen.console.push(message.text()));
  page.on("pageerror", (error) => seen.console.push(String(error)));
  return seen;
}

/**
 * Answers a guest route from the test, on the context and not the page:
 * MSW's service worker stands in front of every fetch the page makes, and
 * a request it passes on comes from the worker, which `page.route` never
 * sees (see `search-reels.spec.ts`). `context.route` does, in Chromium,
 * the only engine this spec runs in.
 */
export function routeGuest(
  page: Page,
  route: "view" | "reply" | "link",
  handler: Parameters<BrowserContext["route"]>[1],
) {
  return page.context().route(`**/p/api/${route}`, handler);
}

/**
 * The page's own alerts, without the empty one Next.js keeps for route
 * announcements, which is `role="alert"` too.
 */
export function pageAlert(page: Page) {
  return page
    .getByRole("alert")
    .and(page.locator(":not(#__next-route-announcer__)"));
}

/**
 * The next reply reaches the server and its answer never reaches the page:
 * a connection lost on the way back. `route.fetch` runs through the
 * context's own request client, which keeps any cookie the answer sets, so
 * the key cookie it set is taken away again: the page never got it.
 */
export async function dropNextReplyAnswer(page: Page) {
  let dropped = false;
  await routeGuest(page, "reply", async (route) => {
    if (dropped) return route.continue();
    dropped = true;
    await route.fetch();
    await page.context().clearCookies({ name: KEY_COOKIE });
    await route.abort("connectionreset");
  });
}

/** A first reply's fields: a time, the age tick, a first name. */
export async function fillFirstReply(page: Page, name: string) {
  await page.getByRole("radio", { name: "Can", exact: true }).first().check();
  await page.getByRole("checkbox", { name: "I am 18 or older" }).check();
  await page.getByRole("textbox", { name: "Your first name" }).fill(name);
}

/** Signs in on `/account` as the page there asks. */
export async function signInHere(page: Page, number: string) {
  await page.getByLabel("Your WhatsApp number").fill(number);
  await page.getByRole("button", { name: "Send me a code" }).click();
  await page.getByLabel("Sign-in code").fill("123456");
  await page.getByRole("button", { name: "Show me my trips" }).click();
}

/** Signs in from `/account` and waits until it has. */
export async function signIn(page: Page, number: string) {
  await page.goto("/account");
  await signInHere(page, number);
  await expect(
    page.getByRole("button", { name: "Sign out on this device" }),
  ).toBeVisible();
}

/** The planner's number: the mock's planner session is `sess_919000000001`. */
export const PLANNER_NUMBER = "9000000001";

/**
 * Somebody else with an account, new for each test: the mock remembers
 * which accounts answered a plan, and both projects and any retry share it.
 */
export function freshNumber(): string {
  return `98${String(Math.floor(Math.random() * 1e8)).padStart(8, "0")}`;
}

/** The API's error envelope, as the route handlers pass it on. */
export function envelope(code: string, details?: Record<string, unknown>) {
  return JSON.stringify({
    error: {
      code,
      message: "Refused.",
      requestId: "01JE2E",
      ...(details ? { details } : {}),
    },
  });
}

export async function expectAccessible(page: Page) {
  /*
    Let entrances finish first, as `explore-place.spec.ts` does: axe
    measuring a sheet mid-rise reads the page behind its tint, a colour
    nobody sees. Settled ones only, never an infinite one.
  */
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
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(results.violations).toEqual([]);
}
