import { test, expect, type Page } from "@playwright/test";
import { expectSaveStored } from "./saved";

/**
 * Screen changes, in a real engine (T01 C and A, T02 C, T03 B; approved
 * 4 Oct 2026). Defined once, run by `motion.spec` on Chromium and by
 * `motion-webkit.spec` on WebKit: a view transition is an engine feature, and
 * Safari is most of the traveller traffic.
 *
 * Every view transition the page starts is recorded with the type it was
 * given and the animations it actually ran, read when it is ready. That is
 * the whole chain proved at once: the link chose the type, React named the
 * parts, and the stylesheet drew them.
 */

interface Ran {
  pseudo: string;
  name: string;
  duration: number;
}
interface Recorded {
  types: string[];
  ready: boolean;
  animations: Ran[];
}

declare global {
  interface Window {
    __vt?: Recorded[];
  }
}

async function recordTransitions(page: Page) {
  await page.addInitScript(() => {
    window.__vt = [];
    const start = document.startViewTransition?.bind(document);
    if (!start) return;
    document.startViewTransition = ((arg: unknown) => {
      const types =
        arg && typeof arg === "object" && "types" in arg
          ? [...((arg as { types?: Iterable<string> }).types ?? [])]
          : [];
      const entry: Recorded = { types, ready: false, animations: [] };
      window.__vt!.push(entry);
      const transition = start(arg as Parameters<typeof start>[0]);
      transition.ready.then(
        () => {
          entry.ready = true;
          entry.animations = document.documentElement
            .getAnimations({ subtree: true })
            .filter((a) =>
              (a.effect as KeyframeEffect | null)?.pseudoElement?.startsWith(
                "::view-transition",
              ),
            )
            .map((a) => ({
              pseudo: (a.effect as KeyframeEffect).pseudoElement ?? "",
              name: (a as CSSAnimation).animationName ?? "",
              duration: Number(
                (a.effect as KeyframeEffect).getTiming().duration,
              ),
            }));
        },
        () => {},
      );
      return transition;
    }) as typeof document.startViewTransition;
  });
}

async function forget(page: Page) {
  await page.evaluate(() => {
    window.__vt!.length = 0;
  });
}

/** The screen change that carried a type, once it has started animating. */
async function typed(page: Page): Promise<Recorded> {
  await expect
    .poll(() =>
      page.evaluate(
        () => window.__vt!.filter((e) => e.types.length && e.ready).length,
      ),
    )
    .toBeGreaterThan(0);
  return page.evaluate(() =>
    window.__vt!.filter((e) => e.types.length && e.ready).at(-1)!,
  );
}

const names = (r: Recorded) => r.animations.map((a) => a.name);

async function openFeed(page: Page) {
  await page.goto("/");
  await page.waitForSelector('article[aria-posinset="1"]');
}

/** Tap the open destination in the bar on a phone, or the rail on a desktop. */
async function tab(page: Page, name: string) {
  await page
    .locator('nav[aria-label="Primary"]:visible')
    .getByRole("link", { name })
    .click();
}

/**
 * One touch drag as the browser would send it, through React's own pointer
 * handlers. Synthetic, because WebKit has no CDP; the timing is real, so the
 * speed the gesture reads is the speed it was made at.
 */
async function touchDrag(
  page: Page,
  from: { x: number; y: number },
  to: { x: number; y: number },
  { steps = 12, stepMs = 16, release = true } = {},
) {
  await page.evaluate(
    async ({ from, to, steps, stepMs, release }) => {
      const target = document.elementFromPoint(from.x, from.y)!;
      const at = (x: number, y: number): PointerEventInit => ({
        pointerId: 7,
        pointerType: "touch",
        isPrimary: true,
        clientX: x,
        clientY: y,
        bubbles: true,
        cancelable: true,
        composed: true,
      });
      target.dispatchEvent(new PointerEvent("pointerdown", at(from.x, from.y)));
      let x = from.x;
      let y = from.y;
      for (let i = 1; i <= steps; i++) {
        await new Promise((resolve) => setTimeout(resolve, stepMs));
        x = from.x + ((to.x - from.x) * i) / steps;
        y = from.y + ((to.y - from.y) * i) / steps;
        target.dispatchEvent(new PointerEvent("pointermove", at(x, y)));
      }
      if (release)
        target.dispatchEvent(new PointerEvent("pointerup", at(x, y)));
    },
    { from, to, steps, stepMs, release },
  );
}

/** The x a fixed layer is drawn at, from its transform. */
function drawnX(page: Page, selector: string): Promise<number> {
  return page.evaluate((sel) => {
    const el = document.querySelector<HTMLElement>(sel);
    if (!el) return Number.NaN;
    const t = getComputedStyle(el).transform;
    return t === "none" ? 0 : new DOMMatrixReadOnly(t).m41;
  }, selector);
}

export function defineRouteMotion() {
  test.describe("screen changes (T01, T02, T03)", () => {
    test.beforeEach(async ({ page }) => {
      await recordTransitions(page);
    });

    test("between tab roots the sheet fades through and nothing travels (T01 A)", async ({
      page,
    }) => {
      await page.goto("/search");
      await page.waitForLoadState("networkidle");
      await forget(page);
      await tab(page, "Trips");
      await page.waitForURL("**/trips");
      const change = await typed(page);
      expect(change.types).toEqual(["sideways"]);
      expect(names(change)).toEqual(
        expect.arrayContaining(["vt-fade-out", "vt-fade-in"]),
      );
      expect(names(change)).not.toContain("vt-rise");
      expect(names(change)).not.toContain("vt-push-in");
    });

    test("into a focused screen the sheet rises; Back drops it (T01 C)", async ({
      page,
      isMobile,
    }) => {
      await page.goto("/account");
      await page.waitForLoadState("networkidle");
      await forget(page);
      await page.getByRole("link", { name: "Saved on this phone" }).click();
      await page.waitForURL("**/saved");
      const into = await typed(page);
      expect(into.types).toEqual(["deeper"]);
      expect(names(into)).toEqual(
        expect.arrayContaining(["vt-rise", "vt-fade-out", "vt-fade-in"]),
      );
      // The bar steps down on a phone; from lg up there is no bar to move.
      if (isMobile) expect(names(into)).toContain("vt-step-down");

      await forget(page);
      await page.getByRole("link", { name: /^Back to/ }).click();
      await page.waitForURL("**/account");
      const back = await typed(page);
      expect(back.types).toEqual(["back"]);
      expect(names(back)).toEqual(
        expect.arrayContaining(["vt-drop", "vt-fade-in"]),
      );
      if (isMobile) expect(names(back)).toContain("vt-step-up");
    });

    test("Book slides the listing in over the reel, and Back returns to that reel (T02 C)", async ({
      page,
      isMobile,
    }) => {
      await openFeed(page);
      const second = page.locator('article[aria-posinset="2"]');
      await second.scrollIntoViewIfNeeded();
      await expect(second).toBeInViewport({ ratio: 0.9 });

      await forget(page);
      await second.getByRole("link", { name: /^(Book|View)$/ }).click();
      await page.waitForURL("**/e/**");
      const open = await typed(page);
      expect(open.types).toEqual(["reel-open"]);
      // A page from the right on a phone; a rising panel beside the rail.
      expect(names(open)).toContain(isMobile ? "vt-push-in" : "vt-rise");
      if (isMobile) expect(names(open)).toContain("vt-reel-leave");

      await forget(page);
      await page.getByRole("link", { name: "Back to the feed" }).click();
      await page.waitForURL((url) => url.pathname === "/");
      const back = await typed(page);
      expect(back.types).toEqual(["reel-back"]);
      if (isMobile) {
        expect(names(back)).toEqual(
          expect.arrayContaining(["vt-push-out", "vt-reel-return"]),
        );
      }
      // The reel it was opened from, not the top of the feed.
      await expect(page.locator('article[aria-posinset="2"]')).toBeInViewport({
        ratio: 0.9,
      });
    });

    test("a saved picture flies to the listing's hero and home again (T03 B)", async ({
      page,
    }) => {
      await openFeed(page);
      const save = page.getByRole("button", { name: /^Save / }).first();
      const title = (await save.getAttribute("aria-label"))!.replace(
        /^Save /,
        "",
      );
      await save.click();
      await expectSaveStored(page);
      await page.goto("/saved");
      const card = page
        .getByRole("link", { name: title, exact: false })
        .first();
      await expect(card).toBeVisible();
      await page.waitForLoadState("networkidle");

      await forget(page);
      await card.click();
      await page.waitForURL("**/e/**");
      const fly = await typed(page);
      expect(fly.types).toEqual(["picture"]);
      // The picture is one group, flying, its corners squaring as it lands.
      const flight = fly.animations.find((a) =>
        a.pseudo.startsWith("::view-transition-group(picture-"),
      );
      expect(flight, "the picture did not fly").toBeTruthy();
      expect(flight!.duration).toBe(350);
      expect(names(fly)).toContain("vt-corners-square");

      await forget(page);
      await page.getByRole("link", { name: /^Back to/ }).click();
      await page.waitForURL("**/saved");
      const home = await typed(page);
      expect(home.types).toEqual(["picture-back"]);
      expect(names(home)).toContain("vt-corners-round");
    });

    test("under reduced motion every screen change is a short crossfade", async ({
      page,
    }) => {
      await page.emulateMedia({ reducedMotion: "reduce" });
      await page.goto("/account");
      await page.waitForLoadState("networkidle");
      await forget(page);
      await page.getByRole("link", { name: "Saved on this phone" }).click();
      await page.waitForURL("**/saved");
      const change = await typed(page);
      const drawn = change.animations.filter((a) => a.name.startsWith("vt-"));
      expect(drawn.length).toBeGreaterThan(0);
      for (const a of drawn) {
        expect(["vt-fade-in", "vt-fade-out"]).toContain(a.name);
        expect(a.duration).toBe(120);
      }
    });
  });

  test.describe("the listing under the thumb (T02 C)", () => {
    test.beforeEach(async ({ isMobile }) => {
      test.skip(!isMobile, "a swipe needs a touchscreen, and a phone's layout");
    });

    /** On the feed's first reel, watched long enough for its listing to be built. */
    async function watchFirstReel(page: Page) {
      await openFeed(page);
      await page
        .locator("[data-listing-peek] h1")
        .waitFor({ state: "attached", timeout: 10_000 });
    }

    test("follows the finger, completes, and lands on the very page that slid in", async ({
      page,
    }) => {
      await watchFirstReel(page);
      const { width, height } = page.viewportSize()!;
      const y = height / 2;
      const start = { x: width - 40, y };

      // Held halfway: the listing is there, at the finger.
      await touchDrag(page, start, { x: width - 190, y }, { release: false });
      expect(await drawnX(page, "[data-listing-peek]")).toBeCloseTo(
        width - 150,
        0,
      );
      expect(await drawnX(page, "[data-reel-screen]")).toBeCloseTo(-45, 0);

      // All the way in, and let go.
      await page.evaluate(
        ({ x, y }) => {
          const card = document.querySelector('article[aria-posinset="1"]')!;
          const at = {
            pointerId: 7,
            pointerType: "touch",
            isPrimary: true,
            clientX: x,
            clientY: y,
            bubbles: true,
          };
          card.dispatchEvent(new PointerEvent("pointermove", at));
          card.dispatchEvent(new PointerEvent("pointerup", at));
        },
        { x: start.x - width, y },
      );
      const peekTitle = await page
        .locator("[data-listing-peek] h1")
        .boundingBox();
      await page.waitForURL("**/e/**");
      await expect(page.locator("[data-listing-peek]")).toHaveCount(0);
      const title = page.getByRole("heading", { level: 1 });
      await expect(title).toBeVisible();
      // The real heading sits exactly where the one that slid in did.
      const real = await title.boundingBox();
      expect(Math.abs(real!.y - peekTitle!.y)).toBeLessThan(1);
      expect(Math.abs(real!.x - peekTitle!.x)).toBeLessThan(1);
    });

    test("springs back on a short, slow drag and goes nowhere", async ({
      page,
    }) => {
      await watchFirstReel(page);
      const { width, height } = page.viewportSize()!;
      const y = height / 2;
      await touchDrag(
        page,
        { x: width - 40, y },
        { x: width - 100, y },
        { steps: 10, stepMs: 24 },
      );
      await expect
        .poll(() => drawnX(page, "[data-listing-peek]"))
        .toBeCloseTo(width, 0);
      await expect.poll(() => drawnX(page, "[data-reel-screen]")).toBe(0);
      await page.waitForTimeout(300);
      expect(new URL(page.url()).pathname).toBe("/");
    });

    test("under reduced motion nothing slides in: the swipe crossfades instead", async ({
      page,
    }) => {
      await page.emulateMedia({ reducedMotion: "reduce" });
      await recordTransitions(page);
      await openFeed(page);
      await page.waitForTimeout(1_200);
      await expect(page.locator("[data-listing-peek]")).toHaveCount(0);
      const { width, height } = page.viewportSize()!;
      const y = height / 2;
      await touchDrag(page, { x: width - 40, y }, { x: 60, y });
      await page.waitForURL("**/e/**");
      const change = await typed(page);
      expect(change.types).toEqual(["reel-open"]);
      for (const a of change.animations.filter((a) => a.name.startsWith("vt-")))
        expect(a.duration).toBe(120);
    });
  });
}
