/**
 * Keeping the status token out of everything that records a URL.
 *
 * The token is returned exactly once, only its hash is stored, and it IS the
 * traveller's access to their booking. It lives in the URL fragment because a
 * fragment is never sent to a server — but a fragment is very much sent to
 * every client-side observer that reads `location.href`.
 *
 * Three leaks, all easy to miss, all closed here:
 *
 *   1. Sentry captures the full URL on every event, breadcrumb and navigation
 *      transaction name.
 *   2. PostHog's `$current_url` includes the fragment on autocapture and
 *      pageview. Consent is not the control here — the token must never reach
 *      the wire at all.
 *   3. `document.referrer` carries it to any third-party subresource. Closed
 *      by the Referrer-Policy header in next.config.ts, plus no third-party
 *      assets on the booking route.
 *
 * This module is the single implementation, so a new analytics tool is one
 * call site rather than a new leak.
 */

/** The fragment parameter the status token travels in. */
export const TOKEN_PARAM = "t";

/**
 * Removes the token from any URL-ish string.
 *
 * Deliberately removes the WHOLE fragment when it contains the token rather
 * than surgically editing it: a partially-scrubbed fragment invites somebody
 * to add a second secret beside the first and assume it is handled.
 */
export function scrubUrl(input: string): string {
  if (typeof input !== "string" || input === "") return input;

  const hashAt = input.indexOf("#");
  if (hashAt === -1) return input;

  const fragment = input.slice(hashAt + 1);
  if (!containsToken(fragment)) return input;

  return `${input.slice(0, hashAt)}#${TOKEN_PARAM}=[redacted]`;
}

function containsToken(fragment: string): boolean {
  return new URLSearchParams(fragment).has(TOKEN_PARAM);
}

/** Deep-scrubs any object heading for a logger. Bounded so a cycle cannot hang. */
export function scrubDeep<T>(value: T, depth = 0): T {
  if (depth > 6) return value;
  if (typeof value === "string") return scrubUrl(value) as T;
  if (Array.isArray(value)) {
    return value.map((v) => scrubDeep(v, depth + 1)) as T;
  }
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = scrubDeep(v, depth + 1);
    }
    return out as T;
  }
  return value;
}
