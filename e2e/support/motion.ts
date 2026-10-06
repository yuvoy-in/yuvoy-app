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

declare global {
  interface Window {
    __holdAt?: number | null;
    __held?: boolean;
  }
}

/**
 * Holds the next typed screen change still, every one of its animations
 * paused at `window.__holdAt` ms, until another change replaces it. Lets a
 * check look at a change from the inside, which a 150ms fade never gives it
 * time to do. An untyped transition (a boundary revealing) is let through.
 */
async function holdNextChange(page: Page) {
  await page.addInitScript(() => {
    window.__holdAt = null;
    window.__held = false;
    const start = document.startViewTransition?.bind(document);
    if (!start) return;
    document.startViewTransition = ((arg: unknown) => {
      const transition = start(arg as Parameters<typeof start>[0]);
      const at = window.__holdAt;
      const typed =
        arg !== null &&
        typeof arg === "object" &&
        [...((arg as { types?: Iterable<string> }).types ?? [])].length > 0;
      if (at === null || at === undefined || !typed) return transition;
      window.__holdAt = null;
      transition.ready.then(
        () => {
          for (const a of document.documentElement.getAnimations({
            subtree: true,
          })) {
            const pseudo = (a.effect as KeyframeEffect | null)?.pseudoElement;
            if (!pseudo?.startsWith("::view-transition")) continue;
            a.pause();
            a.currentTime = at;
          }
          window.__held = true;
        },
        () => {},
      );
      return transition;
    }) as typeof document.startViewTransition;
  });
}

/** Share of dark pixels (luma under 0.35) in a PNG. */
async function darkShare(png: Buffer): Promise<number> {
  const { data, info } = await sharp(png)
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  let dark = 0;
  for (let i = 0; i < data.length; i += 3) {
    const luma =
      (0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]) / 255;
    if (luma < 0.35) dark++;
  }
  return dark / (info.width * info.height);
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

  test.describe("the bar holds its place through a tab change", () => {
    test.beforeEach(async ({ page, isMobile }) => {
      test.skip(!isMobile, "the floating bar is a phone's");
      await holdNextChange(page);
    });

    /** Tap `to` on the bar and hold the change it starts at `at` ms. */
    async function holdTap(page: Page, to: string, at = 60) {
      await page.evaluate((t) => {
        window.__holdAt = t;
      }, at);
      await page.locator(BAR).getByRole("link", { name: to }).tap();
      await page.waitForFunction(() => window.__held === true);
    }

    /** From `from`, tap `to` and hold the change it starts at `at` ms. */
    async function holdTabChange(
      page: Page,
      from: string,
      to: string,
      at = 60,
    ) {
      await page.goto(from);
      await page.waitForLoadState("networkidle");
      await holdTap(page, to, at);
    }

    test("the bar is drawn above both screens all the way through", async ({
      page,
      browserName,
    }) => {
      await holdTabChange(page, "/search", "Trips");
      const drawn = await page.evaluate(() => {
        const bar = document.querySelector<HTMLElement>("[data-tabbar]")!;
        const group = getComputedStyle(
          document.documentElement,
          "::view-transition-group(tab-bar)",
        );
        const sheets = document.documentElement
          .getAnimations({ subtree: true })
          .map((a) => (a.effect as KeyframeEffect).pseudoElement ?? "")
          .filter(
            (p) =>
              p.startsWith("::view-transition-old(") ||
              p.startsWith("::view-transition-new("),
          );
        return {
          name: getComputedStyle(bar).viewTransitionName,
          z: group.zIndex,
          height: parseFloat(group.height),
          barAnimated: sheets.some((p) => p.endsWith("(tab-bar)")),
        };
      });
      expect(drawn.name, "the bar is part of the page under the screens").toBe(
        "tab-bar",
      );
      expect(drawn.z).toBe("3");
      expect(drawn.height).toBeGreaterThan(40);
      expect(drawn.barAnimated, "the bar must not fade or move").toBe(false);
      /*
        Pixels, in Chromium. A WebKit screenshot is painted by a path that
        cannot draw a transition's new images at all (the bar's old image,
        shown instead, does reach it), so in WebKit the tree above is the
        evidence.
      */
      if (browserName === "chromium") {
        const box = (await page
          .locator(`${BAR} [data-tabbar-pill]`)
          .boundingBox())!;
        const share = await darkShare(await page.screenshot({ clip: box }));
        expect(share, "the forest pill is on the glass").toBeGreaterThan(0.3);
      }
    });

    test("over a reel the pill is solid while the change runs, frosted after", async ({
      page,
    }) => {
      /*
        Back to a feed the router still holds. A first change into the feed
        waits on the network (the feed keeps no loading boundary, by ruling),
        and while it waits React can commit Next's empty deferred render on
        its own, which claims the change's types: 3 to 8 cold changes in 100
        then ran untyped, so unheld and unanimated (stability audit, 6 Oct
        2026). That is upstream and is in docs/ux-stability-final-report.md;
        this test is about the bar.
      */
      await openFeed(page);
      await page.locator(BAR).getByRole("link", { name: "Search" }).tap();
      await page.waitForURL((url) => url.pathname === "/search");
      await page.waitForLoadState("networkidle");
      await holdTap(page, "Feed");
      const during = await page.evaluate(
        () =>
          getComputedStyle(document.querySelector("[data-tabbar-ground]")!)
            .backdropFilter,
      );
      expect(during).toBe("none");
      await page.evaluate(() => {
        for (const a of document.documentElement.getAnimations({
          subtree: true,
        }))
          a.play();
      });
      await page.waitForURL((url) => url.pathname === "/");
      await expect
        .poll(() =>
          page.evaluate(
            () =>
              getComputedStyle(document.querySelector("[data-tabbar-ground]")!)
                .backdropFilter,
          ),
        )
        .toContain("blur");
    });

    test("a tab tapped while a change runs is the one that opens", async ({
      page,
    }) => {
      const well = () =>
        page.evaluate(
          () =>
            getComputedStyle(document.querySelector("[data-tabbar-well]")!)
              .pointerEvents,
        );
      await page.goto("/");
      await page.waitForSelector('article[aria-posinset="1"]');
      // At rest the well is not there for a finger: beside the pill is feed.
      expect(await well()).toBe("none");
      await holdTabChange(page, "/search", "Trips");
      expect(await well()).toBe("auto");
      const account = page.locator(BAR).getByRole("link", { name: "Account" });
      const box = (await account.boundingBox())!;
      await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
      // React holds the next commit until a running change ends: let it end.
      await page.evaluate(() => {
        for (const a of document.documentElement.getAnimations({
          subtree: true,
        }))
          a.play();
      });
      await page.waitForURL("**/account");
      await expect(account).toHaveAttribute("aria-current", "page");
      await expect(page.locator(`${BAR} a[data-lit]`)).toHaveCount(1);
      await expect(account).toHaveAttribute("data-lit", "");
    });

    test("under reduced motion the bar still holds, with nothing fading", async ({
      page,
    }) => {
      await page.emulateMedia({ reducedMotion: "reduce" });
      await holdTabChange(page, "/search", "Trips");
      const animated = await page.evaluate(() =>
        document.documentElement
          .getAnimations({ subtree: true })
          .some((a) =>
            ((a.effect as KeyframeEffect).pseudoElement ?? "").endsWith(
              "(tab-bar)",
            ),
          ),
      );
      expect(animated).toBe(false);
    });
  });

  test("Back and Forward light the destination the traveller is on", async ({
    page,
    isMobile,
  }) => {
    test.skip(!isMobile, "the floating bar is a phone's");
    const bar = page.locator(BAR);
    const lit = bar.locator("a[data-lit]");
    await page.goto("/search");
    await page.waitForLoadState("networkidle");
    await bar.getByRole("link", { name: "Trips" }).tap();
    await page.waitForURL("**/trips");
    await bar.getByRole("link", { name: "Account" }).tap();
    await page.waitForURL("**/account");

    await page.goBack();
    await page.waitForURL("**/trips");
    await expect(lit).toHaveCount(1);
    await expect(lit).toHaveAccessibleName("Trips");
    await page.goBack();
    await page.waitForURL("**/search");
    await expect(lit).toHaveAccessibleName("Search");
    await page.goForward();
    await page.waitForURL("**/trips");
    await expect(lit).toHaveAccessibleName("Trips");
    await page.goForward();
    await page.waitForURL("**/account");
    await expect(lit).toHaveAccessibleName("Account");
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
