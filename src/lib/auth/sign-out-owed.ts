/**
 * A sign-out this browser still owes the server (production readiness,
 * 6 Oct 2026).
 *
 * The session is an HttpOnly cookie, so only this app's server can clear it,
 * and a sign-out tapped with no signal never reaches the server. The phone
 * forgot its trips all the same, but the cookie stayed, and the next session
 * read (the signal back, a reload) found it and signed the previous person
 * back in. On a shared phone, their trips came back.
 *
 * So the sign-out is written down first, in a cookie of its own that script
 * can write and every request carries. The server honours it at once:
 * `readSessionCookie` counts no session while it is set, so neither the
 * session check, the `/api/v1` proxy nor the invite gate acts for the person
 * who signed out. The next session check (each load, and each return to the
 * tab) then ends the session, clears both cookies and tells the API. Signing
 * in clears it too: the new session replaces the old.
 *
 * A cookie, not IndexedDB: the server can see it, so nothing in the browser
 * has to remember to ask, and no storage read sits in front of the session
 * check (an IndexedDB open can hang).
 *
 * This file is imported by both sides, so it imports nothing server-only.
 */

export const SIGN_OUT_OWED_COOKIE = "yv_signed_out";

/**
 * The value that owes it. Only this counts, so a cleared cookie that a
 * browser still reports, empty, can never sign anybody out.
 */
export const OWED = "1";

/**
 * Fourteen days, as long as the session it ends can last. Safari keeps a
 * cookie written by script for at most seven, and any request to this app's
 * server before then settles it.
 */
const OWED_MAX_AGE = 14 * 24 * 60 * 60;

/** Writes the sign-out down, in the browser, before it is sent. */
export function oweSignOut(): void {
  const secure = location.protocol === "https:" ? "; Secure" : "";
  try {
    document.cookie = `${SIGN_OUT_OWED_COOKIE}=${OWED}; Path=/; Max-Age=${OWED_MAX_AGE}; SameSite=Lax${secure}`;
  } catch {
    /*
      Only a sandboxed or opaque document refuses a cookie, and this app is
      never one. If it ever were, the sign-out would still be sent, as it
      always was: signing out must finish on the phone in front of somebody.
    */
  }
}
