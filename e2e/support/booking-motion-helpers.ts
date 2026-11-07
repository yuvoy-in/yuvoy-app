import { expect, type Page } from "@playwright/test";

/**
 * The helpers of the booking motion tests: slowed and refused requests, the Trips tab frames read
 * off the page, and the steps a booking takes. Moved here unchanged from booking-motion.ts
 * (yuvoy-app#243).
 */

export const EASE_MOVE = "cubic-bezier(0.2, 0, 0, 1)";
export const CHARTER = "/e/private-boat-charter/book";

/** Holds every reservation request for `ms`. */
export async function slowReservations(page: Page, ms: number) {
  await page.addInitScript((wait) => {
    const fetchOf = window.fetch.bind(window);
    window.fetch = async (input, init) => {
      const request = input instanceof Request ? input : null;
      const url = request?.url ?? String(input);
      if (
        /\/reservations$/.test(url) &&
        (request?.method ?? init?.method) === "POST"
      )
        await new Promise((resolve) => setTimeout(resolve, wait));
      return fetchOf(input, init);
    };
  }, ms);
}

/** Has the mock refuse every reservation (booking paused), and nothing else. */
export async function refuseReservations(page: Page) {
  await page.addInitScript(() => {
    const fetchOf = window.fetch.bind(window);
    window.fetch = async (input, init) => {
      // Either shape: the client hands fetch a URL and an init.
      const url =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.href
            : input.url;
      const method =
        init?.method ?? (input instanceof Request ? input.method : "GET");
      if (method.toUpperCase() === "POST" && /\/reservations$/.test(url)) {
        const request = new Request(input, init);
        const refused = new Request(request, {
          headers: new Headers([
            ...request.headers.entries(),
            ["x-yuvoy-scenario", "booking-disabled"],
          ]),
        });
        return fetchOf(refused);
      }
      return fetchOf(input, init);
    };
  });
}

/** Holds every read of the trips list for `ms`, as a slow signal does. */
export async function slowTrips(page: Page, ms: number) {
  await page.addInitScript((wait) => {
    const fetchOf = window.fetch.bind(window);
    window.fetch = async (input, init) => {
      const url =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.href
            : input.url;
      if (/\/api\/v1\/me\/bookings/.test(url))
        await new Promise((resolve) => setTimeout(resolve, wait));
      return fetchOf(input, init);
    };
  }, ms);
}

/**
 * One frame of a Trips tab change, as drawn: computed opacity, which carries
 * every animation running on the element.
 */
interface TabFrame {
  /** ms since the tab was pressed. */
  t: number;
  /** The new tab's own element. */
  tab: number | null;
  /** Its trips, or its empty state, inside it. */
  content: number | null;
  /** Its skeleton as drawn (under the tab), 0 when there is none. */
  skeleton: number;
  /** The fading copy of the tab it replaced, 0 when there is none. */
  leaving: number;
}

/**
 * A tab pressed: when, how many frames had been read by then, and how opaque
 * the tab on screen was drawn at most.
 */
interface TabPress {
  t: number;
  frame: number;
  drawn: number;
}

interface TabFrames {
  frames: TabFrame[];
  presses: TabPress[];
}

type TabFramesWindow = {
  __tabFrames: () => TabFrames;
  __tabAtRest: () => boolean;
};

/**
 * Starts reading every frame drawn under the Trips tabs, and every press on
 * one, timed from the first press. A press is read in the capture phase,
 * before the app has heard of it, so `drawn` is the tab as it was then.
 */
async function readTabFrames(page: Page) {
  await page.evaluate(() => {
    const frames: TabFrame[] = [];
    const presses: TabPress[] = [];
    const op = (el: Element | null | undefined) =>
      el ? Number(getComputedStyle(el).opacity) : null;
    const shown = () => {
      const key = document
        .querySelector('[aria-label="Which trips"] [aria-selected="true"]')
        ?.getAttribute("data-tab");
      return key ? document.querySelector(`[data-motion-key="${key}"]`) : null;
    };
    const press = (e: Event) => {
      if (
        (e.target as Element | null)?.closest?.(
          '[aria-label="Which trips"] [data-tab]',
        )
      )
        presses.push({
          t: performance.now(),
          frame: frames.length,
          /*
            The higher of two readings. WebKit's computed opacity and an
            arrival's progress can disagree by a frame or so at a press, either
            way (0 against 0.29, 0.31 against 0, in 100 runs, yuvoy-app#210),
            and the app fades its copy from the progress. Taking the computed
            one alone called that copy a flash; a copy faded from 1 is still
            far above both.
          */
          drawn: Math.max(
            op(shown()) ?? 0,
            ...(shown()?.getAnimations() ?? []).map((a) =>
              Number(a.effect?.getComputedTiming().progress ?? 0),
            ),
          ),
        });
    };
    document.addEventListener("click", press, { capture: true });
    let on = true;
    const read = () => {
      if (!on) return;
      const tab = shown();
      const content = tab?.querySelector(
        '[data-motion-key="list"], [data-motion-key="empty"]',
      );
      const loading = tab?.querySelector('[data-motion-key="loading"]');
      const copies = tab?.parentElement
        ? [...tab.parentElement.children].filter((el) =>
            el.hasAttribute("data-motion-ghost"),
          )
        : [];
      frames.push({
        t: performance.now(),
        tab: op(tab),
        content: op(content),
        skeleton: loading ? (op(tab) ?? 0) * (op(loading) ?? 0) : 0,
        leaving: Math.max(0, ...copies.map((el) => op(el) ?? 0)),
      });
      requestAnimationFrame(read);
    };
    requestAnimationFrame(read);
    // The last few frames drawn show the new tab and its trips whole, and no
    // copy of the old one: the change is over.
    (window as unknown as TabFramesWindow).__tabAtRest = () => {
      const last = frames.slice(-5);
      return (
        last.length === 5 &&
        last.every((f) => f.tab === 1 && f.content === 1 && f.leaving === 0)
      );
    };
    (window as unknown as TabFramesWindow).__tabFrames = () => {
      on = false;
      document.removeEventListener("click", press, { capture: true });
      const start = presses[0]?.t ?? 0;
      const first = presses[0]?.frame ?? frames.length;
      /*
        By order, not by time. WebKit's clock moves in whole milliseconds, so a
        frame drawn just before the press can carry the press's own time. It
        read the old tab, whole, and looked like the new tab coming up and going
        off (yuvoy-app#210).
      */
      return {
        frames: frames.slice(first).map((f) => ({ ...f, t: f.t - start })),
        presses: presses.map((p) => ({
          ...p,
          t: p.t - start,
          frame: p.frame - first,
        })),
      };
    };
  });
}

const tabFrames = (page: Page) =>
  page.evaluate(() => (window as unknown as TabFramesWindow).__tabFrames());

/**
 * Waits `ms`, and then until the change has come to rest, for at most 5s
 * more. A slow runner (GitHub's hosted WebKit) can still be fading when a
 * fixed wait ends, which read as a tab that never settled; every frame drawn
 * on the way is still read.
 */
async function untilAtRest(page: Page, ms: number) {
  await page.waitForTimeout(ms);
  await expect
    .poll(
      () =>
        page.evaluate(() =>
          (window as unknown as TabFramesWindow).__tabAtRest(),
        ),
      { timeout: 5000 },
    )
    .toBe(true);
}

/** Presses a tab and reads every frame drawn for `ms` after it. */
export async function tabChange(
  page: Page,
  name: RegExp,
  ms = 700,
): Promise<TabFrame[]> {
  await readTabFrames(page);
  await page
    .getByRole("tablist", { name: "Which trips" })
    .getByRole("tab", { name })
    .click();
  await untilAtRest(page, ms);
  return (await tabFrames(page)).frames;
}

/**
 * Two tabs pressed `gap` ms apart. From inside the page, so the gap is the
 * page's own clock and not the time a driver takes between two clicks.
 */
export async function twoQuickTabs(
  page: Page,
  [first, second]: [string, string],
  gap: number,
  ms = 900,
): Promise<TabFrames> {
  await readTabFrames(page);
  await page.evaluate(
    ([a, b, wait]) => {
      const tab = (name: string) =>
        document.querySelector<HTMLElement>(
          `[aria-label="Which trips"] [data-tab="${name}"]`,
        )!;
      tab(a).click();
      setTimeout(() => tab(b).click(), wait);
    },
    [first, second, gap] as const,
  );
  await untilAtRest(page, ms);
  return tabFrames(page);
}

/** The first frame at which something that should only come up went down. */
function wentDown(
  frames: TabFrame[],
  of: (f: TabFrame) => number | null,
): TabFrame | undefined {
  let top = 0;
  for (const f of frames) {
    const v = of(f);
    if (v === null) {
      top = 0;
      continue;
    }
    if (v < top - 0.05) return f;
    top = Math.max(top, v);
  }
  return undefined;
}

/**
 * A tab change the way T07 A and the motion system §8 describe it: the old
 * tab fades out before anything of the new one is drawn, the new one only
 * comes up, no skeleton before a wait has lasted 300ms, and it all rests.
 */
export function expectCalm(frames: TabFrame[], label: string) {
  expect(frames.length, `${label}: nothing was drawn`).toBeGreaterThan(10);
  // The frames up to the one at fault: it alone cannot say what came before.
  const show = (f?: TabFrame) =>
    f ? JSON.stringify(frames.slice(0, frames.indexOf(f) + 1).slice(-12)) : "";
  const tabDown = wentDown(frames, (f) => f.tab);
  expect(tabDown, `${label}: the tab came up, went off ${show(tabDown)}`).toBe(
    undefined,
  );
  const listDown = wentDown(frames, (f) => f.content);
  expect(
    listDown,
    `${label}: its trips came up, went off ${show(listDown)}`,
  ).toBe(undefined);
  const both = frames.find((f) => f.leaving > 0.5 && (f.tab ?? 0) > 0.05);
  expect(both, `${label}: both tabs drawn at once ${show(both)}`).toBe(
    undefined,
  );
  const early = frames.find((f) => f.t < 300 && f.skeleton > 0.05);
  expect(early, `${label}: a skeleton before 300ms ${show(early)}`).toBe(
    undefined,
  );
  const last = frames.at(-1)!;
  expect([last.tab, last.content, last.leaving], label).toEqual([1, 1, 0]);
}

export const openDays = (page: Page) =>
  page
    .getByRole("group", { name: "The next two weeks" })
    .locator("button[aria-pressed]:not([disabled])");
export const openTimes = (page: Page) =>
  page
    .getByRole("region", { name: "What time?" })
    .locator("button[aria-pressed]:not([disabled])");

export async function fillContact(page: Page) {
  await page.getByLabel(/Your name/i).fill("Asha Menon");
  await page.getByLabel(/WhatsApp number/i).fill("+919000000000");
  await page.getByRole("checkbox", { name: /called off/i }).check();
}

/** On checkout for the charter, with a day and a time chosen. */
export async function chosen(page: Page) {
  await page.goto(CHARTER);
  await page.waitForLoadState("networkidle");
  await openDays(page).first().click();
  await openTimes(page).first().click();
  await expect(page.getByLabel(/Your name/i)).toBeVisible();
}

export async function signIn(page: Page) {
  await page.goto("/account");
  await page.getByLabel("Your WhatsApp number").fill("9111111111");
  await page.getByRole("button", { name: "Send me a code" }).click();
  await page.getByLabel("Sign-in code").fill("123456");
  await page.getByRole("button", { name: "Show me my trips" }).click();
  await expect(
    page.getByRole("button", { name: "Sign out on this device" }),
  ).toBeVisible();
}
