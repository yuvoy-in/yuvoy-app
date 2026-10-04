import { test, expect, type Page } from "@playwright/test";
import {
  forgetAnimations as forget,
  played,
  recordAnimations as record,
  type Played,
} from "./animations";

/**
 * Search, seen changing (T14 A and T11 A, approved 4 Oct 2026). Defined once,
 * run by `motion.spec` on Chromium and `motion-webkit.spec` on WebKit.
 *
 * Every Web Animations call the page makes is recorded with the element it
 * moved, so what is proved is the journey each part was given in a real
 * engine: the pill taken off fades as a copy where it was, the others slide,
 * the count rolls, and a slow answer shows its skeleton only once the wait
 * has lasted 300ms.
 *
 * A slow answer is made in the page, not in the network: the mocks answer
 * from a service worker, which `page.route` never sees, so `fetch` itself is
 * held for a filtered search.
 */

declare global {
  interface Window {
    __skeleton?: { shown?: number; gone?: number; flashed: boolean };
  }
}

const EASE_MOVE = "cubic-bezier(0.2, 0, 0, 1)";

/** Holds every filtered search (one with a category) for `ms`. */
async function slowFilteredSearches(page: Page, ms: number) {
  await page.addInitScript((wait) => {
    const fetchOf = window.fetch.bind(window);
    window.fetch = async (input, init) => {
      const url =
        typeof input === "string"
          ? input
          : input instanceof Request
            ? input.url
            : String(input);
      if (/\/reels\?/.test(url) && /[?&]category=/.test(url))
        await new Promise((resolve) => setTimeout(resolve, wait));
      return fetchOf(input, init);
    };
  }, ms);
}

/** When the skeleton appeared and went, from here on. */
async function watchSkeleton(page: Page) {
  await page.evaluate(() => {
    window.__skeleton = { flashed: false };
    const mark = () => {
      const up = document.querySelector(
        '[data-motion-key="loading"] .skeleton-breath',
      );
      const s = window.__skeleton!;
      if (up && s.shown === undefined) {
        s.shown = performance.now();
        s.flashed = true;
      }
      if (!up && s.shown !== undefined && s.gone === undefined)
        s.gone = performance.now();
    };
    new MutationObserver(mark).observe(document.body, {
      childList: true,
      subtree: true,
    });
  });
}

export function defineSearchMotion() {
  test.describe("search changes in place (T14 A)", () => {
    test("a filter taken off: its pill fades where it was, the rest close the gap, the count rolls, and no skeleton", async ({
      page,
    }) => {
      await record(page);
      await page.goto("/search?kind=adventure&length=short");
      await page.waitForLoadState("networkidle");
      const row = page.getByRole("group", { name: "Filters applied" });
      const removes = row.getByRole("button", { name: /^Remove/ });
      await expect(removes).toHaveCount(2);
      await expect(
        page.getByRole("button", { name: "Filters, 2 on" }),
      ).toBeVisible();
      await watchSkeleton(page);
      await forget(page);

      await removes.first().click();
      await expect(removes).toHaveCount(1);
      await expect(
        page.getByRole("button", { name: "Filters, 1 on" }),
      ).toBeVisible();

      await expect
        .poll(async () => (await played(page)).filter((p) => p.copy).length)
        .toBeGreaterThan(0);
      const all = await played(page);
      // The pill that went, faded as a copy where it was.
      const gone = all.find(
        (p) =>
          p.copy && p.keyframes.at(-1)?.opacity === 0 && p.duration === 100,
      );
      expect(gone, "the removed pill vanished in one frame").toBeTruthy();
      /*
        The one that stayed slid left into the room it left: a slide starts
        at the old place, which is to the right of the new one.
      */
      const startX = (p: Played) =>
        Number(
          /^translate\(([-\d.]+)px/.exec(p.keyframes[0]?.transform ?? "")?.[1],
        );
      const slid = all.find((p) => p.key && startX(p) > 0);
      expect(slid, "the remaining pill jumped").toBeTruthy();
      expect(slid!.easing).toBe(EASE_MOVE);
      expect(slid!.duration).toBe(200);
      expect(slid!.delay).toBe(40);
      // The count rolled down from 2 to 1: the new figure arrives from above.
      const rolled = all.find(
        (p) =>
          p.text === "1" &&
          /^translateY\(-/.test(p.keyframes[0]?.transform ?? ""),
      );
      expect(rolled, "the count changed without rolling").toBeTruthy();
      // The copies are gone once faded, and nothing showed a skeleton.
      await expect
        .poll(() =>
          page.evaluate(
            () =>
              document.querySelectorAll(
                '[aria-label="Filters applied"] > [aria-hidden="true"]',
              ).length,
          ),
        )
        .toBe(0);
      expect(
        (await page.evaluate(() => window.__skeleton))?.flashed,
        "a quick answer flashed a skeleton",
      ).toBe(false);
    });

    test("the first filter: the guide line goes, the pill grows in, and what is below slides down", async ({
      page,
    }) => {
      await record(page);
      await page.goto("/search");
      await page.waitForLoadState("networkidle");
      await expect(page.getByText("Not sure where to start?")).toBeVisible();
      await page.getByRole("button", { name: /^Filters/ }).click();
      const sheet = page.getByRole("dialog", { name: "Filters" });
      await sheet.getByRole("button", { name: "Adventure" }).click();
      await forget(page);
      await sheet.getByRole("button", { name: "Show results" }).click();
      await expect(page.locator("dialog")).toHaveCount(0);
      await expect(
        page.getByRole("group", { name: "Filters applied" }),
      ).toBeVisible();

      const all = await played(page);
      const grew = all.find(
        (p) =>
          p.key === "category" && p.keyframes[0]?.transform === "scale(0.96)",
      );
      expect(grew, "the new pill appeared in one frame").toBeTruthy();
      const guide = all.find((p) => p.copy && p.text.startsWith("Not sure"));
      expect(guide, "the guide line vanished in one frame").toBeTruthy();
      const below = all.find((p) => p.key === "results");
      expect(below, "the results jumped instead of sliding").toBeTruthy();
      expect(below!.keyframes[0]?.transform).toMatch(/^translate\(0px, -?\d/);
    });
  });

  test.describe("waiting for an answer (T11 A)", () => {
    test("a slow answer: the last grid stays 300ms, then the skeleton, the grid's own shape, breathing, for at least 300ms, then the tiles rise in", async ({
      page,
    }) => {
      await slowFilteredSearches(page, 1200);
      await record(page);
      await page.goto("/search");
      await page.waitForLoadState("networkidle");
      await page.getByRole("button", { name: /^Filters/ }).click();
      const sheet = page.getByRole("dialog", { name: "Filters" });
      await sheet.getByRole("button", { name: "Adventure" }).click();
      await watchSkeleton(page);
      await forget(page);
      const asked = await page.evaluate(() => performance.now());
      await sheet.getByRole("button", { name: "Show results" }).click();

      const skeleton = page.locator(
        '[data-motion-key="loading"] .skeleton-breath',
      );
      await expect(skeleton).toBeVisible({ timeout: 4000 });
      // The grid's own shape: pictures at 4:5.
      const ratio = await skeleton
        .locator(".rounded-tile")
        .first()
        .evaluate((el) => {
          const r = el.getBoundingClientRect();
          return r.width / r.height;
        });
      expect(ratio).toBeCloseTo(0.8, 1);
      // One breath, on one layer, forever while it waits.
      const breath = await skeleton.evaluate((el) =>
        el.getAnimations().map((a) => ({
          name: (a as CSSAnimation).animationName,
          iterations: a.effect?.getComputedTiming().iterations,
        })),
      );
      expect(breath).toContainEqual({
        name: "skeleton-breath",
        iterations: Infinity,
      });

      await expect(page.locator('[data-motion-key="loading"]')).toHaveCount(0, {
        timeout: 6000,
      });
      const times = await page.evaluate(() => window.__skeleton!);
      expect(times.shown! - asked).toBeGreaterThanOrEqual(250);
      expect(times.gone! - times.shown!).toBeGreaterThanOrEqual(280);
      const rose = (await played(page)).filter(
        (p) => p.keyframes[0]?.transform === "translateY(8px)",
      );
      expect(rose.length, "the answer landed in one frame").toBeGreaterThan(0);
      expect(rose.map((r) => r.delay)).toEqual(expect.arrayContaining([0, 40]));
      expect(Math.max(...rose.map((r) => r.delay))).toBeLessThanOrEqual(160);
    });
  });

  test.describe("reduced motion (S01 A)", () => {
    test("a filter taken off: nothing slides or rolls, things only fade", async ({
      page,
    }) => {
      await page.emulateMedia({ reducedMotion: "reduce" });
      await record(page);
      await page.goto("/search?kind=adventure&length=short");
      await page.waitForLoadState("networkidle");
      const removes = page
        .getByRole("group", { name: "Filters applied" })
        .getByRole("button", { name: /^Remove/ });
      await expect(removes).toHaveCount(2);
      await forget(page);
      await removes.first().click();
      await expect(removes).toHaveCount(1);
      await expect
        .poll(async () => (await played(page)).length)
        .toBeGreaterThan(0);
      for (const p of await played(page)) {
        if (!p.key && !p.copy && p.text !== "1") continue;
        expect(
          p.keyframes.some((k) => k.transform && k.transform !== "none"),
          `${p.key ?? p.text} travelled under reduced motion`,
        ).toBe(false);
      }
    });
  });
}
