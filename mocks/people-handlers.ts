import { http, HttpResponse } from "msw";
import { mockHeaders, mockNow } from "./fixtures";
import { friendOf } from "./people-fixtures";
import {
  forgetPeople,
  homeOf,
  linkFor,
  look,
  needsNameOf,
  newCode,
  nextRequestId,
  peopleOpen,
  stateOf,
  unfriend,
  type PeopleState,
} from "./people-state";

/**
 * People (yuvoy-app#222, the web half of yuvoy-mobile#366): the eleven
 * People routes the proxy forwards, behind the `people` release.
 *
 * With no scenario `people` is `off`, as in production, and every People
 * route answers `404`. Each scenario below opens it at `staff` with the
 * caller in the staff cohort, except where it says otherwise:
 *
 *   - `people`: everything set. Age confirmed, a first name, sharing
 *     `friends`, request emails on; two requests in (Priya S. with 3 mutual
 *     friends, Arjun N. with none), one out (Meera J.), 23 friends (20 a
 *     page, so a second page of 3), a live link (`ASHAM-LNK22`, 17 requests
 *     left). `GET /me` says 2 requests waiting. Every change is kept for the
 *     session: Accept makes a friend, Decline and Take back remove the
 *     request, Unfriend removes the friend (and takes them out of the
 *     traveller's crews, as the API does), a new link has a new code and
 *     the old one stops working, Switch off leaves no link, and the sharing
 *     choice and the email switch stay as saved. Asking is always `202`.
 *     Answering a request that is not waiting is `404`.
 *   - `people-all`: `people` with the release at `all` and no cohort.
 *   - `people-first`: no age answer, no first name (`GET /me` name null),
 *     sharing null, no requests, friends or link, 2 upcoming goings only me.
 *     The age step, then the name step (`PATCH /me` with a first name), then
 *     the first sharing choice. A birth year under 18 is
 *     `403 under_age_sign_up`; the year that turns 18 this year needs
 *     `birthdayPassed` (`400` without it, under 18 with false).
 *   - `people-paused`: `people` with standing `requests_paused` for a week:
 *     asking is `403 people_paused`; answering and the link still work, as
 *     the API refuses only new requests under that standing.
 *   - `people-age-locked`: no age answer, and the age step is
 *     `409 age_locked`.
 *   - `people-down`: every People route is `500`. `GET /me` still has
 *     `people`, so the row shows and the screen fails.
 *   - `people-outside`: `people` at `staff` and the caller is not staff, so
 *     every People route is `404` and `GET /me` has no `people`.
 *
 * Crews and the `people-crews-*` scenarios are in `crew-handlers.ts`
 * (yuvoy-app#227), which uses the refusals below.
 *
 * The fixed friend link codes (any case, hyphen optional), looked up and
 * then asked with Send request:
 *
 *   RAVIK-NONE2  ok, `none` (Ravi K.); asking makes a request out.
 *   MEERA-SENT2  ok, `requested` (Meera J.).
 *   PRIYA-ASKS2  ok, `request_in` (Priya S.); asking makes you friends.
 *   KIRAN-FRND2  ok, `friends` (Kiran).
 *   ASHAM-LNK22  ok, `self`: the traveller's own link, until a new one.
 *   DEVPX-EXPD2  `expired`; asking is `410 friend_link_expired`.
 *   DEVPX-FULL2  `full`; asking is `409 friend_link_full`.
 *   GONEX-NOPE2  `unavailable`, as is any other code; asking is `202`.
 *
 * The relation is read from the session's lists when asked, so it follows
 * what was done: after Unfriend, KIRAN-FRND2 is `none`. Under the other
 * scenarios the same codes answer against that scenario's lists.
 *
 * State is kept per scenario and session (the `Authorization` header), so
 * two e2e projects signed in as different numbers never see each other's.
 */

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8099/v1";
export const url = (p: string) => `${BASE}${p}`;

let seq = 0;
export const rid = () =>
  `01J${(++seq).toString(36).toUpperCase().padStart(6, "0")}MOCK`;

export function envelope(
  code: string,
  message: string,
  status: number,
  details?: Record<string, unknown>,
) {
  return HttpResponse.json(
    { error: { code, message, details, requestId: rid() } },
    { status, headers: mockHeaders(rid()) },
  );
}

export const json = (
  body: Parameters<typeof HttpResponse.json>[0],
  status = 200,
) =>
  HttpResponse.json(body, {
    status,
    headers: { ...mockHeaders(rid()), "cache-control": "no-store" },
  });

function scenarioOf(request: Request): string {
  return (
    request.headers.get("x-yuvoy-scenario") ??
    new URL(request.url).searchParams.get("__scenario") ??
    "ok"
  );
}

/* -------------------------------------------------------------- refusals */

export type Gate = { s: PeopleState; scenario: string } | Response;

/**
 * What every People route checks first, in the API's order: a session, a
 * full sign-in, the release, then (here only) the outage.
 */
export function gate(request: Request): Gate {
  const auth = request.headers.get("authorization");
  if (!auth) {
    return envelope("unauthorized", "Sign in to see People.", 401);
  }
  // A recovery link, not a session (the verify handler mints `sess_`).
  if (!auth.includes("Bearer sess_")) {
    return envelope("unauthorized", "Sign in to see People.", 401);
  }
  const scenario = scenarioOf(request);
  if (!peopleOpen(scenario)) {
    return envelope("not_found", "Not found.", 404);
  }
  if (scenario === "people-down") {
    return envelope("internal_error", "Something went wrong at our end.", 500);
  }
  return { s: stateOf(auth, scenario), scenario };
}

const ADULTS_ONLY = () =>
  envelope(
    "adult_confirmation_required",
    "Tell us the year you were born before you use People.",
    403,
  );
const NAME_REQUIRED = () =>
  envelope(
    "name_required",
    "Add your first name so friends know who you are.",
    409,
  );

/** The adult and first-name checks every yes needs. */
export function adultWithName(s: PeopleState): Response | null {
  if (!s.ageConfirmed) return ADULTS_ONLY();
  if (needsNameOf(s.name)) return NAME_REQUIRED();
  return null;
}

export function paused(s: PeopleState, message: string): Response {
  return envelope("people_paused", message, 403, {
    standing: s.standing,
    until: s.standingUntil,
  });
}

export async function bodyOf(
  request: Request,
): Promise<Record<string, unknown>> {
  try {
    const body = (await request.json()) as unknown;
    return body && typeof body === "object"
      ? (body as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

/* ---------------------------------------------------------------- routes */

export const peopleHandlers = [
  http.get(url("/me/people"), ({ request }) => {
    const g = gate(request);
    if (g instanceof Response) return g;
    return json(homeOf(g.s));
  }),

  http.patch(url("/me/people"), async ({ request }) => {
    const g = gate(request);
    if (g instanceof Response) return g;
    const { s } = g;
    const body = await bodyOf(request);
    const { sharing, shareUpcomingGoing, requestEmails } = body;
    if (
      (sharing !== undefined &&
        sharing !== "friends" &&
        sharing !== "only_me") ||
      (shareUpcomingGoing !== undefined &&
        typeof shareUpcomingGoing !== "boolean") ||
      (requestEmails !== undefined && typeof requestEmails !== "boolean")
    ) {
      return envelope("invalid_input", "That choice is not one we have.", 400);
    }
    if (sharing !== undefined) {
      const no = adultWithName(s);
      if (no) return no;
      s.sharing = sharing as "friends" | "only_me";
    }
    if (shareUpcomingGoing === true && s.sharing === "friends") {
      s.privateUpcomingGoing = 0;
    }
    if (typeof requestEmails === "boolean") s.requestEmails = requestEmails;
    return json(homeOf(s));
  }),

  http.get(url("/me/friends"), ({ request }) => {
    const g = gate(request);
    if (g instanceof Response) return g;
    const q = new URL(request.url).searchParams;
    const limit = Number(q.get("limit") ?? 20);
    const cursor = q.get("cursor");
    const from = cursor === null ? 0 : Number(cursor.replace(/^f/, ""));
    if (
      !Number.isInteger(limit) ||
      limit < 1 ||
      limit > 50 ||
      (cursor !== null && (!/^f\d+$/.test(cursor) || !Number.isInteger(from)))
    ) {
      return envelope("invalid_input", "That page does not exist.", 400);
    }
    const friends = g.s.friends.slice(from, from + limit);
    const next = from + limit < g.s.friends.length ? `f${from + limit}` : null;
    return json({ friends, nextCursor: next });
  }),

  // Nobody is told, and 204 also when the two were not friends. The person
  // also leaves every one of the caller's crews, in the same step as the API.
  http.delete(url("/me/friends/:personId"), ({ request, params }) => {
    const g = gate(request);
    if (g instanceof Response) return g;
    unfriend(g.s, String(params.personId));
    return new HttpResponse(null, { status: 204, headers: mockHeaders(rid()) });
  }),

  http.post(url("/me/friend-requests"), async ({ request }) => {
    const g = gate(request);
    if (g instanceof Response) return g;
    const { s } = g;
    if (s.standing !== "ok") {
      return paused(s, "You can't ask anyone to be your friend for now.");
    }
    const no = adultWithName(s);
    if (no) return no;
    const body = await bodyOf(request);
    if (body.via === "plan" || body.via === "table") {
      return envelope("not_found", "Not found.", 404);
    }
    if (body.via !== "friend_link" || typeof body.code !== "string") {
      return envelope(
        "invalid_input",
        "Send via friend_link with the link's code.",
        400,
      );
    }
    const found = look(s, body.code);
    if (found.state === "expired") {
      return envelope(
        "friend_link_expired",
        "This link has expired. Ask them for a new one.",
        410,
      );
    }
    if (found.state === "full") {
      return envelope(
        "friend_link_full",
        "This link has had all the requests it can take. Ask them for a new one.",
        409,
      );
    }
    // A code nobody holds, or the traveller's own: nothing is sent.
    if (found.state !== "ok" || found.relation === "self") {
      return json({ state: "requested" }, 202);
    }
    const { owner, relation } = found;
    if (relation === "request_in") {
      s.requestsIn = s.requestsIn.filter(
        (r) => r.person.personId !== owner.personId,
      );
      s.friends.unshift(friendOf(owner, new Date(mockNow()).toISOString()));
      return json({ state: "friends", person: owner }, 202);
    }
    if (relation === "friends") {
      return json({ state: "friends", person: owner }, 202);
    }
    if (relation === "none") {
      s.requestsOut.unshift({
        requestId: nextRequestId(),
        direction: "outgoing",
        person: owner,
        source: "friend_link",
        requestedAt: new Date(mockNow()).toISOString(),
      });
    }
    return json({ state: "requested", person: owner }, 202);
  }),

  http.post(
    url("/me/friend-requests/:requestId/answer"),
    async ({ request, params }) => {
      const g = gate(request);
      if (g instanceof Response) return g;
      const { s } = g;
      // As the API: `requests_paused` stops only asking, not answering.
      if (s.standing === "restricted" || s.standing === "removed") {
        return paused(s, "Your use of People is paused for now.");
      }
      const { answer } = await bodyOf(request);
      if (answer !== "accept" && answer !== "decline") {
        return envelope("invalid_input", "Answer accept or decline.", 400);
      }
      const waiting = s.requestsIn.find(
        (r) => r.requestId === params.requestId,
      );
      if (!waiting) {
        return envelope("not_found", "That request is no longer waiting.", 404);
      }
      if (answer === "accept") {
        const no = adultWithName(s);
        if (no) return no;
      }
      s.requestsIn = s.requestsIn.filter((r) => r !== waiting);
      if (answer === "decline") return json({ state: "declined" });
      const friend = friendOf(
        waiting.person,
        new Date(mockNow()).toISOString(),
      );
      s.friends.unshift(friend);
      return json({ state: "friends", friend });
    },
  ),

  // Nobody is told, and 204 also when there was nothing to take back.
  http.delete(url("/me/friend-requests/:requestId"), ({ request, params }) => {
    const g = gate(request);
    if (g instanceof Response) return g;
    g.s.requestsOut = g.s.requestsOut.filter(
      (r) => r.requestId !== params.requestId,
    );
    return new HttpResponse(null, { status: 204, headers: mockHeaders(rid()) });
  }),

  http.put(url("/me/friend-link"), async ({ request }) => {
    const g = gate(request);
    if (g instanceof Response) return g;
    const { s } = g;
    if (s.standing === "restricted" || s.standing === "removed") {
      return paused(s, "Your use of People is paused for now.");
    }
    const no = adultWithName(s);
    if (no) return no;
    const { rotate } = await bodyOf(request);
    if (rotate !== undefined && typeof rotate !== "boolean") {
      return envelope("invalid_input", "rotate is true or false.", 400);
    }
    if (rotate || !s.friendLink) {
      s.links += 1;
      const key = `${request.headers.get("authorization")}|${s.links}`;
      s.friendLink = linkFor(newCode(key), 20, 30);
    }
    return json(s.friendLink);
  }),

  http.delete(url("/me/friend-link"), ({ request }) => {
    const g = gate(request);
    if (g instanceof Response) return g;
    g.s.friendLink = null;
    return new HttpResponse(null, { status: 204, headers: mockHeaders(rid()) });
  }),

  http.post(url("/friend-links/lookup"), async ({ request }) => {
    const g = gate(request);
    if (g instanceof Response) return g;
    const { code } = await bodyOf(request);
    if (typeof code !== "string" || !/^[A-Za-z0-9-]{1,16}$/.test(code)) {
      return envelope("invalid_input", "Send the link's code.", 400);
    }
    return json(look(g.s, code));
  }),

  http.put(url("/me/age"), async ({ request }) => {
    const g = gate(request);
    if (g instanceof Response) return g;
    const { s, scenario } = g;
    if (scenario === "people-age-locked") {
      return envelope(
        "age_locked",
        "Your age can only be changed by the Yuvoy team. Write to us from Help.",
        409,
      );
    }
    // The first adult answer is kept; later calls change nothing.
    if (s.ageConfirmed) return json({ ageConfirmed: true });
    const { birthYear, birthdayPassed } = await bodyOf(request);
    // The year in India, where the API counts 18. The real clock, as the
    // browser's needsBirthday uses it; the fixed mock clock stays in 2026.
    const year = new Date(Date.now() + 5.5 * 3_600_000).getUTCFullYear();
    if (
      typeof birthYear !== "number" ||
      !Number.isInteger(birthYear) ||
      birthYear < 1900 ||
      birthYear > year
    ) {
      return envelope("invalid_input", "That year does not look right.", 400, {
        birthYear: "A year like 1995.",
      });
    }
    if (birthYear === year - 18 && typeof birthdayPassed !== "boolean") {
      return envelope(
        "invalid_input",
        "Tell us whether your birthday has passed this year.",
        400,
        { birthdayPassed: "Needed for this year." },
      );
    }
    if (
      birthYear > year - 18 ||
      (birthYear === year - 18 && birthdayPassed === false)
    ) {
      // Nothing is stored and the account is closed, so the next start is new.
      forgetPeople(request.headers.get("authorization")!, scenario);
      return envelope(
        "under_age_sign_up",
        "Yuvoy is for people 18 and over, so we have closed your account. We have sent you an email about it.",
        403,
      );
    }
    s.ageConfirmed = true;
    return json({ ageConfirmed: true });
  }),
];

export { __resetPeopleMocks } from "./people-state";
