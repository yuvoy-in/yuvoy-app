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
