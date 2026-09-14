/**
 * The paths `/api/v1/[...path]` will forward, and nothing else.
 *
 * ## Why an allowlist and not a pass-through
 *
 * The proxy attaches the traveller's session to whatever it forwards. A
 * pass-through would therefore be an open, credentialed relay into the API:
 * anything reachable at `/v1/<x>` becomes reachable at `/api/v1/<x>`, signed
 * as whoever is holding the cookie, from any page that can make a fetch.
 *
 * The allowlist is the difference between "the app's server speaks for the
 * traveller on these five calls" and "the app's server speaks for the
 * traveller on anything". Adding a line here is a deliberate act, which is the
 * point.
 *
 * Path traversal is handled by matching the REBUILT path rather than the raw
 * segments: `["..", "admin"]` joins to `/../admin`, which matches no pattern
 * and is refused before a URL is ever constructed.
 *
 * ## What is here, and what is deliberately not
 *
 * Only calls that exist today. yuvoy-app#57 names four families to cover, and
 * two of them (`/me/invited-trips`, `/bookings/invites`) have no call site in
 * this repo yet: they arrive with #38. An allowlist entry with no caller is
 * untested surface, so each lands with the screen that reads it. The mechanism
 * is here; the lines are one each.
 *
 * `POST /reservations` is signed-in checkout (#32, #38). It is NOT here yet
 * for the same reason, and it needs one extra thought when it lands: it must
 * still work for a GUEST, which means the call cannot simply move behind the
 * proxy. See the note on `requiresSession` below.
 *
 * `POST /me/sign-in/request` and `/verify` are absent on purpose. Neither is
 * authenticated, and verify is what MINTS the cookie, so it has its own route
 * at `/api/session`.
 */

export interface ProxiedPath {
  method: "GET" | "POST" | "PATCH" | "DELETE";
  /**
   * A contract path. `{id}` matches one segment and nothing containing a
   * slash, so `{id}` can never widen into a traversal.
   */
  pattern: string;
}

export const PROXIED_PATHS: readonly ProxiedPath[] = [
  /*
    The Account tab, and the only call that answers `session.expiresAt`. Every
    screen that needs to know who the traveller is reads this one (#32, #38),
    and `/api/session` uses it to decide whether the cookie is still good.
  */
  { method: "GET", pattern: "/me" },
  /*
    Every trip on the number, including ones booked on another phone. The one
    call that was already sending a Bearer token from the browser, which is
    what this change exists to stop.
  */
  { method: "GET", pattern: "/me/bookings" },
  /*
    Signed-in checkout (yuvoy-app#32). The one entry here that is NOT
    session-only: a guest books through the same endpoint, unauthenticated, and
    that path must not move behind the proxy. `useCreateReservation` chooses
    per call, and the API decides what to do with the session it is or is not
    given: signed in, `contact.whatsapp` is ignored and `contact.name` defaults
    to the profile's.

    Its answer carries a `statusToken`, which the browser is SUPPOSED to
    receive: it is the per-booking credential the device stores so a trip opens
    later with no session at all. That is why `scripts/qa.mjs` check 18a looks
    for `sessionToken` and deliberately not for `statusToken`.
  */
  { method: "POST", pattern: "/reservations" },
  /*
    Trips somebody else booked, and joining one (yuvoy-app#38 items 1, 7, 11).

    Session-ONLY in the contract: `security: [{ travellerSession: [] }]` with no
    `statusToken` alternative, because a guest has no booking link and never
    gets one. So these cannot be called any other way and all four belong here.

    `/invites/{token}/accept` is the one an invite LINK leads to. The token in
    the path names the invitation; the session says who is accepting. Both are
    needed, which is why a signed-out visitor is sent to sign in first rather
    than being able to accept with the link alone.
  */
  { method: "GET", pattern: "/me/invited-trips" },
  { method: "GET", pattern: "/me/invited-trips/{id}" },
  { method: "POST", pattern: "/me/invited-trips/{id}/accept" },
  { method: "POST", pattern: "/me/invited-trips/{id}/decline" },
  { method: "POST", pattern: "/invites/{token}/accept" },
  /*
    Editing the profile, and asking us for help from Account (items 9, 10).

    `PATCH /me` is session-only. `POST /support/requests` takes either
    credential, and this entry is for the Account screen's copy of it: the
    BOOKING page's copy sends the booking's own status token directly, because
    that is the credential it holds and the one that attaches the reference.
  */
  { method: "PATCH", pattern: "/me" },
  { method: "POST", pattern: "/support/requests" },
];

/*
  Deliberately NOT proxied, with the reason, so the next reader does not add
  them for symmetry:

    - `GET /invites/{token}` needs no credential at all. The invite landing
      page shows it to a signed-out visitor, which is the whole point.
    - `GET /me/interest-options` says "No session" in the contract and is
      edge-cacheable. Routing it through this app's server would put a hop and
      a cache miss in front of a list of words.
    - `GET`/`POST`/`DELETE /bookings/invites` are authenticated by the
      BOOKING's status token, which the browser legitimately holds: it is the
      access a guest checkout has and the thing the device store is for. They
      are called directly, the way the review form and the cancel sheet are.
*/

/** `/me/invited-trips/{id}` becomes `^/me/invited-trips/[^/]+$`. */
function toRegExp(pattern: string): RegExp {
  const source = pattern
    .split("/")
    .map((segment) =>
      /^\{[^}]+\}$/.test(segment)
        ? "[^/]+"
        : segment.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
    )
    .join("/");
  return new RegExp(`^${source}$`);
}

const COMPILED = PROXIED_PATHS.map((p) => ({ ...p, re: toRegExp(p.pattern) }));

/**
 * The contract pattern this method and path are allowed under, or `null`.
 *
 * Returns the PATTERN rather than a boolean so a caller can log or branch on
 * which call was made without re-deriving it from a concrete path that
 * contains an id.
 */
export function allowedProxyPath(method: string, path: string): string | null {
  if (!path.startsWith("/")) return null;
  // Refuse anything that could climb, before it reaches a URL constructor.
  if (path.includes("..") || path.includes("//") || path.includes("\\")) {
    return null;
  }
  const match = COMPILED.find((p) => p.method === method && p.re.test(path));
  return match?.pattern ?? null;
}
