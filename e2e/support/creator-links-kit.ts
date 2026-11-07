import {
  expect,
  type Page,
  type Response,
  type TestInfo,
} from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import type { components } from "../../src/lib/api/schema.gen";
import { CREATOR_LINKS } from "../../mocks/creator-link-fixtures";

type CreatorLink = components["schemas"]["CreatorLink"];

/*
  What creator-links.spec.ts and creator-links-get.spec.ts share: the
  words, the past trips, the sign-in, the locators and the readers of what
  the API answered and what Copy and Share handed over. Moved out of
  creator-links.spec.ts as they were, so each file stays under 500 lines
  (yuvoy-app#243).
*/

const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

/** The same check `redesign-axe.spec.ts` runs, once entrances finish. */
export async function expectAccessible(page: Page) {
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
  for (const ch of `${info.project.name}|${info.testId}|${info.retry}`) {
    h = (Math.imul(h, 31) + ch.charCodeAt(0)) >>> 0;
  }
  return `9${String(h % 1e9).padStart(9, "0")}`;
}

/** Signs in on Account, as `session-cookie.spec.ts` does. */
export async function signIn(page: Page, info: TestInfo) {
  await page.goto("/account");
  await page.getByLabel("Your WhatsApp number").fill(numberFor(info));
  await page.getByRole("button", { name: "Send me a code" }).click();
  await page.getByLabel("Sign-in code").fill("123456");
  await page.getByRole("button", { name: "Show me my trips" }).click();
  await expect(
    page.getByRole("button", { name: "Sign out on this device" }),
  ).toBeVisible();
}

/* The words, as the issue writes them. */
export const INTRO =
  "Share a link to something you went on. We count opens and bookings through it. The counts are indicative. Yuvoy does not pay for links yet.";
export const EMPTY = "No links yet. Get one from a trip you went on.";
export const FAILED = "Your links did not load";
export const MADE = "Your link is ready. It is in Your links on Account too.";
export const ALREADY =
  "You already have this link. It is in Your links on Account.";
export const MESSAGE_COPIED =
  "Message copied. Paste it where you want to send it.";

/* The API's sentences (yuvoy-mobile#389), shown as sent. */
export const NOT_WENT =
  "You can get a link only to something you went on, once it is over.";
export const NOT_OPEN_YET = "You can get a link once the event is over.";
export const RATE_LIMITED =
  "You have made 20 links today. You can make more tomorrow.";
export const UNAVAILABLE = "Links cannot be made on this service right now.";
export const NOT_FOUND = "We could not find your links.";

/* The past trips (`PAST_TRIP`, `MISSED_TRIP` in `booking-handlers.ts`). */
export const WENT = "Sunset cruise off Radhanagar"; // completed: offered a link
export const MISSED = "Dawn birdwatching at Chidiya Tapu"; // no_show: no button

/* The two links the list starts with. */
export const [BOOKED, UNLISTED] = CREATOR_LINKS;

const CARD = 'a[href^="/booking"]';

export const account = (scenario?: string) =>
  scenario ? `/account?__scenario=${scenario}` : "/account";

export const yourLinks = (page: Page) =>
  page.getByRole("region", { name: "Your links" });

/* One row per link (`your-links.tsx`). */
export const linkRows = (page: Page) =>
  yourLinks(page).getByTestId("creator-link");

export const linkRow = (page: Page, title: string) =>
  linkRows(page).filter({ hasText: title });

export const tripRow = (page: Page, title: string) =>
  page.getByRole("listitem").filter({ hasText: title });

/** Trips, Past tab, under a scenario. */
export async function openPast(page: Page, scenario?: string) {
  await page.goto(scenario ? `/trips?__scenario=${scenario}` : "/trips");
  await page.getByRole("tab", { name: /past/i }).click();
  await page.waitForSelector(CARD);
  await expect(page.getByText(WENT).first()).toBeVisible();
}

/**
 * Waits until the app knows whether the creator release is open to this
 * caller: the browser's `GET /app-config`, and at `staff` the caller's
 * cohort from `GET /me`. Then two frames, so a gate that opened would have
 * rendered and asked for the list. `networkidle` never comes on these pages.
 */
export function releaseKnown(page: Page, scenario?: string) {
  const config = page.waitForResponse((r) =>
    new URL(r.url()).pathname.endsWith("/app-config"),
  );
  const me = scenario
    ? page.waitForResponse((r) => new URL(r.url()).pathname === "/api/v1/me")
    : Promise.resolve(null);
  return async () => {
    await Promise.all([config, me]);
    await page.evaluate(
      () =>
        new Promise((done) =>
          requestAnimationFrame(() => requestAnimationFrame(done)),
        ),
    );
  };
}

export const isList = (r: Response) =>
  new URL(r.url()).pathname === "/api/v1/me/creator-links" &&
  r.request().method() === "GET";

const isMake = (r: Response) =>
  new URL(r.url()).pathname === "/api/v1/me/creator-links" &&
  r.request().method() === "POST";

/**
 * The answer as the mock worker received it, for a test that reads its body.
 * Each call is seen twice, by the page and by the worker that passes it on,
 * and Chromium often drops the body of the page's copy: `response.json()` then
 * fails with no navigation anywhere (yuvoy-app#209's CI, on the mobile project).
 */
export const workerAnswer = (page: Page, isAnswer: (r: Response) => boolean) =>
  page.context().waitForEvent("response", {
    predicate: (r) => isAnswer(r) && r.request().serviceWorker() !== null,
  });

/** Presses Get my link on a trip and returns the API's answer. */
export async function getMyLink(page: Page, title: string) {
  const answered = workerAnswer(page, isMake);
  await tripRow(page, title)
    .getByRole("button", { name: "Get my link" })
    .click();
  const response = await answered;
  return {
    status: response.status(),
    body: (await response.json()) as {
      link?: string;
      target?: { id: string; title: string };
      error?: { message: string };
    },
  };
}

/**
 * The row's counts line, word for word as the issue has it at every count,
 * 1 included ("1 opens", "1 bookings"), as the phone app reads.
 */
export const counts = (
  l: Pick<CreatorLink, "opens30Days" | "opensTotal" | "bookings">,
) =>
  `${l.opens30Days} opens in the last 30 days · ${l.opensTotal} in all · ${l.bookings} bookings`;

/** The sentence Share hands over. */
export const shareText = (l: CreatorLink) =>
  `I went on ${l.target.title} with Yuvoy. Have a look: ${l.link}`;

/**
 * Records what Copy and Share hand over. `share` false leaves the browser
 * with no Web Share API, so Share has to copy instead.
 */
export async function recordHandOver(page: Page, share: boolean) {
  await page.addInitScript((withShare: boolean) => {
    const w = window as unknown as { __copied: string[]; __shared: unknown[] };
    w.__copied = [];
    w.__shared = [];
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: async (text: string) => {
          w.__copied.push(text);
        },
      },
    });
    if (withShare) {
      Object.defineProperty(navigator, "share", {
        configurable: true,
        value: async (data: unknown) => {
          w.__shared.push(data);
        },
      });
      Object.defineProperty(navigator, "canShare", {
        configurable: true,
        value: () => true,
      });
    } else {
      const proto = Navigator.prototype as unknown as Record<string, unknown>;
      delete proto.share;
      delete proto.canShare;
    }
  }, share);
}

export const handedOver = (page: Page) =>
  page.evaluate(() => {
    const w = window as unknown as { __copied: string[]; __shared: unknown[] };
    return { copied: w.__copied, shared: w.__shared };
  });
