import { cookies } from "next/headers";

/**
 * The traveller's session, in a cookie this app's own server sets.
 *
 * ## Why it moved out of IndexedDB
 *
 * Safari on iPhone deletes a site's script-written storage, IndexedDB and
 * `localStorage` alike, after seven days of Safari use without a visit. The
 * server never signed anybody out: on 14 September the owner's number had
 * twelve live sessions from about twenty-one hours, none revoked. The phone
 * lost the token, twelve times. A cookie the origin's own server sets is not
 * swept that way (yuvoy-app#57).
 *
 * It is also the only way to keep the token out of reach of script. Nothing in
 * the browser can read `yv_session`, so an injected script cannot lift a
 * traveller's session out of the page.
 *
 * ## What a cookie does not fix, and must not be made to
 *
 * WhatsApp and Instagram each open links in their own browser with their own
 * cookie jar, so a link opened there still starts signed out. That is the
 * Login button's job (yuvoy-app#56), not this file's. Do not try to share a
 * sign-in across browsers.
 *
 * ## Fourteen days SINCE LAST USE
 *
 * Not fourteen days from signing in. The API extends its own session on every
 * authenticated request, and `GET /me` answers the current end in
 * `session.expiresAt`. The contract's own instruction is to keep the cookie in
 * step with that value rather than with the one sign-in returned, which is why
 * `maxAgeFrom` exists and why every proxied response re-sets the cookie.
 */

export const SESSION_COOKIE = "yv_session";

/** Fourteen days, in seconds. The fallback when the API states no horizon. */
export const SESSION_MAX_AGE = 14 * 24 * 60 * 60;

/**
 * Whether this connection is HTTPS, which decides the `Secure` attribute.
 *
 * Not a constant, and not `NODE_ENV`. `Secure` is refused over plain HTTP by
 * some browsers, and e2e runs a PRODUCTION build over `http://127.0.0.1:3100`
 * — so a hardcoded `secure: true` would silently drop the cookie there and
 * every signed-in test would fail in a way that looks like a broken sign-in.
 *
 * Vercel terminates TLS and forwards `x-forwarded-proto`, so that is read
 * first and the request's own protocol is the fallback. On app.yuvoy.in this
 * is always true.
 */
export function isSecureRequest(request: Request): boolean {
  const forwarded = request.headers.get("x-forwarded-proto");
  if (forwarded) return forwarded.split(",")[0].trim() === "https";
  try {
    return new URL(request.url).protocol === "https:";
  } catch {
    return true;
  }
}

/**
 * Seconds until `expiresAt`, clamped to something sane.
 *
 * The clamp is not defensiveness for its own sake. A clock skew or a bad value
 * upstream would otherwise write a cookie that expires in the past (signing
 * the traveller out on the next request) or one that outlives the session it
 * names (a signed-in screen whose first call 401s). Both are the failure this
 * change exists to remove, arrived at from opposite sides.
 */
export function maxAgeFrom(expiresAt: string | null | undefined): number {
  if (!expiresAt) return SESSION_MAX_AGE;
  const ms = Date.parse(expiresAt) - Date.now();
  if (!Number.isFinite(ms)) return SESSION_MAX_AGE;
  const seconds = Math.floor(ms / 1000);
  if (seconds <= 0) return SESSION_MAX_AGE;
  return Math.min(seconds, SESSION_MAX_AGE);
}

/** The session token, or `null`. Server-side only: script cannot read it. */
export async function readSessionCookie(): Promise<string | null> {
  const jar = await cookies();
  return jar.get(SESSION_COOKIE)?.value ?? null;
}

export async function writeSessionCookie(
  request: Request,
  token: string,
  expiresAt?: string | null,
): Promise<void> {
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: isSecureRequest(request),
    sameSite: "lax",
    path: "/",
    maxAge: maxAgeFrom(expiresAt),
  });
}

/**
 * Re-sets the cookie's life without changing its value.
 *
 * A no-op when there is no cookie, so a route may call it unconditionally
 * after a successful proxied request without first asking whether one existed.
 */
export async function touchSessionCookie(
  request: Request,
  expiresAt?: string | null,
): Promise<void> {
  const jar = await cookies();
  const current = jar.get(SESSION_COOKIE)?.value;
  if (!current) return;
  jar.set(SESSION_COOKIE, current, {
    httpOnly: true,
    secure: isSecureRequest(request),
    sameSite: "lax",
    path: "/",
    maxAge: maxAgeFrom(expiresAt),
  });
}

/**
 * Removes the cookie.
 *
 * Written as an empty value with `maxAge: 0` rather than `jar.delete`, because
 * the attributes have to match the ones it was set with for a browser to
 * consider it the same cookie.
 */
export async function clearSessionCookie(request: Request): Promise<void> {
  const jar = await cookies();
  jar.set(SESSION_COOKIE, "", {
    httpOnly: true,
    secure: isSecureRequest(request),
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}
