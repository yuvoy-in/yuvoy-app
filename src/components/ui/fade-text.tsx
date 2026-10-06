"use client";

import { useLayoutEffect, useRef } from "react";
import { cn } from "@/lib/cn";
import { DURATION, EASE, prefersReducedMotion } from "@/lib/motion";

/** The old words' fade: quick, accelerating away. */
const OUT_MS = 100;

/**
 * Words that change in place, seen changing (T09 A, approved 4 Oct 2026):
 * the old words fade out (100ms, accelerating away), then the new ones fade
 * in (150ms). Through, not across: two different sentences dissolving into
 * each other read as double text for a moment. Under reduced motion the new
 * words fade in where the old ones were (120ms).
 *
 * The first drawing is simply there. The words that leave are a copy hidden
 * from assistive technology and laid over the new ones, so the text a screen
 * reader finds is only ever the current one, and a live region around this
 * still announces the new words once.
 *
 * `fade={false}` draws a change as simply as the first drawing: for words
 * that resolve as a screen opens rather than change because of something
 * done on it, which nobody saw changing (checkout's heading, as the departure
 * a link names lands with the dates).
 *
 * `block` for a heading or a line of its own; inline otherwise.
 *
 * `wordsClassName` is for a line whose voice changes with its words: a
 * heading that is a question in the display cut until a day is chosen, then
 * the day and hour on the board. Set on the words rather than their parent,
 * so the leaving copy keeps the face it was drawn in while it fades instead
 * of being redrawn in the new one for 100ms.
 */
export function FadeText({
  children,
  block = false,
  fade = true,
  className,
  wordsClassName,
}: {
  children: string;
  block?: boolean;
  fade?: boolean;
  className?: string;
  wordsClassName?: string;
}) {
  const box = useRef<HTMLSpanElement | null>(null);
  const words = useRef<HTMLSpanElement | null>(null);
  const last = useRef({ children, wordsClassName });

  useLayoutEffect(() => {
    const frame = box.current;
    const now = words.current;
    const was = last.current;
    last.current = { children, wordsClassName };
    if (!frame || !now || was.children === children || !fade) return;
    if (typeof now.animate !== "function") return;
    if (prefersReducedMotion()) {
      now.animate([{ opacity: 0 }], {
        duration: DURATION.reducedFade,
        easing: "linear",
      });
      return;
    }
    const copy = document.createElement("span");
    copy.textContent = was.children;
    if (was.wordsClassName) copy.className = was.wordsClassName;
    copy.setAttribute("aria-hidden", "true");
    copy.style.position = "absolute";
    copy.style.inset = "0";
    copy.style.pointerEvents = "none";
    frame.appendChild(copy);
    copy
      .animate([{ opacity: 1 }, { opacity: 0 }], {
        duration: OUT_MS,
        easing: EASE.exit,
        fill: "forwards",
      })
      .finished.then(
        () => copy.remove(),
        () => copy.remove(),
      );
    now.animate([{ opacity: 0 }], {
      duration: DURATION.quick,
      delay: OUT_MS,
      easing: EASE.interaction,
      fill: "backwards",
    });
  }, [children, wordsClassName, fade]);

  return (
    <span
      ref={box}
      className={cn("relative", block ? "block" : "inline-block", className)}
    >
      <span
        ref={words}
        className={cn(block && "block", wordsClassName) || undefined}
      >
        {children}
      </span>
    </span>
  );
}
