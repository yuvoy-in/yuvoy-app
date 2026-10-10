import { test, expect, type Locator, type Page } from "@playwright/test";
import { swipe, touchDrag } from "./touch";

/**
 * Sheets and the reel's details panel, in a real engine (T06 A and T05 A,
 * approved 4 Oct 2026). Defined once, run by `motion.spec` on Chromium and by
 * `motion-webkit.spec` on WebKit: holding a `<dialog>` open through a script
 * exit, and a `::backdrop` that follows its dialog, are engine behaviour.
 *
 * What a sheet does is recorded as it does it: every change to its state
 * attributes, with the animations it was running at that moment. A sheet that
 * closed first and animated nothing, or animated after it had closed, cannot
 * pass.
 */

interface Moment {
  state: string | null;
  open: boolean;
  animations: {
    name: string;
    duration: number;
    easing: string;
    keyframes: { transform?: string; opacity?: string }[];
  }[];
}

declare global {
  interface Window {
    __sheet?: Moment[];
  }
}

const EASE_EXIT = "cubic-bezier(0.3, 0, 0.8, 0.15)";
const EASE_MOVE = "cubic-bezier(0.2, 0, 0, 1)";
const EASE_INTERACTION = "cubic-bezier(0.32, 0.72, 0, 1)";

async function openFilters(page: Page): Promise<Locator> {
  await page.goto("/search");
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: /^Filters/ }).click();
  const dialog = page.locator("dialog.app-sheet");
  await expect(dialog).toHaveAttribute("open", "");
  return dialog;
}

/** The entrance's own animations, by name, while it is running. */
function entrance(dialog: Locator): Promise<string[]> {
  return dialog.evaluate((el) =>
    el
      .getAnimations()
      .map((a) => (a as CSSAnimation).animationName)
      .filter(Boolean),
  );
}

/** Waits for nothing to be moving the sheet. */
async function settled(dialog: Locator) {
  await expect
    .poll(() => dialog.evaluate((el) => el.getAnimations().length))
    .toBe(0);
}

/** Records every state change of the sheet from here on. */
async function record(dialog: Locator) {
  await dialog.evaluate((el) => {
    window.__sheet = [];
    new MutationObserver(() => {
      window.__sheet!.push({
        state: el.getAttribute("data-sheet"),
        open: el.hasAttribute("open"),
        animations: el.getAnimations().map((a) => {
          const effect = a.effect as KeyframeEffect;
          const timing = effect.getComputedTiming();
          return {
            name: (a as CSSAnimation).animationName ?? "",
            duration: Number(timing.duration),
            easing: String(effect.getTiming().easing),
            keyframes: effect.getKeyframes().map((k) => ({
              transform: k.transform as string | undefined,
              opacity: k.opacity === undefined ? undefined : String(k.opacity),
            })),
          };
        }),
      });
    }).observe(el, {
      attributes: true,
      attributeFilter: ["data-sheet", "open"],
    });
  });
}

/** Opens the first reel's details panel and waits for it to finish rising. */
async function openPanel(page: Page): Promise<Locator> {
  await page.goto("/");
  const card = page.locator('article[aria-posinset="1"]');
  await card.waitFor();
  await card.locator("button[aria-controls]").click();
  const panel = card.locator(".reel-sheet");
  await expect(panel).toHaveAttribute("data-open", "open");
  await expect
    .poll(() => panel.evaluate((el) => getComputedStyle(el).transform))
    .toBe("none");
  return panel;
}

/** How the tab bar is drawn right now: its pill's step, and its two fades. */
function barDrawn(page: Page) {
  return page.evaluate(() => {
    const style = (selector: string) =>
      getComputedStyle(document.querySelector(selector)!);
    const pill = style("[data-tabbar-pill]");
    return {
      step: new DOMMatrixReadOnly(pill.transform).m42,
      ground: style("[data-tabbar-ground]").opacity,
      row: style("[data-tab-glide]").opacity,
      duration: pill.transitionDuration,
      easing: pill.transitionTimingFunction,
      fade: style("[data-tabbar-ground]").transitionDuration,
    };
  });
}

async function leaving(page: Page): Promise<Moment> {
  const moments = await page.evaluate(() => window.__sheet ?? []);
  const moment = moments.find((m) => m.state === "leaving");
  expect(moment, "the sheet never left: it closed in one frame").toBeTruthy();
  return moment!;
}

export function defineSheetMotion() {
  test.describe("the sheet leaves the way it came (T06 A)", () => {
    test("on a phone it rises from the edge and goes back down, open until it has gone", async ({
      page,
      isMobile,
      browserName,
    }) => {
      test.skip(!isMobile, "the edge sheet is a phone's");
      const dialog = await openFilters(page);
      expect(await entrance(dialog)).toContain("sheet-edge-in");
      await settled(dialog);
      const height = (await dialog.boundingBox())!.height;

      await record(dialog);
      await dialog.getByRole("button", { name: "Close" }).click();
      await expect(page.locator("dialog")).toHaveCount(0);

      const exit = await leaving(page);
      expect(exit.open, "the dialog closed before its exit ran").toBe(true);
      const travel = exit.animations.find((a) => !a.name);
      expect(travel).toBeTruthy();
      expect(travel!.duration).toBe(200);
      expect(travel!.easing).toBe(EASE_EXIT);
      expect(travel!.keyframes.at(-1)!.transform).toMatch(
        new RegExp(`translateY\\(${Math.round(height)}(\\.\\d+)?px\\)`),
      );
      /*
        Focus goes back to what opened it, as the browser's own close does.
        Safari never focuses a button that is tapped, so there it returns to
        the page; either way it is not left on a sheet that has gone.
      */
      if (browserName === "chromium") {
        await expect(
          page.getByRole("button", { name: /^Filters/ }),
        ).toBeFocused();
      } else {
        expect(
          await page.evaluate(
            () =>
              document.activeElement === document.body ||
              document.activeElement?.isConnected === true,
          ),
        ).toBe(true);
      }
    });

    test("the head pulls it down: past a quarter it goes, short of that it settles back", async ({
      page,
      isMobile,
    }) => {
      test.skip(!isMobile, "the edge sheet is a phone's");
      const dialog = await openFilters(page);
      await settled(dialog);
      const sheet = (await dialog.boundingBox())!;
      const head = (await dialog.locator(".sheet-head h2").boundingBox())!;
      const grip = { x: head.x + 8, y: head.y + head.height / 2 };

      // Held halfway: it is where the finger is, and the tint has thinned.
      await touchDrag(
        page,
        grip,
        { x: grip.x, y: grip.y + 40 },
        { steps: 8, stepMs: 40 },
      );
      await expect(dialog).toHaveAttribute("open", "");
      await expect
        .poll(() => dialog.evaluate((el) => getComputedStyle(el).transform))
        .toBe("none");

      await touchDrag(
        page,
        grip,
        { x: grip.x, y: grip.y + sheet.height / 2 },
        { steps: 12, stepMs: 16, release: false },
      );
      const held = await dialog.evaluate((el) => ({
        y: new DOMMatrixReadOnly(getComputedStyle(el).transform).m42,
        tint: Number(getComputedStyle(el, "::backdrop").opacity),
      }));
      // One to one from the first move past the slop: 11/24 of the height.
      const pulled = (sheet.height * 11) / 24;
      expect(Math.abs(held.y - pulled)).toBeLessThan(3);
      expect(Math.abs(held.tint - (1 - pulled / sheet.height))).toBeLessThan(
        0.05,
      );

      await record(dialog);
      // Let go where the gesture began: a synthetic pointer is not captured.
      await page.evaluate(
        ({ x, y }) => {
          const target = document.querySelector("dialog .sheet-head h2")!;
          target.dispatchEvent(
            new PointerEvent("pointerup", {
              pointerId: 7,
              pointerType: "touch",
              isPrimary: true,
              clientX: x,
              clientY: y,
              bubbles: true,
            }),
          );
        },
        { x: grip.x, y: grip.y },
      );
      await expect(page.locator("dialog")).toHaveCount(0);
      const exit = await leaving(page);
      const travel = exit.animations.find((a) => !a.name)!;
      // From where it was let go, on the finger's curve, and quicker for it.
      expect(travel.easing).toBe(EASE_MOVE);
      expect(travel.duration).toBeLessThan(200);
      expect(travel.duration).toBeGreaterThanOrEqual(120);
    });

    test("from sm up it is a panel: it keeps its rise and fades as it drops", async ({
      page,
      isMobile,
    }) => {
      test.skip(isMobile, "the centred panel is a wide screen's");
      const dialog = await openFilters(page);
      expect(await entrance(dialog)).toContain("sheet-rise");
      await settled(dialog);
      await record(dialog);
      await page.keyboard.press("Escape");
      await expect(page.locator("dialog")).toHaveCount(0);
      const exit = await leaving(page);
      expect(exit.open).toBe(true);
      const travel = exit.animations.find((a) => !a.name)!;
      expect(travel.duration).toBe(200);
      expect(travel.keyframes.at(-1)!.opacity).toBe("0");
      expect(travel.keyframes.at(-1)!.transform).toBe("translateY(12px)");
    });

    test("under reduced motion it only fades, both ways (S01 A)", async ({
      page,
    }) => {
      await page.emulateMedia({ reducedMotion: "reduce" });
      const dialog = await openFilters(page);
      const fading = await dialog.evaluate((el) =>
        el.getAnimations().map((a) => ({
          name: (a as CSSAnimation).animationName,
          duration: Number(a.effect!.getComputedTiming().duration),
        })),
      );
      expect(fading).toEqual([{ name: "sheet-tint", duration: 120 }]);
      await settled(dialog);
      await record(dialog);
      await dialog.getByRole("button", { name: "Close" }).click();
      await expect(page.locator("dialog")).toHaveCount(0);
      const exit = await leaving(page);
      const fade = exit.animations.find((a) => !a.name)!;
      expect(fade.duration).toBe(120);
      expect(fade.keyframes.map((k) => k.transform)).toEqual([
        undefined,
        undefined,
      ]);
    });
  });

  test.describe("the details panel is pulled down by its handle (T05 A)", () => {
    test.beforeEach(({ isMobile }) => {
      test.skip(!isMobile, "the pull is a touch gesture on the phone's feed");
    });

    test("opens in 250ms and closes faster, in 200ms", async ({ page }) => {
      const panel = await openPanel(page);
      const opening = await panel.evaluate(
        (el) => getComputedStyle(el).transitionDuration,
      );
      expect(opening.split(",")[0].trim()).toBe("0.25s");
      await panel.getByRole("button", { name: "Close details" }).click();
      await expect(panel).toHaveAttribute("data-open", "shut");
      const closing = await panel.evaluate((el) => ({
        duration: getComputedStyle(el).transitionDuration,
        easing: getComputedStyle(el).transitionTimingFunction,
      }));
      expect(closing.duration.split(",")[0].trim()).toBe("0.2s");
      // The transform's curve is the list's first: `cubic-bezier(...), linear`.
      expect(closing.easing.startsWith(EASE_EXIT)).toBe(true);
    });

    test("a short pull settles back; a long one closes it", async ({
      page,
    }) => {
      const panel = await openPanel(page);
      const handle = (await panel
        .getByRole("button", { name: "Close details" })
        .boundingBox())!;
      const grip = { x: handle.x + handle.width / 2, y: handle.y + 20 };

      await touchDrag(
        page,
        grip,
        { x: grip.x, y: grip.y + 30 },
        { steps: 6, stepMs: 50 },
      );
      await expect(panel).toHaveAttribute("data-open", "open");
      await expect
        .poll(() => panel.evaluate((el) => getComputedStyle(el).transform))
        .toBe("none");

      await touchDrag(
        page,
        grip,
        { x: grip.x, y: grip.y + 140 },
        { steps: 10, stepMs: 16 },
      );
      await expect(panel).toHaveAttribute("data-open", "shut");
    });

    test("a real finger pulling the handle closes the panel and never scrolls the feed", async ({
      page,
      browserName,
    }) => {
      // Through the browser's own touch pipeline, which only CDP can drive.
      test.skip(browserName !== "chromium", "real touch input needs CDP");
      const panel = await openPanel(page);
      const feed = page.locator('[role="feed"]');
      const before = await feed.evaluate((el) => el.scrollTop);
      const handle = (await panel
        .getByRole("button", { name: "Close details" })
        .boundingBox())!;
      const x = handle.x + handle.width / 2;
      await swipe(page, { x, y: handle.y + 20 }, { x, y: handle.y + 180 });
      await expect(panel).toHaveAttribute("data-open", "shut");
      // touch-action: none on the handle; without it this scrolled back a reel.
      expect(await feed.evaluate((el) => el.scrollTop)).toBe(before);
    });
  });

  test.describe("the tab bar steps aside for the details panel", () => {
    test.beforeEach(({ isMobile }) => {
      test.skip(!isMobile, "the floating bar is a phone's; the rail stays");
    });

    test("it steps down and out while the panel is open, and the action gets the room", async ({
      page,
    }) => {
      /*
        The owner's screenshot (10 Oct 2026): the panel's action stopped where
        the pill began, two white pills stacked with no air between them.
      */
      const panel = await openPanel(page);
      const bar = page.locator("nav[data-tabbar]");
      // Hidden, not just transparent: out of the tab order and the tree.
      await expect(bar).toBeHidden();
      /*
        The paper under the open destination too. It used to insist on
        `visible`, and WebKit drew it unfaded for a frame over the action as
        the bar around it was hidden.
      */
      await expect(bar.locator(".tab-lit")).toBeHidden();
      /*
        On the panel's own curve, so it is all but gone before the action
        reaches it, about 60ms in.
      */
      expect(await barDrawn(page)).toMatchObject({
        step: 16,
        ground: "0",
        row: "0",
        duration: "0.15s",
        easing: EASE_INTERACTION,
      });

      // The panel's own margin, 20px under the action as beside it.
      const card = (await page
        .locator('article[aria-posinset="1"]')
        .boundingBox())!;
      const action = (await panel.locator(".reel-sheet-cta").boundingBox())!;
      const under = card.y + card.height - (action.y + action.height);
      expect(Math.abs(under - 20), `${under}px under the action`).toBeLessThan(
        1,
      );
      expect(Math.abs(action.x - card.x - 20)).toBeLessThan(1);

      await panel.getByRole("button", { name: "Close details" }).click();
      await expect(bar).toBeVisible();
      await expect
        .poll(() => barDrawn(page))
        .toMatchObject({ step: 0, ground: "1", row: "1" });
    });

    test("under reduced motion it only fades, with the panel (S01 A)", async ({
      page,
    }) => {
      await page.emulateMedia({ reducedMotion: "reduce" });
      await openPanel(page);
      const bar = page.locator("nav[data-tabbar]");
      await expect(bar).toBeHidden();
      // No step, and a fade the global rule has not squashed to nothing.
      expect(await barDrawn(page)).toMatchObject({
        step: 0,
        ground: "0",
        row: "0",
        fade: "0.12s",
      });
      await page.keyboard.press("Escape");
      await expect(bar).toBeVisible();
    });
  });
}
