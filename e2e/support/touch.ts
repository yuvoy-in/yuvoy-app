import type { Page } from "@playwright/test";

/**
 * One real touch drag, through the browser's own input pipeline.
 *
 * `page.mouse` is not a substitute and quietly proves nothing: the feed is a
 * touch-scroll container with `touch-action: pan-y`, so a mouse drag moves
 * `scrollTop` by zero and a test built on it reports "the strip swallowed the
 * swipe" whether it did or not. CDP is what dispatches events the scroller
 * actually reacts to.
 *
 * Lived in `feed-chrome.spec.ts` until `login-button.spec.ts` needed the same
 * gesture to prove the masthead still scrolls with a button in it
 * (yuvoy-app#56).
 */
export async function swipe(
  page: Page,
  from: { x: number; y: number },
  to: { x: number; y: number },
  steps = 12,
) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x: from.x, y: from.y }],
  });
  for (let i = 1; i <= steps; i++) {
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [
        {
          x: from.x + ((to.x - from.x) * i) / steps,
          y: from.y + ((to.y - from.y) * i) / steps,
        },
      ],
    });
  }
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  await cdp.detach();
}

/**
 * One touch drag as the browser would send it, through React's own pointer
 * handlers. Synthetic, because WebKit has no CDP; the timing is real, so the
 * speed the gesture reads is the speed it was made at.
 */
export async function touchDrag(
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
