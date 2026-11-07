import type { Page } from "@playwright/test";

/*
  The hold the tab bar checks put on a screen change. Moved out of
  `motion.ts` to keep that file under 500 lines once the hold learned to say
  why it never came, and to try a tap again (yuvoy-app#256).
*/

declare global {
  interface Window {
    __holdAt?: number | null;
    __held?: boolean;
    /** Each change asked for while a hold was armed, and what became of it. */
    __changes?: { types: string[]; ready: string }[];
  }
}

/**
 * Holds the next typed screen change still, every one of its animations
 * paused at `window.__holdAt` ms, until another change replaces it. Lets a
 * check look at a change from the inside, which a 150ms fade never gives it
 * time to do. An untyped transition (a boundary revealing) is let through.
 * While a hold is armed every change is noted in `window.__changes`, so a
 * hold that never comes can say why (yuvoy-app#256).
 */
export async function holdNextChange(page: Page) {
  await page.addInitScript(() => {
    window.__holdAt = null;
    window.__held = false;
    window.__changes = [];
    const start = document.startViewTransition?.bind(document);
    if (!start) return;
    document.startViewTransition = ((arg: unknown) => {
      const transition = start(arg as Parameters<typeof start>[0]);
      const at = window.__holdAt;
      if (at === null || at === undefined) return transition;
      const types =
        arg !== null && typeof arg === "object"
          ? [...((arg as { types?: Iterable<string> }).types ?? [])]
          : [];
      const seen = { types, ready: "not ready yet" };
      window.__changes?.push(seen);
      const skipped = (e: unknown) => {
        seen.ready = `skipped (${(e as Error | null)?.name ?? e})`;
      };
      if (types.length === 0) {
        transition.ready.then(() => {
          seen.ready = "ran unheld";
        }, skipped);
        return transition;
      }
      window.__holdAt = null;
      transition.ready.then(() => {
        try {
          for (const a of document.documentElement.getAnimations({
            subtree: true,
          })) {
            const pseudo = (a.effect as KeyframeEffect | null)?.pseudoElement;
            if (!pseudo?.startsWith("::view-transition")) continue;
            a.pause();
            a.currentTime = at;
          }
        } catch (e) {
          seen.ready = `hold threw (${(e as Error).message})`;
          return;
        }
        seen.ready = "held";
        window.__held = true;
      }, skipped);
      return transition;
    }) as typeof document.startViewTransition;
  });
}

/** A tap whose change React let go for a reason that is not the bar's. */
export function mayTryAgain(changes: { types: string[]; ready: string }[]) {
  const typed = changes.find((c) => c.types.length > 0);
  /*
    Skipped: React skips a view transition still waiting for its update when
    any other render comes in first (`flushPendingEffects` calls
    `skipTransition()`), and the screen then changes with no motion. Untyped:
    the known cold case in docs/ux-stability-final-report.md. Either way the
    tab change happened and the bar had no part in it (yuvoy-app#256).
  */
  return typed ? typed.ready.startsWith("skipped") : changes.length > 0;
}

/** Why a tap on `to` was not held, from the changes it noted. */
export function notHeld(
  to: string,
  changes: { types: string[]; ready: string }[],
) {
  const head = `The tap on ${to} was not held within 5 s:`;
  if (changes.length === 0)
    return `${head} no screen change asked for a view transition, so the tap started no client navigation or React ran it without one.`;
  const typed = changes.find((c) => c.types.length > 0);
  if (!typed)
    return `${head} the change ran with no motion type (${changes.map((c) => c.ready).join(", ")}). This is the known cold case in docs/ux-stability-final-report.md: Next's empty deferred render took the change's types.`;
  return `${head} the typed change (${typed.types.join(" ")}) was ${typed.ready}, so nothing was held.`;
}
