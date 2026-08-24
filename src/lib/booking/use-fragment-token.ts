"use client";

import { useSyncExternalStore } from "react";
import { readTokenFromFragment } from "./token-store";

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
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
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
