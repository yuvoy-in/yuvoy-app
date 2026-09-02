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
 * ## One key, decided once
 *
 * A booking is known by two ids at two moments. Checkout returns a
 * `reservationId` and a token; the reference (`YV-…`) exists only once the
 * booking does. The first version of this file keyed tokens by whichever id
 * the caller had and snapshots by the other, so for every booking made on
 * this device the offline snapshot could never be found, the Trips card
 * showed an internal `res_…` id styled as the thing you read out at the
 * jetty, and signing in later saved the same trip a second time under its
 * reference.
 *
 * Now every record has ONE key — the reference once it is known, the
 * reservation id until then — and `rememberBooking()` re-keys a record the
 * moment it learns the reference. Snapshots use the same key. Every reader
 * joins on `key`.
 *
 * ## Nothing here may throw
 *
 * Safari's private mode defines `indexedDB` and then refuses to open it; some
 * browsers hang the open. The token is already in the URL fragment and the
 * server holds the booking, so persistence is an enhancement — a failed write
 * must never turn a successful checkout into an error screen. Every function
 * resolves, with a result that says what happened, rather than rejecting.
 */

const TOKEN_PREFIX = "yuvoy.token.";
const SNAPSHOT_PREFIX = "yuvoy.booking.";

export interface StoredBooking {
  /** The store key: the reference once known, else the reservation id. */
  key: string;
  reservationId?: string;
  /** `YV-…`. Absent for a hold that never became a booking. */
  reference?: string;
  token: string;
  savedAt: string;
  /**
   * The server refused this token as expired or unknown. Kept rather than
   * deleted so the Trips card can say so and offer a new link, instead of the
   * booking silently vanishing from the device.
   */
  dead?: boolean;
}

/** A booking as last seen, so T9 renders with no network. */
export interface BookingSnapshot {
  /** Same key as the `StoredBooking` it belongs to. */
  reference: string;
  status: BookingStatus;
  fetchedAt: string;
}

function available(): boolean {
  return typeof indexedDB !== "undefined";
}

/* -------------------------------------------------------- safe primitives */

async function safeGet<T>(key: string): Promise<T | null> {
  if (!available()) return null;
  try {
    return (await get<T>(key)) ?? null;
  } catch {
    return null;
  }
}

async function safeSet(key: string, value: unknown): Promise<boolean> {
  if (!available()) return false;
  try {
    await set(key, value);
    return true;
  } catch {
    return false;
  }
}

async function safeDel(key: string): Promise<void> {
  if (!available()) return;
  try {
    await del(key);
  } catch {
    // Nothing to do: a record that could not be deleted is a record that
    // could not be written either.
  }
}

async function safeKeys(): Promise<string[]> {
  if (!available()) return [];
  try {
    const all = await keys();
    return all.filter((k): k is string => typeof k === "string");
  } catch {
    return [];
  }
}

/** Tolerates records written before `key` existed. */
function normalise(raw: unknown): StoredBooking | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Partial<StoredBooking> & { reference?: string };
  if (typeof r.token !== "string" || !r.token) return null;
  const key = r.key ?? r.reference;
  if (!key) return null;
  return {
    key,
    reservationId: r.reservationId,
    reference: r.reference,
    token: r.token,
    savedAt: r.savedAt ?? new Date(0).toISOString(),
    dead: r.dead,
  };
}

/* ---------------------------------------------------------------- tokens */

/**
 * Keep a booking's token on this device, under one key.
 *
 * Called from checkout (reservation id only), from the first status fetch
 * (both ids — this is where a hold learns its reference and is re-keyed),
 * from recovery (a fresh token for a booking already here, which overwrites
 * the revoked one under the same key) and from the account list (reference
 * and token). The same record ends up in the same place whichever door it
 * came through, which is what keeps the Trips tab from listing one trip twice.
 *
 * Resolves `false` when nothing could be written. Never rejects.
 */
export async function rememberBooking(input: {
  reservationId?: string;
  reference?: string;
  token: string;
}): Promise<boolean> {
  const key = input.reference ?? input.reservationId;
  if (!key) return false;

  // A record written under the reservation id before the reference was known.
  const earlier =
    input.reference && input.reservationId
      ? await safeGet<StoredBooking>(TOKEN_PREFIX + input.reservationId)
      : null;
  const existing = await safeGet<StoredBooking>(TOKEN_PREFIX + key);

  const record: StoredBooking = {
    key,
    reservationId:
      input.reservationId ?? existing?.reservationId ?? earlier?.reservationId,
    reference: input.reference ?? existing?.reference,
    token: input.token,
    savedAt: new Date().toISOString(),
  };

  const written = await safeSet(TOKEN_PREFIX + key, record);
  if (written && earlier && input.reservationId !== key) {
    await safeDel(TOKEN_PREFIX + input.reservationId!);
    // The snapshot, if any, was keyed the same way and moves with it.
    const snap = await safeGet<BookingSnapshot>(
      SNAPSHOT_PREFIX + input.reservationId!,
    );
    if (snap) {
      await safeSet(SNAPSHOT_PREFIX + key, { ...snap, reference: key });
      await safeDel(SNAPSHOT_PREFIX + input.reservationId!);
    }
  }
  return written;
}

export async function getToken(key: string): Promise<string | null> {
  const record = normalise(await safeGet(TOKEN_PREFIX + key));
  return record?.token ?? null;
}

export async function findByToken(
  token: string,
): Promise<StoredBooking | null> {
  const all = await listBookings();
  return all.find((b) => b.token === token) ?? null;
}

/**
 * The server said this token is finished — expired, or replaced by a newer
 * link. The record stays, flagged, so the Trips card can offer recovery.
 */
export async function markTokenDead(token: string): Promise<void> {
  const record = await findByToken(token);
  if (!record || record.dead) return;
  await safeSet(TOKEN_PREFIX + record.key, { ...record, dead: true });
}

export async function listBookings(): Promise<StoredBooking[]> {
  const tokenKeys = (await safeKeys()).filter((k) =>
    k.startsWith(TOKEN_PREFIX),
  );
  const records = await Promise.all(
    tokenKeys.map((k) => safeGet<unknown>(k).then(normalise)),
  );
  return records
    .filter((r): r is StoredBooking => r !== null)
    .sort((a, b) => b.savedAt.localeCompare(a.savedAt));
}

export async function forgetBooking(key: string): Promise<void> {
  await Promise.all([
    safeDel(TOKEN_PREFIX + key),
    safeDel(SNAPSHOT_PREFIX + key),
  ]);
}

/* ------------------------------------------------------------- snapshots */

/**
 * T9's offline guarantee.
 *
 * "The one screen that has to work even if WhatsApp, email and signal all
 * fail" is the screen's stated job, so the whole payload is written on the
 * first successful fetch and rendered from here when the network is gone —
 * with a visible "last checked" stamp, never presented as live.
 */
export async function saveSnapshot(
  key: string,
  status: BookingStatus,
): Promise<boolean> {
  const snapshot: BookingSnapshot = {
    reference: key,
    status,
    fetchedAt: new Date().toISOString(),
  };
  return safeSet(SNAPSHOT_PREFIX + key, snapshot);
}

export async function getSnapshot(
  key: string,
): Promise<BookingSnapshot | null> {
  return safeGet<BookingSnapshot>(SNAPSHOT_PREFIX + key);
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
