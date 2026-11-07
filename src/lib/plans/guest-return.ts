import { nextParamFor } from "@/lib/site/next-path";
import { isGuestToken } from "./guest-token";

/**
 * "Link my reply to my account", across the sign-in it needs
 * (yuvoy-mobile#373, case 15).
 *
 * Sign-in is another page, `/account`, and comes back by `?next=`. The token
 * cannot ride in `next`: a query lands in the request log, the history and
 * any report of the address, which is the whole reason it lives after the
 * `#`. And a fragment does not survive the trip through sign-in. So the
 * token waits in `sessionStorage`, which is this tab's alone, gone when the
 * tab closes, and never sent anywhere; `next` is plain `/p` (with the page's
 * own query, which in a mocked build carries `?__scenario=` and in
 * production is empty).
 *
 * Back on `/p` with no fragment, the page takes the token from there once
 * (`takeArrival`), puts it back after the `#` (`restoreFragment`), and links
 * the reply, since that is what the guest left to do.
 *
 * ## The one write to the fragment
 *
 * Nothing on the page changes `location.hash`, because changing it replaces
 * the token. `restoreFragment` is the single exception, and only into an
 * address with no fragment at all, which is exactly the case where there is
 * no token to replace. `replaceState` rather than `location.hash =`, so no
 * history entry is added and no `hashchange` runs.
 */

const STORE_KEY = "yuvoy.plan-link.return";

export interface Arrival {
  token: string;
  /** The guest left to sign in to link their reply. */
  link: boolean;
}

/** Keeps the token for the way back from sign-in. False when storage refused. */
export function keepForSignIn(token: string): boolean {
  /*
    This page load may already have taken its arrival (nothing, on a first
    visit with no fragment). Sign-in comes back by a client navigation, in
    the same page load, so the next `takeArrival` must read again.
  */
  forgetTaken();
  try {
    sessionStorage.setItem(STORE_KEY, JSON.stringify({ token, link: true }));
    return true;
  } catch {
    return false;
  }
}

/** Where "Link my reply to my account" goes when there is no session. */
export function signInHref(search: string): string {
  return `/account?next=${encodeURIComponent(nextParamFor("/p", search))}`;
}

/**
 * The token this tab kept on its way to sign-in, read once and forgotten,
 * or null. Read once per page load and kept in the module, so React's
 * repeated reads during one render agree with each other, and a reload of
 * the restored address finds the token in the fragment instead.
 */
let arrival: Arrival | null | undefined;

export function takeArrival(): Arrival | null {
  if (arrival !== undefined) return arrival;
  arrival = null;
  try {
    const raw = sessionStorage.getItem(STORE_KEY);
    sessionStorage.removeItem(STORE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      isGuestToken((parsed as { token?: unknown }).token)
    ) {
      arrival = {
        token: (parsed as { token: string }).token,
        link: (parsed as { link?: unknown }).link === true,
      };
    }
  } catch {
    // No storage, or something else in it: there is no way back to take.
  }
  return arrival;
}

/**
 * The arrival this page load has already taken, without reading storage:
 * for a render that must not take one (it would empty the store the moment
 * "Link my reply" had filled it, before the tab had even left).
 */
export function arrivalTaken(): Arrival | null {
  return arrival ?? null;
}

function forgetTaken(): void {
  arrival = undefined;
}

/** Test-only: the next `takeArrival` reads storage again. */
export function __forgetArrival(): void {
  forgetTaken();
}

/**
 * Puts the token back after the `#`, only into an address that has no
 * fragment. Anything already there is left exactly as it is.
 */
export function restoreFragment(token: string): void {
  if (window.location.hash !== "" || !isGuestToken(token)) return;
  const { pathname, search } = window.location;
  window.history.replaceState(null, "", `${pathname}${search}#${token}`);
}
