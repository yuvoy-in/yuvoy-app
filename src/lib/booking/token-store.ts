import { get, set, del, keys } from "idb-keyval";
import { TOKEN_PARAM } from "./scrub";
import type { components } from "@/lib/api/schema.gen";

type BookingStatus = components["schemas"]["BookingStatus"];

/**
 * Where a guest's bookings live.
 *
 * Checkout is unauthenticated on purpose, so there is no server-side list of
 * "my bookings" until somebody signs in. The status token IS the access, and
 * this is the only copy of it a traveller has. That makes this store the
 * difference between "the Trips tab works" and "you lost your booking".
 *
 * IndexedDB, not localStorage:
 *   - localStorage is synchronous and blocks the main thread on a slow device;
 *   - it is the first place an XSS payload looks;
 *   - and it cannot hold the cached booking payload T9 needs to render offline.
 * An eslint rule bans localStorage outright so this cannot drift.
 *
 * The store is keyed by booking REFERENCE, never enumerable as a bare list of
 * tokens.
 */

const TOKEN_PREFIX = "yuvoy.token.";
const SNAPSHOT_PREFIX = "yuvoy.booking.";

export interface StoredBooking {
  reference: string;
  token: string;
  savedAt: string;
}

/** A booking as last seen, so T9 renders with no network. */
export interface BookingSnapshot {
  reference: string;
  status: BookingStatus;
  fetchedAt: string;
}

function available(): boolean {
  return typeof indexedDB !== "undefined";
}

export async function saveToken(
  reference: string,
  token: string,
): Promise<void> {
  if (!available()) return;
  const record: StoredBooking = {
    reference,
    token,
    savedAt: new Date().toISOString(),
  };
  await set(TOKEN_PREFIX + reference, record);
}

export async function getToken(reference: string): Promise<string | null> {
  if (!available()) return null;
  const record = await get<StoredBooking>(TOKEN_PREFIX + reference);
  return record?.token ?? null;
}

export async function listBookings(): Promise<StoredBooking[]> {
  if (!available()) return [];
  const all = await keys();
  const refs = all
    .filter(
      (k): k is string => typeof k === "string" && k.startsWith(TOKEN_PREFIX),
    )
    .map((k) => k.slice(TOKEN_PREFIX.length));

  const records = await Promise.all(
    refs.map((r) => get<StoredBooking>(TOKEN_PREFIX + r)),
  );
  return records
    .filter((r): r is StoredBooking => Boolean(r))
    .sort((a, b) => b.savedAt.localeCompare(a.savedAt));
}

export async function forgetBooking(reference: string): Promise<void> {
  if (!available()) return;
  await Promise.all([
    del(TOKEN_PREFIX + reference),
    del(SNAPSHOT_PREFIX + reference),
  ]);
}

/**
 * T9's offline guarantee.
 *
 * "The one screen that has to work even if WhatsApp, email and signal all
 * fail" is the screen's stated job, so the whole payload is written on the
 * first successful fetch and rendered from here when the network is gone —
 * with a visible "last checked" stamp, never presented as live.
 */
export async function saveSnapshot(
  reference: string,
  status: BookingStatus,
): Promise<void> {
  if (!available()) return;
  const snapshot: BookingSnapshot = {
    reference,
    status,
    fetchedAt: new Date().toISOString(),
  };
  await set(SNAPSHOT_PREFIX + reference, snapshot);
}

export async function getSnapshot(
  reference: string,
): Promise<BookingSnapshot | null> {
  if (!available()) return null;
  return (await get<BookingSnapshot>(SNAPSHOT_PREFIX + reference)) ?? null;
}

/* ------------------------------------------------------------- fragment */

/**
 * Reads the token from the URL fragment.
 *
 * A fragment is never sent to the server, so this can only run in the browser
 * — which is why the booking route is client-only. That is a constraint the
 * token forces, not a preference.
 */
export function readTokenFromFragment(
  hash: string = window.location.hash,
): string | null {
  const raw = hash.startsWith("#") ? hash.slice(1) : hash;
  const token = new URLSearchParams(raw).get(TOKEN_PARAM);
  return token && token.length > 0 ? token : null;
}

/** Builds the link the traveller keeps. Fragment, never a path or query. */
export function bookingUrl(token: string, origin = ""): string {
  return `${origin}/booking#${TOKEN_PARAM}=${encodeURIComponent(token)}`;
}
