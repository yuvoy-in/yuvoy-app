import { test, expect, type Page } from "@playwright/test";
import { forgetAnimations, played, recordAnimations } from "./animations";

/**
 * Pictures and refusals, seen happening (T12 A, T15 A, T16 A, approved
 * 4 Oct 2026). Defined once, run by `motion.spec` on Chromium and
 * `motion-webkit.spec` on WebKit. Script animations are recorded with the
 * element they moved (`animations.ts`); CSS transitions, keyframes and scroll
 * timelines are read off the element itself.
 *
 * The fixtures' one clip never resolves. A slow start is made by holding it
 * in the page (`holdClips`); a failed one is the clip loading for real on
 * Safari's path (`nativeClips`), which is where T12 found the ring spinning
 * for ever.
 */

const EASE_INTERACTION = "cubic-bezier(0.32, 0.72, 0, 1)";
const EASE_MOVE = "cubic-bezier(0.2, 0, 0, 1)";
const LISTING = "/e/private-boat-charter";
/** The sheet's rise over the picture on a phone (`--hero-overlap`, 2rem). */
const OVERLAP = 32;

/**
 * Clips take the way Safari plays them: the element is handed the HLS source
 * itself (`canPlayType` says so), and really loads it. The fixtures' one clip
 * never resolves, so this is a source failing on that path.
 */
async function nativeClips(page: Page) {
  await page.addInitScript(() => {
    const proto = HTMLMediaElement.prototype;
    const canPlayType = proto.canPlayType;
    proto.canPlayType = function (this: HTMLMediaElement, type: string) {
      return type === "application/vnd.apple.mpegurl"
        ? "maybe"
        : canPlayType.call(this, type);
    } as typeof proto.canPlayType;
  });
}

/**
 * Every start slow, for as long as a check needs: clips take Safari's way
 * (above), but the source is held back from the element and `play()` never
 * settles. Playwright's Chromium has no H.264, so hls.js would give a clip up
 * before it could be slow. Only the media layer is held; what is drawn is
 * the engine's own CSS over the app's own state.
 */
async function holdClips(page: Page) {
  await nativeClips(page);
  await page.addInitScript(() => {
    const clip = /\.m3u8(\?|$)/;
    const proto = HTMLMediaElement.prototype;
    const held = new WeakSet<HTMLMediaElement>();
    const src = Object.getOwnPropertyDescriptor(proto, "src")!;
    Object.defineProperty(proto, "src", {
      configurable: true,
      get(this: HTMLMediaElement) {
        return src.get!.call(this);
      },
      set(this: HTMLMediaElement, value: string) {
        if (clip.test(String(value))) held.add(this);
        else src.set!.call(this, value);
      },
    });
    const play = proto.play;
    proto.play = function (this: HTMLMediaElement) {
      return held.has(this) ? new Promise<void>(() => {}) : play.call(this);
    };
  });
}

/** Holds every request for a sign-in code for `ms`, so a refusal can be seen going. */
async function slowCodeRequests(page: Page, ms: number) {
  await page.addInitScript((wait) => {
    const fetchOf = window.fetch.bind(window);
    window.fetch = async (input, init) => {
      const url = input instanceof Request ? input.url : String(input);
      if (/\/me\/sign-in\/request$/.test(url))
        await new Promise((resolve) => setTimeout(resolve, wait));
      return fetchOf(input, init);
    };
  }, ms);
}

/** Two frames: whatever a change started has been styled. */
const settle = (page: Page) =>
  page.evaluate(
    () =>
      new Promise((done) =>
        requestAnimationFrame(() => requestAnimationFrame(done)),
      ),
  );

export function defineMediaMotion() {
  test.describe("a reel's start (T12 A)", () => {
    test("a slow start keeps its poster, and the ring fades in, turning", async ({
      page,
    }) => {
      await holdClips(page);
      await page.goto("/");
      const ring = page.getByRole("status", { name: "Loading video" }).first();
      await expect(ring).toBeVisible();
      const seen = await ring.evaluate((el) => {
        const own = getComputedStyle(el);
        const spin = getComputedStyle(el.firstElementChild!);
        const video = el.parentElement!.querySelector("video")!;
        const clip = getComputedStyle(video);
        return {
          shown: el.getAttribute("data-shown"),
          fade: [own.transitionDuration, own.transitionTimingFunction],
          spin: [spin.animationName, spin.animationPlayState],
          clip: [
            clip.opacity,
            clip.transitionDuration,
            clip.transitionTimingFunction,
          ],
        };
      });
      expect(seen).toEqual({
        shown: "true",
        fade: ["0.15s", EASE_INTERACTION],
        spin: ["feed-ring-turn", "running"],
        // No frame yet: the clip is still not seen over its poster.
        clip: ["0", "0.2s", EASE_INTERACTION],
      });
    });

    test("under reduced motion the ring holds still, and the clip fades in 120ms", async ({
      page,
    }) => {
      await holdClips(page);
      await page.emulateMedia({ reducedMotion: "reduce" });
      await page.goto("/");
      // Reduced motion refuses autoplay; once asked, the start is slow.
      await page
        .getByRole("button", { name: /^Play / })
        .first()
        .click();
      const ring = page.getByRole("status", { name: "Loading video" }).first();
      await expect(ring).toBeVisible();
      const seen = await ring.evaluate((el) => {
        const own = getComputedStyle(el);
        const spin = getComputedStyle(el.firstElementChild!);
        const clip = getComputedStyle(
          el.parentElement!.querySelector("video")!,
        );
        return {
          fade: [own.transitionDuration, own.transitionTimingFunction],
          spin: spin.animationName,
          clip: [clip.transitionDuration, clip.transitionTimingFunction],
        };
      });
      expect(seen).toEqual({
        fade: ["0.12s", "linear"],
        spin: "none",
        clip: ["0.12s", "linear"],
      });
    });

    test("a clip that cannot load gives up, and nothing is left saying it is loading", async ({
      page,
    }) => {
      // Every clip the page ever drew, however quickly it then gave up.
      await page.addInitScript(() => {
        const w = window as unknown as { __clips: number };
        w.__clips = 0;
        new MutationObserver((changes) => {
          for (const change of changes)
            for (const node of change.addedNodes)
              if (node instanceof HTMLElement)
                w.__clips +=
                  node.tagName === "VIDEO"
                    ? 1
                    : node.querySelectorAll("video").length;
        }).observe(document, { childList: true, subtree: true });
      });
      await nativeClips(page);
      await page.goto("/");
      await expect
        .poll(() =>
          page.evaluate(
            () => (window as unknown as { __clips: number }).__clips,
          ),
        )
        .toBeGreaterThan(0);
      // Each gives up (the fixtures' clips never resolve), and the card is
      // its poster again, with no ring left turning over it.
      await expect(page.locator("video")).toHaveCount(0, { timeout: 15_000 });
      await page.waitForTimeout(800);
      await expect(
        page.getByRole("status", { name: "Loading video" }),
      ).toHaveCount(0);
    });
  });

  test.describe("the far side recedes (T15 A)", () => {
    /** The picture's drawing at a scroll position, once the page has moved. */
    const at = (page: Page, y: number) =>
      page.evaluate(async (y) => {
        window.scrollTo(0, y);
        await new Promise((done) =>
          requestAnimationFrame(() => requestAnimationFrame(done)),
        );
        const el = document.querySelector<HTMLElement>(
          ".far-side > .far-side-picture",
        )!;
        return {
          scale: getComputedStyle(el).scale,
          dim: Number(getComputedStyle(el, "::after").opacity),
        };
      }, y);
    const resting = (scale: string) => scale === "none" || scale === "1";

    test("the picture scales back and dims with the scroll, over its own height", async ({
      page,
      isMobile,
    }) => {
      test.skip(!isMobile, "a phone's far side; from lg up there is none");
      await page.goto(LISTING);
      const picture = page.locator(".far-side > .far-side-picture");
      await expect(picture).toBeVisible();
      const drawn = await picture.evaluate((el: HTMLElement) => {
        // The height the range is set by, against the height it is drawn at.
        const probe = document.createElement("div");
        probe.style.height = "var(--hero-height)";
        el.appendChild(probe);
        const said = probe.offsetHeight;
        probe.remove();
        return {
          said,
          height: el.offsetHeight,
          timelines: CSS.supports("animation-timeline: scroll()"),
        };
      });
      expect(Math.abs(drawn.said - drawn.height)).toBeLessThanOrEqual(1);
      const cover = drawn.height - OVERLAP;

      if (!drawn.timelines) {
        // No scroll timelines: the still picture, as before.
        const still = await at(page, cover);
        expect(resting(still.scale)).toBe(true);
        expect(still.dim).toBe(0);
        return;
      }
      const top = await at(page, 0);
      expect(resting(top.scale)).toBe(true);
      expect(top.dim).toBe(0);
      const half = await at(page, cover / 2);
      expect(Number(half.scale)).toBeCloseTo(0.98, 2);
      expect(half.dim).toBeCloseTo(0.225, 1);
      const covered = await at(page, cover);
      expect(Number(covered.scale)).toBeCloseTo(0.96, 3);
      expect(covered.dim).toBeCloseTo(0.45, 2);
      // Past the cover it stays where it got to.
      const past = await at(page, cover + 300);
      expect(Number(past.scale)).toBeCloseTo(0.96, 3);
      // And back up, with the finger: nothing of its own.
      const back = await at(page, 0);
      expect(resting(back.scale)).toBe(true);
      expect(back.dim).toBe(0);
    });

    test("under reduced motion the picture stays its size, and only dims", async ({
      page,
      isMobile,
    }) => {
      test.skip(!isMobile, "a phone's far side; from lg up there is none");
      await page.emulateMedia({ reducedMotion: "reduce" });
      await page.goto(LISTING);
      const picture = page.locator(".far-side > .far-side-picture");
      await expect(picture).toBeVisible();
      const { height, timelines } = await picture.evaluate(
        (el: HTMLElement) => ({
          height: el.offsetHeight,
          timelines: CSS.supports("animation-timeline: scroll()"),
        }),
      );
      test.skip(!timelines, "no scroll timelines: nothing recedes anyway");
      const covered = await at(page, height - OVERLAP);
      expect(resting(covered.scale)).toBe(true);
      expect(covered.dim).toBeCloseTo(0.45, 2);
    });

    test("from lg up the picture scrolls with the page, and nothing recedes", async ({
      page,
      isMobile,
    }) => {
      test.skip(isMobile, "the desktop panel");
      await page.goto(LISTING);
      const picture = page.locator(".far-side > .far-side-picture");
      await expect(picture).toBeVisible();
      const seen = await picture.evaluate((el) => ({
        animation: getComputedStyle(el).animationName,
        dim: getComputedStyle(el, "::after").content,
      }));
      expect(seen).toEqual({ animation: "none", dim: "none" });
    });
  });

  test.describe("a refused number (T16 A)", () => {
    /** Signed out on Account, a number the API refuses, sent. */
    async function refused(page: Page) {
      await page.goto("/account");
      await page.getByLabel("Your WhatsApp number").fill("12345");
      await page.getByRole("button", { name: "Send me a code" }).click();
      const reason = page
        .getByRole("alert")
        .filter({ hasText: "country code" });
      await expect(reason).toBeVisible();
      return reason;
    }
    const send = (page: Page) => page.getByRole("button", { name: /^Send/ });

    test("the reason arrives where the button made room, and goes the same way", async ({
      page,
    }) => {
      await recordAnimations(page);
      await slowCodeRequests(page, 1500);
      const reason = await refused(page);
      // A CSS animation's curve is its keyframes', so read off the style.
      const arrival = await reason.evaluate((el) => {
        const [a] = el.getAnimations() as CSSAnimation[];
        const t = a?.effect?.getTiming();
        return [
          a?.animationName,
          t?.duration,
          t?.delay,
          getComputedStyle(el).animationTimingFunction,
        ];
      });
      expect(arrival).toEqual(["motion-reason-in", 150, 40, EASE_INTERACTION]);
      const room = (await played(page)).filter(
        (p) =>
          p.tag === "button" &&
          /^translate\(0px, -\d/.test(p.keyframes[0]?.transform ?? ""),
      );
      expect(room, "the button did not glide down to make room").toHaveLength(
        1,
      );
      expect(room[0]).toMatchObject({
        duration: 200,
        delay: 0,
        easing: EASE_MOVE,
      });
      // The border answers in 150ms, as the reason's own colour does.
      const field = page.getByLabel("Your WhatsApp number");
      expect(
        await field.evaluate((el) => getComputedStyle(el).transitionDuration),
      ).toBe("0.15s");

      // The next send: the reason fades where it was, and the button glides back.
      await forgetAnimations(page);
      await send(page).click();
      await expect(reason).toHaveCount(0);
      // Nothing left speaking: the copy that fades says nothing. (In the
      // form: Next's route announcer is an alert of its own.)
      await expect(page.locator("form").getByRole("alert")).toHaveCount(0);
      const gone = await played(page);
      const copy = gone.filter((p) => p.copy && /country code/.test(p.text));
      expect(copy, "the reason did not fade where it was").toHaveLength(1);
      expect(copy[0]).toMatchObject({ duration: 100 });
      expect(copy[0].keyframes.at(-1)?.opacity).toBe(0);
      const back = gone.filter(
        (p) =>
          p.tag === "button" &&
          /^translate\(0px, \d/.test(p.keyframes[0]?.transform ?? ""),
      );
      expect(back, "the button did not glide back").toHaveLength(1);
      expect(back[0]).toMatchObject({
        duration: 200,
        delay: 40,
        easing: EASE_MOVE,
      });
    });

    test("under reduced motion the reason only fades, and nothing glides", async ({
      page,
    }) => {
      await page.emulateMedia({ reducedMotion: "reduce" });
      await recordAnimations(page);
      const reason = await refused(page);
      const arrival = await reason.evaluate((el) => {
        const [a] = el.getAnimations() as CSSAnimation[];
        return [
          a?.animationName,
          a?.effect?.getTiming().duration,
          getComputedStyle(el).animationTimingFunction,
        ];
      });
      expect(arrival).toEqual(["motion-fade-in", 120, "linear"]);
      await settle(page);
      const glides = (await played(page)).filter((p) =>
        /^translate/.test(p.keyframes[0]?.transform ?? ""),
      );
      expect(glides).toEqual([]);
      // Colour keeps its 150ms under reduced motion (S01 A).
      expect(
        await page
          .getByLabel("Your WhatsApp number")
          .evaluate((el) => getComputedStyle(el).transitionDuration),
      ).toBe("0.15s");
    });
  });
}
