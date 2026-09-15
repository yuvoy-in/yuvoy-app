import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * The bar that stays at the foot of a focused screen: the price and the one
 * action, as every reference detail screen carries it.
 *
 * It breaks out of the sheet's gutters and its bottom padding so it spans the
 * sheet edge to edge, and on a desktop it takes the panel's bottom corners.
 * It is `sticky`, not `fixed`, so it never covers the last line of content:
 * scrolling to the end scrolls the bar into its own place.
 *
 * It must therefore be the LAST child of a box that reaches the end of the
 * sheet — a sticky element sticks only while its parent is on screen.
 */
export function StickyBar({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "border-paper-line bg-paper lg:rounded-b-sheet sticky bottom-0 z-20 -mx-6 mt-8 -mb-8 border-t px-6 py-4 sm:-mx-10 sm:px-10",
        className,
      )}
    >
      {children}
    </div>
  );
}
