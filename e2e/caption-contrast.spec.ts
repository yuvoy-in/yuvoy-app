import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test, expect, type Page } from "@playwright/test";

/**
 * The reel caption's contrast, measured where the lines really land.
 *
 * `palette.test.ts` proves the scrim at a POSITION: 4.5:1 at 58% of its
 * height, the caption's top edge "at worst". That number was a measurement of
 * a two-line title on a narrow phone, and a title is operator-written and
 * clamped at three lines. This walks real phones, with the feed's own title
 * and with a three-line one, finds where each caption line starts on the
 * scrim, and composites it over the brightest frame a clip has shown, the way
 * the palette test does.
 */

const css = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");
const ABYSS = /--color-abyss:\s*(#[0-9a-fA-F]{6})/.exec(css)![1];
const HIGHLIGHT = "#e8e2d4";

function stops(): [number, number][] {
  const block = /@utility feed-scrim \{([\s\S]*?)\n\}/.exec(css)![1];
  const found: [number, number][] = [];
  for (const line of block.split("\n")) {
    const mixed =
      /color-mix\(in srgb, var\(--color-abyss\) (\d+)%, transparent\)\s+(\d+)%/.exec(
        line,
      );
    if (mixed) {
      found.push([Number(mixed[2]), Number(mixed[1])]);
      continue;
    }
    const solid = /var\(--color-abyss\)\s+(\d+)%/.exec(line);
    if (solid) {
      found.push([Number(solid[1]), 100]);
      continue;
    }
    const clear = /transparent\s+(\d+)%/.exec(line);
    if (clear) found.push([Number(clear[1]), 0]);
  }
  return found.sort((a, b) => a[0] - b[0]);
}

function alphaAt(at: number): number {
  const ramp = stops();
  if (at <= ramp[0][0]) return ramp[0][1] / 100;
  for (let i = 0; i < ramp.length - 1; i++) {
    const [p0, a0] = ramp[i];
    const [p1, a1] = ramp[i + 1];
    if (at >= p0 && at <= p1) {
      return (a0 + ((a1 - a0) * (at - p0)) / (p1 - p0)) / 100;
    }
  }
  return 0;
}

const channels = (hex: string) =>
  [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
function luminance(rgb: number[]): number {
  const [r, g, b] = rgb.map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
/** `paper` at `opacity`, over the scrim at `at`%, over the palest frame. */
function contrastAt(at: number, opacity: number): number {
  const alpha = alphaAt(at);
  const ground = channels(HIGHLIGHT).map((c, i) =>
    Math.round(alpha * channels(ABYSS)[i] + (1 - alpha) * c),
  );
  const text = [255, 255, 255].map((c, i) =>
    Math.round(opacity * c + (1 - opacity) * ground[i]),
  );
  const [hi, lo] = [luminance(text), luminance(ground)].sort((a, b) => b - a);
  return (hi + 0.05) / (lo + 0.05);
}

const LONG_TITLE =
  "Glass-bottom boat and snorkel day around Havelock's three best reefs, with lunch";

interface Line {
  name: string;
  /** Where its top edge sits, as a % of the scrim's height from its foot. */
  at: number;
  opacity: number;
  /** 3:1 for large text (the 3xl title), 4.5:1 for everything else. */
  floor: number;
}

async function measure(page: Page): Promise<Line[]> {
  return page.evaluate(() => {
    const card = Array.from(document.querySelectorAll("article")).find((a) => {
      const r = a.getBoundingClientRect();
      return r.top >= -1 && r.top < window.innerHeight / 2;
    });
    if (!card) throw new Error("no reel card in view");
    const scrim = card.querySelector(".feed-scrim")!.getBoundingClientRect();
    const foot = card.querySelector(".feed-foot")!;
    const pct = (el: Element | null) =>
      el
        ? ((scrim.bottom - el.getBoundingClientRect().top) / scrim.height) * 100
        : null;
    const opacityOf = (el: Element | null) => {
      if (!el) return 1;
      const m = /text-paper\/(\d+)/.exec(el.className);
      return m ? Number(m[1]) / 100 : 1;
    };
    const label = foot.querySelector("p.label");
    const title = foot.querySelector("h2");
    const departure = foot.querySelector("button[aria-controls] > span");
    const out: { name: string; at: number; opacity: number; floor: number }[] =
      [];
    if (label)
      out.push({
        name: "activity label",
        at: pct(label)!,
        opacity: opacityOf(label),
        floor: 4.5,
      });
    if (title)
      out.push({
        name: "title",
        at: pct(title)!,
        opacity: 1,
        floor: 3,
      });
    if (departure)
      out.push({
        name: "departure",
        at: pct(departure)!,
        opacity: opacityOf(departure),
        floor: 4.5,
      });
    return out;
  });
}

const PHONES = [
  { name: "narrow Android", width: 360, height: 740 },
  { name: "iPhone SE", width: 375, height: 667 },
  { name: "Pixel 7", width: 412, height: 839 },
  { name: "iPhone 14", width: 390, height: 844 },
];

for (const phone of PHONES) {
  test(`the caption clears its floor on a ${phone.name}, with a three-line title too`, async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "mobile", "one walk is enough");
    await page.setViewportSize({ width: phone.width, height: phone.height });
    await page.goto("/");
    await expect(page.locator("article .feed-foot h2").first()).toBeVisible();
    // Measured in the faces that ship: a fallback face wraps differently.
    await page.evaluate(() => document.fonts.ready);

    const check = (lines: Line[], label: string) => {
      expect(
        lines.map((l) => l.name),
        "the caption this measures: label, title, departure",
      ).toEqual(["activity label", "title", "departure"]);
      for (const line of lines) {
        const ratio = contrastAt(line.at, line.opacity);
        testInfo.annotations.push({
          type: "contrast",
          description: `${label}: ${line.name} at ${line.at.toFixed(1)}% (paper/${Math.round(line.opacity * 100)}) = ${ratio.toFixed(2)}:1, floor ${line.floor}`,
        });
        expect
          .soft(ratio, `${label} ${line.name}`)
          .toBeGreaterThanOrEqual(line.floor);
      }
    };

    check(await measure(page), "feed title");

    // The worst an operator can write: a title the clamp holds at three lines.
    await page.evaluate((long) => {
      const card = Array.from(document.querySelectorAll("article")).find(
        (a) => {
          const r = a.getBoundingClientRect();
          return r.top >= -1 && r.top < window.innerHeight / 2;
        },
      );
      const link = card?.querySelector(".feed-foot h2 a");
      if (link) link.textContent = long;
    }, LONG_TITLE);
    const lines = await measure(page);
    const titleLines = await page.evaluate(() => {
      const card = Array.from(document.querySelectorAll("article")).find(
        (a) => {
          const r = a.getBoundingClientRect();
          return r.top >= -1 && r.top < window.innerHeight / 2;
        },
      );
      const a = card!.querySelector(".feed-foot h2 a") as HTMLElement;
      const lh = parseFloat(getComputedStyle(a).lineHeight);
      return Math.round(a.getBoundingClientRect().height / lh);
    });
    // The worst case only counts if it is the worst case.
    expect(titleLines, "the long title fills the clamp").toBe(3);
    check(lines, "three-line title");
  });
}
