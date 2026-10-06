import { test, expect, type Page } from "@playwright/test";
import { forgetAnimations, played, recordAnimations } from "./animations";

/**
 * Booking, seen happening (T07 A, T08 A, T09 A, T10 A, approved 4 Oct 2026).
 * Defined once, run by `motion.spec` on Chromium and `motion-webkit.spec` on
 * WebKit. Every Web Animations call is recorded with the element it moved
 * (`animations.ts`); CSS transitions are read off the element.
 *
 * A reservation is made slow, or refused, in the page rather than in the
 * network: the mocks answer from a service worker, which `page.route` never
 * sees, so `fetch` itself is held, or told the mock's own scenario header.
 */

const EASE_MOVE = "cubic-bezier(0.2, 0, 0, 1)";
const CHARTER = "/e/private-boat-charter/book";

/** Holds every reservation request for `ms`. */
async function slowReservations(page: Page, ms: number) {
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
async function refuseReservations(page: Page) {
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
async function slowTrips(page: Page, ms: number) {
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

/** A tab pressed: when, and how opaque the tab on screen was drawn then. */
interface TabPress {
  t: number;
  drawn: number;
}

interface TabFrames {
  frames: TabFrame[];
  presses: TabPress[];
}

type TabFramesWindow = { __tabFrames: () => TabFrames };

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
        presses.push({ t: performance.now(), drawn: op(shown()) ?? 0 });
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
    (window as unknown as TabFramesWindow).__tabFrames = () => {
      on = false;
      document.removeEventListener("click", press, { capture: true });
      const start = presses[0]?.t ?? Infinity;
      return {
        frames: frames
          .filter((f) => f.t >= start)
          .map((f) => ({ ...f, t: f.t - start })),
        presses: presses.map((p) => ({ ...p, t: p.t - start })),
      };
    };
  });
}

const tabFrames = (page: Page) =>
  page.evaluate(() => (window as unknown as TabFramesWindow).__tabFrames());

/** Presses a tab and reads every frame drawn for `ms` after it. */
async function tabChange(
  page: Page,
  name: RegExp,
  ms = 700,
): Promise<TabFrame[]> {
  await readTabFrames(page);
  await page
    .getByRole("tablist", { name: "Which trips" })
    .getByRole("tab", { name })
    .click();
  await page.waitForTimeout(ms);
  return (await tabFrames(page)).frames;
}

/**
 * Two tabs pressed `gap` ms apart. From inside the page, so the gap is the
 * page's own clock and not the time a driver takes between two clicks.
 */
async function twoQuickTabs(
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
  await page.waitForTimeout(ms);
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
function expectCalm(frames: TabFrame[], label: string) {
  expect(frames.length, `${label}: nothing was drawn`).toBeGreaterThan(10);
  const show = (f?: TabFrame) => JSON.stringify(f);
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

const openDays = (page: Page) =>
  page
    .getByRole("group", { name: "The next two weeks" })
    .locator("button[aria-pressed]:not([disabled])");
const openTimes = (page: Page) =>
  page
    .getByRole("region", { name: "What time?" })
    .locator("button[aria-pressed]:not([disabled])");

async function fillContact(page: Page) {
  await page.getByLabel(/Your name/i).fill("Asha Menon");
  await page.getByLabel(/WhatsApp number/i).fill("+919000000000");
  await page.getByRole("checkbox", { name: /called off/i }).check();
}

/** On checkout for the charter, with a day and a time chosen. */
async function chosen(page: Page) {
  await page.goto(CHARTER);
  await page.waitForLoadState("networkidle");
  await openDays(page).first().click();
  await openTimes(page).first().click();
  await expect(page.getByLabel(/Your name/i)).toBeVisible();
}

async function signIn(page: Page) {
  await page.goto("/account");
  await page.getByLabel("Your WhatsApp number").fill("9111111111");
  await page.getByRole("button", { name: "Send me a code" }).click();
  await page.getByLabel("Sign-in code").fill("123456");
  await page.getByRole("button", { name: "Show me my trips" }).click();
  await expect(
    page.getByRole("button", { name: "Sign out on this device" }),
  ).toBeVisible();
}

export function defineBookingMotion() {
  test.describe("the Trips tabs (T07 A)", () => {
    test("one fill glides to the tab tapped, and the list fades through", async ({
      page,
    }) => {
      await recordAnimations(page);
      await signIn(page);
      await page.goto("/trips");
      const tabs = page.getByRole("tablist", { name: "Which trips" });
      await expect(tabs).toHaveAttribute("data-tab-fill", "on");
      await page.waitForLoadState("networkidle");
      await forgetAnimations(page);

      await tabs.getByRole("tab", { name: /past/i }).click();
      await expect(tabs.getByRole("tab", { name: /past/i })).toHaveAttribute(
        "aria-selected",
        "true",
      );
      // The fill: one clip, gliding on `move` for 250ms.
      const glide = await tabs.locator(".trip-tab-fill").evaluate((el) =>
        el.getAnimations().map((a) => ({
          property: (a as CSSTransition).transitionProperty,
          duration: Number(a.effect?.getComputedTiming().duration),
          easing: String(a.effect?.getTiming().easing),
        })),
      );
      expect(glide).toContainEqual({
        property: "clip-path",
        duration: 250,
        easing: "cubic-bezier(0.2, 0, 0, 1)",
      });
      // The list: the old one fades as a copy, then the new one arrives.
      await expect
        .poll(async () => (await played(page)).filter((p) => p.copy).length)
        .toBeGreaterThan(0);
      const all = await played(page);
      const out = all.find((p) => p.copy);
      expect(out!.duration).toBe(100);
      const into = all.find(
        (p) =>
          !p.copy && p.keyframes.length === 1 && p.keyframes[0].opacity === 0,
      );
      expect(into, "the new list landed in one frame").toBeTruthy();
      expect(into!.delay).toBe(100);
      expect(into!.duration).toBe(150);
    });

    /*
      What the test above cannot see: it reads the keyframes each call was
      given, and on 7 Oct 2026 every one of them was exactly what the code
      meant, and every arrival still played backwards (`arriveFrom`). The
      owner saw the next tab's trips come up, go off and come back. These
      read what is DRAWN, frame by frame.
    */
    test("a tab's trips only ever come up: never drawn, taken away and drawn again", async ({
      page,
    }) => {
      await signIn(page);
      await page.goto("/trips");
      const tabs = page.getByRole("tablist", { name: "Which trips" });
      await expect(tabs).toHaveAttribute("data-tab-fill", "on");
      await page.waitForLoadState("networkidle");

      // Opened for the first time, then opened again from the cache.
      expectCalm(await tabChange(page, /^past/i), "Past, first time");
      expectCalm(await tabChange(page, /^upcoming/i), "Upcoming, again");
      expectCalm(await tabChange(page, /^cancelled/i), "Cancelled, first time");
      expectCalm(await tabChange(page, /^past/i), "Past, again");
    });

    test("a tab slow to answer shows nothing for 300ms, then its skeleton, held 300ms", async ({
      page,
    }) => {
      await slowTrips(page, 900);
      await signIn(page);
      await page.goto("/trips");
      const tabs = page.getByRole("tablist", { name: "Which trips" });
      await expect(tabs).toHaveAttribute("data-tab-fill", "on");
      await expect(
        page.getByRole("main").getByRole("listitem").first(),
      ).toBeVisible({
        timeout: 10_000,
      });

      const frames = await tabChange(page, /^past/i, 2000);
      expectCalm(frames, "Past, slow");
      const shown = frames.find((f) => f.skeleton > 0.05);
      expect(shown, "a 900ms wait never showed its skeleton").toBeTruthy();
      const gone = frames.find((f) => f.t > shown!.t && f.skeleton === 0);
      expect(gone, "the skeleton was never replaced").toBeTruthy();
      // Once shown it stays: a skeleton that blinks is the flash itself.
      expect(gone!.t - shown!.t).toBeGreaterThanOrEqual(200);
    });

    test("a tab left as it arrives fades from where it had got to, never whole", async ({
      page,
    }) => {
      await signIn(page);
      await page.goto("/trips");
      const tabs = page.getByRole("tablist", { name: "Which trips" });
      await expect(tabs).toHaveAttribute("data-tab-fill", "on");
      await page.waitForLoadState("networkidle");

      // Past is still coming up when Cancelled is pressed.
      const { frames, presses } = await twoQuickTabs(
        page,
        ["past", "cancelled"],
        120,
      );
      expect(presses).toHaveLength(2);
      const second = presses[1];
      const after = frames
        .filter((f) => f.t >= second.t)
        .map((f) => ({ ...f, t: f.t - second.t }));
      const flash = after.find((f) => f.leaving > second.drawn + 0.05);
      expect(
        flash,
        `Past was drawn at ${second.drawn} and left brighter: ${JSON.stringify(flash)}`,
      ).toBe(undefined);
      expectCalm(after, "Cancelled, pressed as Past arrived");
    });
  });

  test.describe("choosing a day and a time (T09 A)", () => {
    test("the chosen day is one object that travels, and the times rise in order", async ({
      page,
    }) => {
      await recordAnimations(page);
      await page.goto(CHARTER);
      await page.waitForLoadState("networkidle");
      const days = openDays(page);
      await expect(days.nth(1)).toBeVisible();
      await forgetAnimations(page);

      // The first day chosen: the window fades in under the finger.
      await days.first().click();
      let all = await played(page);
      const appeared = all.find(
        (p) => p.cls.includes("day-window") && !p.cls.includes("copy"),
      );
      expect(appeared, "the chosen day was not drawn").toBeTruthy();
      expect(appeared!.keyframes).toEqual([{ opacity: 0, offset: 0 }]);
      // The day's times rise in one after another.
      await expect
        .poll(
          async () =>
            (await played(page)).filter(
              (p) => p.keyframes[0]?.transform === "translateY(8px)",
            ).length,
        )
        .toBeGreaterThan(0);
      all = await played(page);
      const times = all.filter(
        (p) => p.keyframes[0]?.transform === "translateY(8px)",
      );
      expect(times[0].duration).toBe(200);
      expect(times.map((t) => t.delay)).toEqual(expect.arrayContaining([0]));
      expect(Math.max(...times.map((t) => t.delay))).toBeLessThanOrEqual(160);

      // The next day: the window glides there while its copy glides back.
      await forgetAnimations(page);
      await days.nth(1).click();
      all = await played(page);
      const win = all.find(
        (p) =>
          p.cls.includes("day-window") &&
          !p.cls.includes("copy") &&
          p.keyframes[0]?.transform,
      );
      const copy = all.find((p) => p.cls.includes("day-window-copy"));
      expect(win, "the chosen day jumped").toBeTruthy();
      expect(copy).toBeTruthy();
      const dx = (t?: string) =>
        Number(/translateX\(([-\d.]+)px\)/.exec(t ?? "")?.[1]);
      expect(dx(win!.keyframes[0].transform)).toBeLessThan(0);
      expect(dx(copy!.keyframes[0].transform)).toBe(
        -dx(win!.keyframes[0].transform),
      );
      expect(win!.duration).toBe(250);
      expect(win!.easing).toBe(EASE_MOVE);
      // The days under it draw unchosen; the window draws the choice.
      await expect(
        page.getByRole("group", { name: "The next two weeks" }),
      ).toHaveAttribute("data-day-window", "on");
    });

    test("a time chosen: the heading fades through, the form fades in and its foot rises", async ({
      page,
    }) => {
      await recordAnimations(page);
      await page.goto(CHARTER);
      await page.waitForLoadState("networkidle");
      // The second open day has two departures, so neither is chosen for us.
      await openDays(page).nth(1).click();
      await expect(openTimes(page).nth(1)).toBeVisible();
      await forgetAnimations(page);
      await openTimes(page).first().click();
      await expect(page.getByLabel(/Your name/i)).toBeVisible();
      const all = await played(page);
      const foot = all.find(
        (p) => p.keyframes[0]?.transform === "translateY(100%)",
      );
      expect(foot, "the foot appeared in one frame").toBeTruthy();
      expect(foot!.duration).toBe(250);
      const heading = all.filter((p) =>
        p.text.includes("When would you like to go?"),
      );
      expect(heading.some((p) => p.keyframes.at(-1)?.opacity === 0)).toBe(true);
      // The party number rolls.
      await forgetAnimations(page);
      await page.getByRole("button", { name: "One more guest" }).click();
      const rolled = (await played(page)).find(
        (p) =>
          p.text === "2" &&
          /^translateY\(\d/.test(p.keyframes[0]?.transform ?? ""),
      );
      expect(rolled, "the party number changed without rolling").toBeTruthy();
    });
  });

  test.describe("a link that names the day and the time (T09 A)", () => {
    test("opens whole: nothing arrives that the traveller did not just choose", async ({
      page,
    }) => {
      await page.goto(CHARTER);
      await expect(openDays(page).nth(1)).toBeVisible();
      await openDays(page).nth(1).click();
      await openTimes(page).first().click();
      await expect(page).toHaveURL(/[?&]slot=/);
      const link = page.url();
      // The same address, opened afresh, as a shared link is.
      await recordAnimations(page);
      await page.goto("about:blank");
      await page.goto(link);
      /*
        Everything the link names, drawn: the form, the chosen time, and the
        strip's window over the chosen day. Each entrance guarded here is
        started by the render that draws its element, so once all three are
        there, one more frame has seen anything that was going to play. Not
        "networkidle": under a full suite's load it never came.
      */
      await expect(page.getByLabel(/Your name/i)).toBeVisible();
      await expect(openTimes(page).first()).toHaveAttribute(
        "aria-pressed",
        "true",
      );
      await expect(page.locator("[data-day-window='on']")).toHaveCount(1);
      await page.evaluate(
        () =>
          new Promise((done) =>
            requestAnimationFrame(() => requestAnimationFrame(done)),
          ),
      );
      const all = await played(page);
      const entrances = all.filter(
        (p) =>
          p.cls.includes("day-window") ||
          p.keyframes[0]?.transform === "translateY(100%)" ||
          p.keyframes[0]?.transform === "translateY(8px)",
      );
      expect(entrances, "the page arrived in pieces").toEqual([]);
      /*
        Nor does the heading fade through to the time the link names: that
        resolves as the dates land, and words that change as a screen opens
        were not seen changing. They faded until 6 Oct 2026, when an
        accessibility check caught them mid-fade (stability audit).
      */
      const heading = all.filter(
        (p) =>
          p.text === "When would you like to go?" ||
          / · \d{2}:\d{2}$/.test(p.text),
      );
      expect(heading, "the heading faded in as the page opened").toEqual([]);
    });
  });

  test.describe("the Book button (T08 A)", () => {
    test("keeps its colour while it works, and shows a ring only after 300ms", async ({
      page,
    }) => {
      await slowReservations(page, 3000);
      await chosen(page);
      await fillContact(page);
      const book = page.getByRole("button", {
        name: /^Book now, pay ₹[\d,]+ cash on the day$/,
      });
      // Ready, and done fading up from "not yet" (its own 200ms).
      await expect(book).toHaveCSS("opacity", "1");
      await book.click();
      const working = page.getByRole("button", { name: "Booking" });
      await expect(working).toHaveAttribute("aria-busy", "true");
      // Not `disabled` (that faded it to 40%): `aria-disabled`, which
      // Playwright's own enabled check reads as disabled, so ask the element.
      expect(
        await working.evaluate((el) => (el as HTMLButtonElement).disabled),
      ).toBe(false);
      // Full colour: not faded the way a disabled button is.
      expect(await working.evaluate((el) => getComputedStyle(el).opacity)).toBe(
        "1",
      );
      const ring = working.locator(".button-ring");
      expect(
        Number(await ring.evaluate((el) => getComputedStyle(el).opacity)),
      ).toBeLessThan(0.5);
      await expect
        .poll(
          async () =>
            Number(await ring.evaluate((el) => getComputedStyle(el).opacity)),
          { intervals: [50] },
        )
        .toBeGreaterThan(0.95);
      await expect(page).toHaveURL(/\/booking#t=/, { timeout: 10_000 });
    });

    test("a refusal is brought into view above the bar and takes focus", async ({
      page,
    }) => {
      await refuseReservations(page);
      await chosen(page);
      await fillContact(page);
      await page
        .getByRole("button", {
          name: /^Book now, pay ₹[\d,]+ cash on the day$/,
        })
        .click();
      const landing = page.locator('[tabindex="-1"].motion-rise-in');
      await expect(landing).toBeFocused();
      await expect(landing.getByRole("alert")).toBeVisible();
      // Clear of the sticky bar, once the page has made room.
      await expect
        .poll(async () => {
          const panel = await landing.boundingBox();
          const bar = await page.locator("form > div.sticky").boundingBox();
          return panel && bar ? bar.y - (panel.y + panel.height) : -1;
        })
        // Clear of it: above the bar, or sitting on it where the page ends.
        .toBeGreaterThanOrEqual(-1);
      await expect(
        page.getByRole("button", { name: /^Book now/ }),
      ).not.toHaveAttribute("aria-busy");
    });
  });

  test.describe("booking confirmed (T10 A)", () => {
    test("the pass settles on the page the booking tap lands on, and never on a link", async ({
      page,
    }) => {
      await recordAnimations(page);
      await chosen(page);
      await fillContact(page);
      await forgetAnimations(page);
      await page
        .getByRole("button", {
          name: /^Book now, pay ₹[\d,]+ cash on the day$/,
        })
        .click();
      await expect(page).toHaveURL(/\/booking#t=/);
      await expect(page.locator(".eyebrow-tick-mark")).toBeVisible();

      const moment = async () => {
        const all = await played(page);
        return {
          tick: all.find((p) => p.data.includes("data-arrival-tick")),
          panel: all.find(
            (p) =>
              p.data.includes("data-arrival-panel") &&
              p.keyframes[0]?.transform,
          ),
          reference: all.find((p) => p.data.includes("data-arrival-reference")),
        };
      };
      await expect.poll(async () => Boolean((await moment()).tick)).toBe(true);
      const { tick, panel, reference } = await moment();
      expect(tick!.keyframes.map((k) => Number(k.strokeDashoffset))).toEqual([
        1, 0,
      ]);
      expect(tick!.delay).toBe(100);
      expect(panel!.keyframes[0].transform).toBe("translateY(12px)");
      expect(panel!.duration).toBe(250);
      expect(reference!.delay).toBe(200);
      // 350ms in all, the moment budget kept.
      expect(reference!.delay + reference!.duration).toBe(350);

      /*
        Never again: the same page opened from a link is the page as it is.
        (A reload cannot be used here: the mocks keep a booking made in the
        test in the page's own memory, and a reload forgets it.)
      */
      // A new document, as a link opened from a message is.
      await page.goto("about:blank");
      await page.goto("/booking#t=tok_other_phone");
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await page.waitForLoadState("networkidle");
      const again = await moment();
      expect(again.tick, "the moment played on a link").toBeUndefined();
      expect(again.panel).toBeUndefined();
      expect(again.reference).toBeUndefined();
    });
  });

  test.describe("reduced motion (S01 A)", () => {
    test("the day lands at once and fades in, and the pass only fades", async ({
      page,
    }) => {
      await page.emulateMedia({ reducedMotion: "reduce" });
      await recordAnimations(page);
      await page.goto(CHARTER);
      await page.waitForLoadState("networkidle");
      await openDays(page).first().click();
      await openDays(page).nth(1).click();
      await openTimes(page).first().click();
      await fillContact(page);
      await page
        .getByRole("button", {
          name: /^Book now, pay ₹[\d,]+ cash on the day$/,
        })
        .click();
      await expect(page).toHaveURL(/\/booking#t=/);
      await expect(page.locator(".eyebrow-tick-mark")).toBeVisible();
      await page.waitForLoadState("networkidle");
      for (const p of await played(page)) {
        const travels = p.keyframes.some(
          (k) => typeof k.transform === "string" && k.transform !== "none",
        );
        expect(
          travels,
          `${p.cls || p.tag} travelled under reduced motion`,
        ).toBe(false);
        expect(
          p.data.includes("data-arrival-tick"),
          "the tick drew under reduced motion",
        ).toBe(false);
      }
    });
  });
}
