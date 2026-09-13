import { get, set, del } from "idb-keyval";

/**
 * The traveller's session — yuvoy-app#34, yuvoy-api#172.
 *
 * ## What this replaces, and why it had to change
 *
 * Signing in used to BE booking recovery: `POST /bookings/recovery/verify`
 * returned a status token and this stored it. The contract said so at the
 * time, and it was the smaller shape — one secret instead of two.
 *
 * It was also broken in two ways the owner hit within a minute of trying it:
 *
 *   - **Recovery refuses a correct code for a number that has never booked.**
 *     It is a recovery endpoint; there is nothing to recover. So a traveller
 *     signing in for the first time typed the right code and read "That code
 *     did not work".
 *   - **Every successful recovery REVOKES the booking links already saved on
 *     the phone.** Rotating the link is the whole point of recovery. So the
 *     "Booked on this device" trips stopped opening the moment anybody signed
 *     in — a traveller lost access to their own bookings by signing in to see
 *     them.
 *
 * `POST /me/sign-in/verify` is the sign-in: any number, whether or not it has
 * ever booked, a session that lasts 30 days, and it **revokes nothing**.
 * Recovery survives for the one job it is for — "Lost your link? Get it back"
 * — where rotating the link is the point.
 *
 * ## The stored shape changed with it
 *
 * A status token authenticated one booking; a session token authenticates a
 * number. The field is renamed rather than reused, so nothing can pass one
 * where the other belongs, and `expiresAt` is kept because the server sets a
 * real horizon and a client that ignores it shows a signed-in screen that can
 * only fail.
 *
 * Stored in IndexedDB beside the booking tokens, for the same reason: an
 * eslint rule bans `localStorage` outright.
 */

const KEY = "yuvoy.traveller-session";
/** The pre-#34 record, read once so a signed-in traveller is not thrown out. */
const LEGACY_KEY = "yuvoy.traveller-token";

export interface TravellerSession {
  /** From `verifyTravellerSignIn`. Bearer credential for `/me/*`. */
  sessionToken: string;
  /** ISO 8601. The server's horizon, not ours. */
  expiresAt: string | null;
  savedAt: string;
}

function available(): boolean {
  return typeof indexedDB !== "undefined";
}

export async function saveTravellerSession(session: {
  sessionToken: string;
  expiresAt?: string | null;
}): Promise<void> {
  if (!available()) return;
  await set(KEY, {
    sessionToken: session.sessionToken,
    expiresAt: session.expiresAt ?? null,
    savedAt: new Date().toISOString(),
  } satisfies TravellerSession);
}

/**
 * The session, or `null`.
 *
 * An EXPIRED session answers null and deletes itself. The alternative is a
 * screen that renders as signed in and then fails its first request — which is
 * the state this whole change exists to remove, arrived at from the other
 * side.
 *
 * The legacy record is read once and then dropped. It held a status token,
 * which the new endpoints do not accept: keeping it would sign somebody in to
 * a session that 401s on its first call, and deleting it silently signs out
 * everybody who was signed in before this shipped. Neither is good, and the
 * second is the honest one — they sign in again, and this time it works for a
 * number that has never booked.
 */
export async function getTravellerSession(): Promise<TravellerSession | null> {
  if (!available()) return null;

  const legacy = await get<{ token?: string }>(LEGACY_KEY);
  if (legacy) await del(LEGACY_KEY);

  const session = await get<TravellerSession>(KEY);
  if (!session?.sessionToken) return null;

  if (session.expiresAt && Date.parse(session.expiresAt) <= Date.now()) {
    await del(KEY);
    return null;
  }
  return session;
}

export async function clearTravellerSession(): Promise<void> {
  if (!available()) return;
  await del(KEY);
  await del(LEGACY_KEY);
}
