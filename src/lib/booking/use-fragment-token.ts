"use client";

import { useEffect, useSyncExternalStore } from "react";
import { canonicalFragment, readTokenFromFragment } from "./token-store";

/**
 * The status token, read from the URL fragment.
 *
 * `useSyncExternalStore` rather than an effect-plus-setState: the URL IS an
 * external store, and this is the primitive for reading one. It also gets us
 * `hashchange` for free — if the fragment changes (a traveller pastes a
 * different booking link into the same tab) the screen follows it instead of
 * showing the previous booking.
 *
 * The server snapshot is `null` because a fragment is never sent to a server;
 * there is genuinely nothing to read there, which is why this screen is
 * client-only at all.
 */
export function useFragmentToken(): string | null {
  const token = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  useCanonicalFragment(token);
  return token;
}

/**
 * Puts a doubled fragment back to one, in the address bar.
 *
 * See `readTokenFromFragment` for how a URL comes to carry two. Reading is
 * already safe; this is about the link the traveller COPIES out of the bar,
 * which is the only way back into a booking and is meant to be kept.
 *
 * `replaceState` rather than `router.replace`: the router is where the extra
 * fragment came from, so asking it to fix the URL invites it to append again,
 * and a booking that is merely being LOOKED at should not grow a history
 * entry. It also cannot loop — `replaceState` never fires `hashchange`, so
 * the store this hook reads does not change, and the token is identical
 * either way, so React sees no new value.
 *
 * Deliberately not guarded by a ref. The condition is the URL itself: once
 * the fragment is canonical `canonicalFragment` answers null, so a re-render
 * does nothing.
 */
function useCanonicalFragment(token: string | null): void {
  useEffect(() => {
    if (token === null) return;
    const fixed = canonicalFragment();
    if (!fixed) return;
    const { pathname, search } = window.location;
    window.history.replaceState(
      window.history.state,
      "",
      `${pathname}${search}${fixed}`,
    );
  }, [token]);
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener("hashchange", onChange);
  return () => window.removeEventListener("hashchange", onChange);
}

function getSnapshot(): string | null {
  return readTokenFromFragment();
}

function getServerSnapshot(): string | null {
  return null;
}
