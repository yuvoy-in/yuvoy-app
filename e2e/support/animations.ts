import type { Page } from "@playwright/test";

/**
 * Every Web Animations call a page makes, recorded with the element it moved.
 *
 * The motion checks prove the journey each part was given in a real engine
 * (its keyframes, delay, duration and curve) by watching `Element.animate`
 * itself, installed before any of the app's own scripts run. CSS transitions
 * and keyframes are not recorded here; a check reads those from
 * `getAnimations()` on the element.
 */
export interface Played {
  at: number;
  /** The element's `data-motion-key`, if it has one. */
  key: string | null;
  /** A departed item's fading copy (hidden, inert, keyless). */
  copy: boolean;
  tag: string;
  cls: string;
  text: string;
  /** The `data-*` attribute names it carries, for picking it out. */
  data: string[];
  keyframes: {
    transform?: string;
    opacity?: number | string;
    strokeDashoffset?: number | string;
  }[];
  delay: number;
  duration: number;
  easing?: string;
}

declare global {
  interface Window {
    __played?: Played[];
  }
}

export async function recordAnimations(page: Page) {
  await page.addInitScript(() => {
    window.__played = [];
    const animate = Element.prototype.animate;
    Element.prototype.animate = function (
      this: Element,
      keyframes: Keyframe[] | PropertyIndexedKeyframes | null,
      options?: number | KeyframeAnimationOptions,
    ) {
      const o = typeof options === "object" ? options : { duration: options };
      window.__played!.push({
        at: performance.now(),
        key: this.getAttribute("data-motion-key"),
        copy:
          this.getAttribute("aria-hidden") === "true" &&
          !this.hasAttribute("data-motion-key") &&
          this.hasAttribute("data-motion-ghost"),
        tag: this.tagName.toLowerCase(),
        cls: this.getAttribute("class") ?? "",
        text: (this.textContent ?? "").trim().slice(0, 60),
        data: this.getAttributeNames().filter((n) => n.startsWith("data-")),
        keyframes: Array.isArray(keyframes)
          ? JSON.parse(JSON.stringify(keyframes))
          : [],
        delay: Number(o.delay ?? 0),
        duration: Number(o.duration ?? 0),
        easing: o.easing,
      });
      return animate.call(this, keyframes, options);
    } as typeof Element.prototype.animate;
  });
}

export const played = (page: Page): Promise<Played[]> =>
  page.evaluate(() => window.__played ?? []);

export const forgetAnimations = (page: Page) =>
  page.evaluate(() => {
    window.__played!.length = 0;
  });
