import * as React from "react";
import type { ReactNode, ViewTransitionProps } from "react";

/**
 * React's `<ViewTransition>`, and the children alone where React has none.
 *
 * The App Router renders with Next's React canary, which has it. The unit
 * tests render with the project's `react` 19.2, which does not, and an
 * undefined element type is a crash rather than a page that simply does not
 * animate; so the tests, and any React without it, get the children unwrapped.
 * A browser without the View Transitions API is React's own business: the
 * screen changes exactly as it did before there was any motion.
 *
 * Import it from here, never from "react" (ESLint refuses the second).
 */
function Still({ children }: { children?: ReactNode }) {
  return <>{children}</>;
}

const builtin = (React as { ViewTransition?: typeof React.ViewTransition })
  .ViewTransition;

export const ViewTransition: React.ComponentType<ViewTransitionProps> =
  (builtin as React.ComponentType<ViewTransitionProps> | undefined) ?? Still;
