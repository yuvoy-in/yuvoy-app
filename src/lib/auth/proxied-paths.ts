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
  method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  /**
   * A contract path. `{id}` matches one segment and nothing containing a
   * slash, so `{id}` can never widen into a traversal.
   */
  pattern: string;
  /**
   * A read the API counts against the caller, so it is held to the same
   * same-origin check as a write: a GET from another `*.yuvoy.in` page
   * carries the Lax cookie and would spend the traveller's allowance.
   */
  counted?: true;
  /**
   * What the proxy says when there is no session cookie, where the issue
   * gives a sentence of its own. Otherwise "Sign in first."
   */
  signedOut?: string;
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
  /*
    Reading them back (yuvoy-api#196): the Help Center's "Your requests" and
    a status check from Account.

    The list is session-ONLY in the contract ("a booking link's status token
    proves one booking, not the number on it, so it cannot list"), so this is
    the only way to call it. One request by reference takes either
    credential, and this entry is for the session's half: the booking page
    checks with its own status token, directly, exactly as it sends.

    `{reference}` matches one segment, like every placeholder here, and a
    reference that is not the number's is the same 404 as one that does not
    exist, so nothing here can be used to probe for somebody else's.
  */
  { method: "GET", pattern: "/support/requests" },
  { method: "GET", pattern: "/support/requests/{reference}" },
  /*
    Saves on the account (yuvoy-api#192). All five are session-only in the
    contract (`security: [{ travellerSession: [] }]`, no status token
    alternative), so this is the only way to call them and every one belongs
    here. `account-saved.ts` is the caller of each.

    `{experienceId}` matches one segment, like every placeholder here, and the
    API answers anything that is not an experience id with a 400.
  */
  { method: "GET", pattern: "/me/saved" },
  { method: "GET", pattern: "/me/saved/ids" },
  { method: "POST", pattern: "/me/saved" },
  { method: "POST", pattern: "/me/saved/adopt" },
  { method: "DELETE", pattern: "/me/saved/{experienceId}" },
  /*
    Redeeming an invite code (yuvoy-api#195). The code screen is its only
    caller, and it is always signed in: the contract's order is "sign in first,
    then redeem", and redeeming never creates a session. The contract also
    takes a booking's status token here, which this app never sends: a code
    admits the NUMBER, and the session is the proof of the number.

    POST only. Nothing else lives under `/me/invite-codes`, and a redeem is
    throttled per number, so the path must not widen into anything that could
    be called in a loop.
  */
  { method: "POST", pattern: "/me/invite-codes/redeem" },
  /*
    The days a traveller is on the island, kept on the account
    (yuvoy-api#257) so a new phone, a cleared browser and the other phone of a
    couple see the same plan. `use-stay.ts` is the caller of both, and only
    while signed in: `GET /me` reads the stay back, so there is no read here.

    The contract also takes a booking's status token on both, which this app
    never sends: the stay belongs to the number, and the session is the proof
    of the number. PUT replaces and DELETE clears, and nothing else lives
    under `/me/stay`.
  */
  { method: "PUT", pattern: "/me/stay" },
  { method: "DELETE", pattern: "/me/stay" },
  /*
    The places a signed-in number may pick (yuvoy-app#179). Proxied because
    the answer depends on the session: a staff number sees places a visitor
    does not. Signed out, `/places` answers instead, from the server with no
    credential.
  */
  { method: "GET", pattern: "/me/places" },
  /*
    Download my data (yuvoy-app#221, R9-T4). A sign-in session only, which is
    the only kind this proxy holds. GET only: nothing else lives under
    `/me/export`. Counted: each file made is one of three a day.
  */
  {
    method: "GET",
    pattern: "/me/export",
    counted: true,
    signedOut: "Sign in to download your data.",
  },
  /*
    A found feed's later pages, signed in (yuvoy-app#179). The session decides
    which places this caller may read: with `explore` at `staff`, only a staff
    number gets an answer. Signed out, the browser calls the API directly.
  */
  { method: "GET", pattern: "/events" },
  /*
    One found item, signed in, for the same reason as the feed: what the
    caller may see depends on who they are (yuvoy-app#179).
  */
  { method: "GET", pattern: "/events/{id}" },
  /*
    Report a problem on a found item (yuvoy-app#179). Signed in, the API
    counts the report against the number, so the day limit follows the
    person rather than the browser. The body is `reason` and `note` only.
  */
  { method: "POST", pattern: "/events/{id}/reports" },
  /*
    One table at /tables/{id}, where every table email links (yuvoy-app#194,
    R8-T1). `getTable` and `reportTable` also take no credential in the
    contract, but this page only ever calls them signed in: the letter's link
    must open nothing for whoever it is forwarded to, and a session is what
    adds the caller's own request, the names and the venue. Withdraw is
    session-only. Asking to join (`POST /tables/{id}/requests`) and the
    traveller's list (`GET /me/tables`) are not here: no screen calls them yet.
  */
  { method: "GET", pattern: "/tables/{id}" },
  { method: "DELETE", pattern: "/tables/{id}/requests/mine" },
  { method: "POST", pattern: "/tables/{id}/reports" },
  /*
    The signed-in plan page (yuvoy-app#193). Session only in the contract,
    and none of the four answers a credential. Planner tools (times, ideas,
    items, costs, the decision, the link) are not built yet and are not here.
  */
  // Re-reading a plan in the browser after Try again; the page's first read
  // is on the server.
  { method: "GET", pattern: "/plans/{id}" },
  // One whole reply: answers, claims and paid marks, complete sets.
  { method: "PUT", pattern: "/plans/{id}/reply" },
  // Leaving a plan. The planner is refused (409 `planner_leaves`).
  { method: "DELETE", pattern: "/plans/{id}/reply" },
  // Reporting the plan or somebody on it, to a person at Yuvoy.
  { method: "POST", pattern: "/plans/{id}/reports" },
  /*
    Share links to something the traveller went on (yuvoy-app#207, R12-T2):
    Your links on Account reads them, and Get my link on a past trip makes
    one or gives back the one already made. Session only in the contract.
  */
  { method: "GET", pattern: "/me/creator-links" },
  { method: "POST", pattern: "/me/creator-links" },
  /*
    People: friends on Yuvoy (yuvoy-app#222, the web half of
    yuvoy-mobile#366). Session only in the contract, every one of them, and
    each answers 404 while the `people` release is closed to the caller.
    The People screen reads and changes the home, the friends list, the
    requests and the friend link; `/add/{code}` looks a link up and asks.
    The lookup takes its code in the body, so the code is never in a logged
    path. `PUT /me/age` is the age step People opens with when the account
    has no birth year yet. `GET /people/{id}` is not here: no screen opens
    one person yet.
  */
  { method: "GET", pattern: "/me/people" },
  { method: "PATCH", pattern: "/me/people" },
  { method: "GET", pattern: "/me/friends" },
  { method: "DELETE", pattern: "/me/friends/{personId}" },
  { method: "POST", pattern: "/me/friend-requests" },
  { method: "POST", pattern: "/me/friend-requests/{requestId}/answer" },
  { method: "DELETE", pattern: "/me/friend-requests/{requestId}" },
  { method: "PUT", pattern: "/me/friend-link" },
  { method: "DELETE", pattern: "/me/friend-link" },
  { method: "POST", pattern: "/friend-links/lookup" },
  /*
    Ask Trigo (yuvoy-app#223, R5-T5). Every Trigo call is session only in the
    contract: the chat belongs to the account, and the team replies to the
    account. `src/lib/trigo/api.ts` and `src/lib/trigo/actions.ts` call them.
    Report and Trigo's memory have no screen yet and are not here.
  */
  // One typed message and its answer, with an Idempotency-Key per message.
  { method: "POST", pattern: "/trigo/turns" },
  // The traveller's chats, newest first, to pick the one to reopen.
  { method: "GET", pattern: "/trigo/conversations" },
  // One chat's messages, newest 50 first, then `after=<seq>` while it polls.
  { method: "GET", pattern: "/trigo/conversations/{id}" },
  // The highest seq on screen, so the chat stops counting as unread.
  { method: "POST", pattern: "/trigo/conversations/{id}/read" },
  // "Ask the team to check" under a reply to a link Trigo did not open: the
  // team's line joins the chat (yuvoy-app#223 (c)).
  { method: "POST", pattern: "/trigo/conversations/{id}/handoff" },
  // Whether the person has accepted the current notice.
  { method: "GET", pattern: "/trigo/consent" },
  // Accepting the notice, with `surface: web`.
  { method: "POST", pattern: "/trigo/consent" },
  // Turn off Trigo, `?surface=web`.
  { method: "DELETE", pattern: "/trigo/consent" },
  // Yes on a card under a reply: a checkout to open, or an alert or draft made.
  { method: "POST", pattern: "/trigo/actions/{id}/confirm" },
  // Not now on a card: Trigo's line "Nothing has been booked or changed."
  { method: "POST", pattern: "/trigo/actions/{id}/decline" },
  /*
    Organiser pages (yuvoy-app#224, the web half of yuvoy-mobile#393): the
    signed-in traveller's own pages, their helpers, their events and the
    numbers. Session only in the contract. The club routes
    (`/organisers/{id}/club`) and claims (`/organisers/{id}/claims`) are not
    built on the web and are not here.
  */
  { method: "GET", pattern: "/me/organisers" },
  { method: "POST", pattern: "/organisers" },
  { method: "GET", pattern: "/organisers/{id}" },
  { method: "PATCH", pattern: "/organisers/{id}" },
  { method: "GET", pattern: "/organisers/{id}/helpers" },
  { method: "POST", pattern: "/organisers/{id}/helpers" },
  { method: "DELETE", pattern: "/organisers/{id}/helpers/{travellerId}" },
  { method: "GET", pattern: "/organisers/{id}/events" },
  { method: "POST", pattern: "/organisers/{id}/events" },
  { method: "PATCH", pattern: "/organisers/{id}/events/{eventPostId}" },
  { method: "POST", pattern: "/organisers/{id}/events/{eventPostId}/cancel" },
  { method: "GET", pattern: "/organisers/{id}/events/{eventPostId}/numbers" },
  // Check people in at the door (yuvoy-app#226, the web half of yuvoy-mobile#394).
  { method: "POST", pattern: "/organiser-check-ins" },
  /*
    The year a person was born, asked by Trigo's age check, by People's age
    step and before the organiser pages (`403 adult_confirmation_required`)
    for an account made before the year was asked. Listed once for all
    three. Session only: a booking link cannot answer for a person's age.
  */
  { method: "PUT", pattern: "/me/age" },
  /*
    Crews (yuvoy-app#227, the web half of yuvoy-mobile#387): a traveller's
    own named lists of their friends. Session only, and 404 while `people` is
    closed, like the rest of People. There is no single-crew read: a crew's
    page reads the list. Asking a crew along to a plan is listed below, with
    following a group (yuvoy-mobile#392).
  */
  { method: "GET", pattern: "/me/crews" },
  { method: "POST", pattern: "/me/crews" },
  { method: "PATCH", pattern: "/me/crews/{crewId}" },
  { method: "DELETE", pattern: "/me/crews/{crewId}" },
  /*
    Me on Account (yuvoy-mobile#444, R10-M1), behind the `me` release; every
    one answers 404 while it is closed. Session only in the contract.
  */
  // The life list, a page at a time, with Did you go? on the first page.
  { method: "GET", pattern: "/me/life-list" },
  // Who sees a trip or a table entry. A went entry is changed by its event.
  { method: "PATCH", pattern: "/me/life-list/{entryId}" },
  // Did you go?, answered from Me.
  { method: "POST", pattern: "/me/went/{eventId}" },
  // Who sees a went entry: the one route that writes it.
  { method: "PATCH", pattern: "/me/went/{eventId}" },
  { method: "GET", pattern: "/me/badges" },
  // "Nice" on a new badge.
  { method: "POST", pattern: "/me/badges/seen" },
  /*
    Languages and Women-only tables. The same route holds the usage choice
    and the email switches, and Me sends only the field that changed.
  */
  { method: "GET", pattern: "/me/settings" },
  { method: "PATCH", pattern: "/me/settings" },
  /*
    Following a group and asking a crew along to a plan (yuvoy-mobile#392,
    R10-T2). Follows are private and need the `people` release; the crew
    invite needs `people` and `plans`. The plans list is the invite's picker:
    the traveller's own plans, read for the ones they made. Session only in
    the contract.
  */
  { method: "GET", pattern: "/me/club-follows" },
  { method: "PUT", pattern: "/me/club-follows/{clubId}" },
  { method: "DELETE", pattern: "/me/club-follows/{clubId}" },
  { method: "POST", pattern: "/plans/{planId}/crew-invites" },
  { method: "GET", pattern: "/me/plans" },
  /*
    The groups directory (yuvoy-mobile#386). Signed in, the directory and a
    group's page read the `/me/` pair, which shows staff the groups of a
    release still open to staff only. Claim and report are session only. A
    removal takes the session when there is one and works without it. The
    public pair (`GET /clubs`, `GET /clubs/{slug}`) needs no credential, so
    it is not here: the browser calls the API for it.
  */
  { method: "GET", pattern: "/me/clubs" },
  { method: "GET", pattern: "/me/clubs/{slug}" },
  { method: "POST", pattern: "/clubs/{clubId}/claims" },
  { method: "POST", pattern: "/clubs/{clubId}/removal-requests" },
  { method: "POST", pattern: "/clubs/{clubId}/reports" },
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
 * The upstream path for the proxy's URL segments, or `null` for one that
 * must not be forwarded.
 *
 * Each segment is encoded again before it joins the path. Next decodes the
 * URL once, so `%252e%252e` arrives here as `%2e%2e`: no literal `..` for
 * `allowedProxyPath` to refuse, one `[^/]+` for a placeholder to accept, and,
 * to the URL parser that builds the upstream call, a dot segment. It resolved
 * `/me/saved/%2e%2e` to `/me/` (production readiness, 6 Oct 2026). Encoded,
 * it is `%252e%252e`: a name the API does not have.
 *
 * A segment that is itself `.` or `..` cannot be made safe that way, because
 * dots are not escaped, so it is refused.
 */
export function proxyPathOf(segments: readonly string[]): string | null {
  if (segments.some((s) => s === "." || s === "..")) return null;
  return `/${segments.map(encodeURIComponent).join("/")}`;
}

/**
 * The contract pattern this method and path are allowed under, or `null`.
 *
 * Returns the PATTERN rather than a boolean so a caller can log or branch on
 * which call was made without re-deriving it from a concrete path that
 * contains an id.
 */
export function allowedProxyPath(method: string, path: string): string | null {
  return proxiedRule(method, path)?.pattern ?? null;
}

/** The whole entry this method and path are allowed under, or `null`. */
export function proxiedRule(method: string, path: string): ProxiedPath | null {
  if (!path.startsWith("/")) return null;
  // Refuse anything that could climb, before it reaches a URL constructor.
  if (path.includes("..") || path.includes("//") || path.includes("\\")) {
    return null;
  }
  const match = COMPILED.find((p) => p.method === method && p.re.test(path));
  if (!match) return null;
  const { method: m, pattern, counted, signedOut } = match;
  return { method: m, pattern, counted, signedOut };
}
