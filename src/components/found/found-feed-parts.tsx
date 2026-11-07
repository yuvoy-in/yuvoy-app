"use client";

import { useState, type RefObject } from "react";
import { onlineManager } from "@tanstack/react-query";

/*
  Whether the browser thinks it has a connection, as React Query does: the
  same signal that pauses a read, so the notice and the paused read agree.
*/
export const subscribeOnline = (onChange: () => void) =>
  onlineManager.subscribe(() => onChange());
export const onlineNow = () => onlineManager.isOnline();
export const onlineOnServer = () => true;

/* ---------------------------------------------------------------- hooks -- */

/**
 * The one Report a problem sheet of this view, and where focus goes after it.
 *
 * Held here rather than in a card, because a report hides the card and the
 * sheet must outlive it to show the receipt. When it closes and the card is
 * still in the list, the sheet returns focus to the card's More button by
 * itself (the dialog's own return). When the card is gone, focus moves to the
 * card that took its place, or the one before it, or the heading: never left
 * on a node that no longer exists.
 */
export function useReport({
  list,
  heading,
}: {
  list: RefObject<HTMLDivElement | null>;
  heading: RefObject<HTMLHeadingElement | null>;
}) {
  const [item, setItem] = useState<{
    id: string;
    index: number;
    open: boolean;
  } | null>(null);

  const open = (id: string, index: number) =>
    setItem({ id, index, open: true });

  const close = () => {
    // Closed already: asked twice, it is followed once.
    if (!item?.open) return;
    const { id, index } = item;
    setItem({ ...item, open: false });

    let done = false;
    const settle = () => {
      if (done) return;
      done = true;
      document.removeEventListener("close", settle, true);
      clearTimeout(timer);
      // After the dialog's own focus return, which runs as it closes.
      requestAnimationFrame(() => {
        const cards = [
          ...(list.current?.querySelectorAll<HTMLElement>(
            "article[data-found-id]",
          ) ?? []),
        ];
        if (cards.some((card) => card.dataset.foundId === id)) return;
        const next =
          cards[Math.min(index, cards.length - 1)] ?? heading.current;
        next?.focus();
      });
    };
    // A dialog's `close` does not bubble, but it is seen on the way down.
    document.addEventListener("close", settle, true);
    // And if the sheet leaves some other way, a second is long enough.
    const timer = setTimeout(settle, 1_000);
  };

  return { item, open, close };
}
