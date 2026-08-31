import { get, set, del } from "idb-keyval";

/**
 * "Signing in", as the contract now defines it.
 *
 * There is no signup, no password and no second secret. The OTP that recovers
 * a lost booking IS the sign-in, and the status token it returns is what
 * unlocks `GET /v1/me/bookings` — "an account here is a projection over a
 * phone number somebody has proved they control".
 *
 * The separate `/auth/otp/*` + `/me` session was deleted upstream on
 * 2026-08-20 ("the second sign-in is deleted"), and this replaced it. It is a
 * better shape: one secret instead of two, and a traveller who never signs in
 * loses nothing, because none of it appears in the checkout path.
 *
 * Stored beside the booking tokens for the same reasons — IndexedDB rather
 * than localStorage, which an eslint rule bans outright.
 */

const KEY = "yuvoy.traveller-token";

export interface TravellerSession {
  /** The status token returned by recovery. Authenticates /me/bookings. */
  token: string;
  savedAt: string;
}

function available(): boolean {
  return typeof indexedDB !== "undefined";
}

export async function saveTravellerSession(token: string): Promise<void> {
  if (!available()) return;
  await set(KEY, {
    token,
    savedAt: new Date().toISOString(),
  } satisfies TravellerSession);
}

export async function getTravellerSession(): Promise<TravellerSession | null> {
  if (!available()) return null;
  return (await get<TravellerSession>(KEY)) ?? null;
}

export async function clearTravellerSession(): Promise<void> {
  if (!available()) return;
  await del(KEY);
}
