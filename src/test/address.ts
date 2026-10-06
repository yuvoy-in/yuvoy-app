import { useSyncExternalStore } from "react";

/**
 * The address as the App Router shows it, for a `next/navigation` mock.
 *
 * Next patches `history.replaceState` and `history.pushState` so that a screen
 * writing its query in place is rendered again with it (`useSearchParams`),
 * with no navigation and no request (node_modules/next/dist/client/components/
 * app-router.js). Search and checkout write their choices that way, so a mock
 * that read a fixed string would pass a screen that wrote the address nowhere,
 * and one that ignored the history API would fail a screen that writes it the
 * documented way.
 *
 * A write lands at once here. In the browser it lands inside the transition
 * that wrote it, a render behind the typing on a slow phone; that lag is
 * `e2e/address.spec.ts`'s to prove, on a throttled CPU, because a unit test
 * cannot hold a transition open the way a busy main thread does.
 */
let shown = "/";
const listeners = new Set<() => void>();

const here = () => `${window.location.pathname}${window.location.search}`;

function land() {
  shown = here();
  listeners.forEach((listener) => listener());
}

/** Patches the history API the way the App Router does. Returns the undo. */
export function followHistory(): () => void {
  const { replaceState, pushState } = window.history;
  window.history.replaceState = (...args) => {
    replaceState.apply(window.history, args);
    land();
  };
  window.history.pushState = (...args) => {
    pushState.apply(window.history, args);
    land();
  };
  return () => {
    window.history.replaceState = replaceState;
    window.history.pushState = pushState;
  };
}

/**
 * The router moving the address on its own account: a Link, a tab, Back.
 * Also how a test puts a page at an address before it renders.
 */
export function navigateTo(href: string) {
  History.prototype.replaceState.call(window.history, null, "", href);
  land();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The address the router has rendered, as `useSearchParams` reads it. */
export function useShownAddress(): string {
  return useSyncExternalStore(
    subscribe,
    () => shown,
    () => shown,
  );
}

/** The query in the address bar itself. */
export function addressBar(): URLSearchParams {
  return new URLSearchParams(window.location.search);
}
