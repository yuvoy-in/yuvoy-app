import { expect, type Locator, type Page } from "@playwright/test";

/*
  The helpers `defineSheetMotion` (`sheet-motion.ts`) uses, moved out of that
  file as they were (yuvoy-app#243).
*/

export interface Moment {
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

export const EASE_EXIT = "cubic-bezier(0.3, 0, 0.8, 0.15)";
export const EASE_MOVE = "cubic-bezier(0.2, 0, 0, 1)";
export const EASE_INTERACTION = "cubic-bezier(0.32, 0.72, 0, 1)";

export async function openFilters(page: Page): Promise<Locator> {
  await page.goto("/search");
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: /^Filters/ }).click();
  const dialog = page.locator("dialog.app-sheet");
  await expect(dialog).toHaveAttribute("open", "");
  return dialog;
}

/** The entrance's own animations, by name, while it is running. */
export function entrance(dialog: Locator): Promise<string[]> {
  return dialog.evaluate((el) =>
    el
      .getAnimations()
      .map((a) => (a as CSSAnimation).animationName)
      .filter(Boolean),
  );
}

/** Waits for nothing to be moving the sheet. */
export async function settled(dialog: Locator) {
  await expect
    .poll(() => dialog.evaluate((el) => el.getAnimations().length))
    .toBe(0);
}

/** Records every state change of the sheet from here on. */
export async function record(dialog: Locator) {
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
export async function openPanel(page: Page): Promise<Locator> {
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

/**
 * The first reel's panel against its frame, in px: how tall it is drawn, how
 * tall its details are, where its top sits, and whether its body scrolls.
 */
export function panelGeometry(page: Page) {
  return page.locator('article[aria-posinset="1"]').evaluate((card) => {
    const panel = card.querySelector<HTMLElement>(".reel-sheet")!;
    const part = (name: string) =>
      panel.querySelector<HTMLElement>(`.reel-sheet-${name}`)!;
    const frame = card.getBoundingClientRect();
    const box = panel.getBoundingClientRect();
    return {
      frame: frame.height,
      height: box.height,
      top: box.top - frame.top,
      details:
        part("handle").offsetHeight +
        part("scroll").scrollHeight +
        part("foot").offsetHeight,
      more: part("scroll").getAttribute("data-more"),
    };
  });
}

/** How the tab bar is drawn right now: its pill's step, and its two fades. */
export function barDrawn(page: Page) {
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

export async function leaving(page: Page): Promise<Moment> {
  const moments = await page.evaluate(() => window.__sheet ?? []);
  const moment = moments.find((m) => m.state === "leaving");
  expect(moment, "the sheet never left: it closed in one frame").toBeTruthy();
  return moment!;
}
