"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { ViewTransition } from "@/lib/motion/view-transition";
import { REEL_MOTION } from "@/lib/motion/route-motion";

/** The well's geometry, shared by the strip and by every state beside it. */
export const REEL_WELL =
  "bg-abyss relative h-dvh w-full lg:h-[calc(100dvh-3rem)] lg:rounded-sheet lg:ring-1 lg:ring-paper/10";

/**
 * How a message sits in the well, for the states that are one block of text.
 *
 * Both axes needed saying. `items-center` alone centres only the cross axis,
 * and the block sizes to its content (a `max-w-sm` body inside `px-6`, so
 * 432px), which left it flush against the left edge of a 480px well with 48px
 * of dead space beside it.
 *
 * `pb-17` is 68px: the bar's own 56px (44px targets in a `p-1.5` pill) plus
 * its 12px foot. The bar FLOATS over the well rather than sitting under it, so
 * centring against the well's full height put the message 34px below the
 * middle of the part a traveller can actually see. Cancelled from `lg` up,
 * where the rail takes over and nothing covers the well.
 */
export const REEL_WELL_CENTRED =
  "flex items-center justify-center pb-17 lg:pb-0";

/**
 * The well, for the states that do not scroll.
 *
 * `chrome` is the strip's own, drawn where the strip draws it. Every state of
 * a reel screen used to leave it out, so the feed waited with no mark and no
 * Login, and a focused reel screen, whose tab bar is hidden, waited (or
 * failed) with no way back at all; the chrome only arrived with the clips
 * (stability audit, 6 Oct 2026). A state that is still in flight keeps its
 * `LoadingState` inside the well, so the chrome is never inside a busy region.
 */
export function ReelFrame({
  children,
  className,
  chrome,
}: {
  children: ReactNode;
  className?: string;
  chrome?: ReactNode;
}) {
  return (
    <ViewTransition {...REEL_MOTION}>
      <div className="container-feed relative lg:my-6">
        {chrome}
        <div className={cn(REEL_WELL, "lg:overflow-hidden", className)}>
          {children}
        </div>
      </div>
    </ViewTransition>
  );
}
