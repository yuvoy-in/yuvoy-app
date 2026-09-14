import { get, del } from "idb-keyval";

/**
 * What is left of the IndexedDB session: the way out of it (yuvoy-app#57).
 *
 * ## Why it is going
 *
 * The traveller's session token used to live here, beside the booking tokens,
 * because `localStorage` is an eslint error in this repo and IndexedDB was the
 * remaining choice. Both are script-written storage, and Safari on iPhone
 * deletes a site's script-written storage after seven days of Safari use
 * without a visit. Nothing in the app ever deleted a session; Safari did, over
 * and over. On 14 September the owner's number had twelve live sessions from
 * about twenty-one hours, all valid and none revoked.
 *
 * A cookie the origin's own server sets survives that, and cannot be read by
 * script at all. See `session-cookie.ts`.
 *
 * ## Why this file still exists
 *
 * Deleting the store outright would sign out everybody who was signed in when
 * the change shipped, for a reason none of them could see: their session is
 * good, the app has simply stopped looking where it was kept. So the token is
 * handed to `POST /api/session/adopt` once, which proves it against `GET /me`
 * before setting a cookie from it, and the record is deleted either way.
 *
 * Nothing WRITES here any more. When the adoption window has passed, this file
 * and its two callers go, and the booking-token store in `token-store.ts` is
 * unaffected: per-booking status tokens are explicitly out of scope for #57.
 */

const KEY = "yuvoy.traveller-session";
/** The pre-#34 record. It held a status token the new endpoints do not take. */
const LEGACY_KEY = "yuvoy.traveller-token";

function available(): boolean {
  return typeof indexedDB !== "undefined";
}

/**
 * The stored token, if a signed-in traveller predates the cookie.
 *
 * Deliberately does not check `expiresAt`. The server is the only authority on
 * whether a session is live, `POST /api/session/adopt` asks it, and a local
 * clock that is wrong by a day would otherwise throw away a working session.
 */
export async function storedSessionToken(): Promise<string | null> {
  if (!available()) return null;
  try {
    const session = await get<{ sessionToken?: string }>(KEY);
    return session?.sessionToken ?? null;
  } catch {
    /*
      A private window, a browser with storage blocked, or a database that
      will not open. There is nothing to migrate and nothing to report: the
      traveller signs in again, which is the pre-change behaviour anyway.
    */
    return null;
  }
}

/** Removes both records. Called after an adoption attempt, whatever it said. */
export async function forgetStoredSession(): Promise<void> {
  if (!available()) return;
  try {
    await del(KEY);
    await del(LEGACY_KEY);
  } catch {
    // As above. A failure to clean up must never surface to a traveller.
  }
}
