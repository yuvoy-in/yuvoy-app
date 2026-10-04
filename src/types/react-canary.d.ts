/**
 * React's canary typings: `<ViewTransition>` and `addTransitionType`.
 *
 * The App Router renders with Next's own React (19.3 canary), which has both.
 * The project's `react` package is 19.2, which has neither, and it is what the
 * unit tests run. So the types come from here and the value from
 * `@/lib/motion/view-transition`, which falls back to the children alone where
 * React has no such component. ESLint refuses either name imported straight
 * from "react".
 */
/// <reference types="react/canary" />
