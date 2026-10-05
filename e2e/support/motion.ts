import { test, expect, type Page, type Locator } from "@playwright/test";
import sharp from "sharp";

/**
 * The motion system's checks, defined once and run by two specs: `motion.spec`
 * on the Chromium projects and `motion-webkit.spec` on WebKit, because how the
 * tab bar's glide RENDERS is an engine question. In the motion study a
 * filtered, clipped layer drew the whole bar as one shaded block in Safari
 * while every geometry check passed, so WebKit also samples real pixels.
 */

const BAR = 'nav[aria-label="Primary"]:visible';

/** How far the paper sits from a destination's box, in px (0 is exact). */
async function paperOffset(page: Page, name: string): Promise<number> {
  return page.evaluate((label) => {
    const bar = Array.from(
      document.querySelectorAll<HTMLElement>('nav[aria-label="Primary"]'),
    ).find((n) => n.getClientRects().length > 0); // fixed: no offsetParent
    if (!bar) return Infinity;
    const layer = bar.querySelector<HTMLElement>("[data-tab-lit]");
    const link = Array.from(bar.querySelectorAll<HTMLAnchorElement>("a")).find(
      (a) => a.textContent?.trim().startsWith(label),
    );
    if (!layer || !link) return Infinity;
    const m =
      /inset\(\s*([-\d.]+)px\s+([-\d.]+)px\s+([-\d.]+)px\s+([-\d.]+)px/.exec(
        getComputedStyle(layer).clipPath,
      );
    if (!m) return Infinity;
    const [top, right, bottom, left] = m.slice(1, 5).map(Number);
    const c = layer.getBoundingClientRect();
    const l = link.getBoundingClientRect();
    return Math.max(
      Math.abs(c.left + left - l.left),
      Math.abs(c.right - right - l.right),
      Math.abs(c.top + top - l.top),
      Math.abs(c.bottom - bottom - l.bottom),
    );
  }, name);
}

/** Relative luminance of the pixel at (x, y) of a locator's screenshot. */
async function luminanceAt(
  target: Locator,
  x: number,
  y: number,
): Promise<number> {
  const png = await target.screenshot({ animations: "disabled" });
  const { data, info } = await sharp(png)
    .raw()
    .toBuffer({ resolveWithObject: true });
  const scale =
    info.width / ((await target.boundingBox())?.width ?? info.width);
  const px = Math.round(x * scale);
  const py = Math.round(y * scale);
  const i = (py * info.width + px) * info.channels;
  const lin = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return (
    0.2126 * lin(data[i]) +
    0.7152 * lin(data[i + 1]) +
    0.0722 * lin(data[i + 2])
  );
}

async function openFeed(page: Page) {
  await page.goto("/");
  await page.waitForSelector('article[aria-posinset="1"]');
  await expect(page.locator(`${BAR} [data-tab-glide]`)).toHaveAttribute(
    "data-tab-glide",
    "on",
  );
}

export function defineTabBarGlide() {
  test.describe("the tab bar glides as one object (T04 B)", () => {
    test.beforeEach(({ isMobile }) => {
      test.skip(
        !isMobile,
        "the floating bar is a phone's; the rail does not glide",
      );
    });

    test("the paper lands exactly on the destination that was pressed", async ({
      page,
    }) => {
      await openFeed(page);
      const search = page.locator(BAR).getByRole("link", { name: "Search" });
      await search.tap();
      await expect(search).toHaveAttribute("data-lit", "");
      await page.waitForURL("**/search");
      await expect(search).toHaveAttribute("aria-current", "page");
      await expect.poll(() => paperOffset(page, "Search")).toBeLessThan(1);
    });

    test("a second press mid-glide continues from where the paper is", async ({
      page,
    }) => {
      await openFeed(page);
      const bar = page.locator(BAR);
      await bar.getByRole("link", { name: "Search" }).tap();
      await bar.getByRole("link", { name: "Account" }).tap();
      await page.waitForURL("**/account");
      await expect.poll(() => paperOffset(page, "Account")).toBeLessThan(1);
      await expect(bar.locator("a[data-lit]")).toHaveCount(1);
    });

    test("the bar is a forest pill with one paper pill on it, never a shaded block", async ({
      page,
    }) => {
      await openFeed(page);
      const bar = page.locator(BAR);
      await bar.getByRole("link", { name: "Search" }).tap();
      await page.waitForURL("**/search");
      await expect.poll(() => paperOffset(page, "Search")).toBeLessThan(1);

      const pill = bar.locator("[data-tabbar-pill]");
      const box = await pill.boundingBox();
      const lit = await bar.getByRole("link", { name: "Search" }).boundingBox();
      if (!box || !lit) throw new Error("no bar");
      // Inside the paper: light. Between the first two discs, on the ground: dark.
      const onPaper = await luminanceAt(
        pill,
        lit.x - box.x + lit.width - 8,
        box.height / 2,
      );
      const onGround = await luminanceAt(pill, 6 + 44 + 2, 8);
      expect(onPaper, "the open destination is paper").toBeGreaterThan(0.8);
      expect(onGround, "the rest of the bar is forest").toBeLessThan(0.1);
    });
  });

  test.describe("reduced motion", () => {
    test("the paper lands at once, with nothing moving", async ({
      page,
      isMobile,
    }) => {
      test.skip(!isMobile, "the floating bar is a phone's");
      await page.emulateMedia({ reducedMotion: "reduce" });
      await openFeed(page);
      await page.locator(BAR).getByRole("link", { name: "Search" }).tap();
      const scripted = await page.evaluate(
        () =>
          document
            .getAnimations()
            .filter(
              (a) =>
                !(a instanceof CSSTransition) &&
                !(a instanceof CSSAnimation) &&
                (a.effect as KeyframeEffect | null)?.target?.closest?.(
                  'nav[aria-label="Primary"]',
                ),
            ).length,
      );
      expect(scripted, "a glide ran under reduced motion").toBe(0);
      await page.waitForURL("**/search");
      expect(await paperOffset(page, "Search")).toBeLessThan(1);
    });
  });

  test("every press animates the property it presses with", async ({
    page,
  }) => {
    // Tailwind 4 writes `active:scale-*` to `scale`; a list without it snaps.
    await page.goto("/e/try-dive-nemo-reef");
    await page.waitForLoadState("networkidle");
    const button = page
      .getByRole("link", { name: /Pick a day|No dates open/ })
      .first();
    const disc = page.getByRole("link", { name: /^Back to/ });
    for (const control of [button, disc]) {
      const property = await control.evaluate(
        (el) => getComputedStyle(el).transitionProperty,
      );
      expect(property.split(",").map((s) => s.trim())).toContain("scale");
    }
  });
}
