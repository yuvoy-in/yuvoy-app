import { get, set, del } from "idb-keyval";
import type { components } from "@/lib/api/schema.gen";

type User = components["schemas"]["User"];

/**
 * The optional traveller session.
 *
 * Optional is the whole design. Booking never requires an account and NO
 * feature is gated behind one — signing in buys exactly one thing: your trips
 * follow you to a new phone.
 *
 * Stored in IndexedDB beside the booking tokens, for the same reasons: it is
 * asynchronous, it is not the first place an XSS payload looks, and an eslint
 * rule bans localStorage outright so this cannot drift.
 */

const KEY = "yuvoy.session";

export interface Session {
  accessToken: string;
  refreshToken: string;
  user: User;
  savedAt: string;
}

function available(): boolean {
  return typeof indexedDB !== "undefined";
}

export async function saveSession(
  tokens: components["schemas"]["AuthTokens"],
): Promise<void> {
  if (!available()) return;
  await set(KEY, {
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    user: tokens.user,
    savedAt: new Date().toISOString(),
  } satisfies Session);
}

export async function getSession(): Promise<Session | null> {
  if (!available()) return null;
  return (await get<Session>(KEY)) ?? null;
}

export async function clearSession(): Promise<void> {
  if (!available()) return;
  await del(KEY);
}
