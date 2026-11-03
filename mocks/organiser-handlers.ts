import { http, HttpResponse } from "msw";
import type { components } from "../src/lib/api/schema.gen";
import { mockHeaders, mockNow } from "./fixtures";
import {
  KNOWN_HELPER_EMAILS,
  liveNumbers,
  zeroNumbers,
} from "./organiser-fixtures";
import { clubCreate, clubKept } from "./organiser-club";
import {
  eventFrom,
  eventProblems,
  pageFrom,
  pageProblems,
  text,
} from "./organiser-fields";
import {
  adults,
  nextId,
  scenarioOf,
  storeOf,
  type Store,
} from "./organiser-store";
import { PEOPLE_SCENARIOS } from "./people-state";

export {
  __resetOrganiserMocks,
  organiserAgeConfirmed,
  organiserSupplyOf,
} from "./organiser-store";

/**
 * Organiser pages (yuvoy-app#224, the web half of yuvoy-mobile#393): the
 * caller's own organisers, their helpers, their events and the numbers, and
 * `PUT /me/age`, the 18+ answer every organiser route needs.
 *
 * With no scenario the caller is an adult, `supply` is open and
 * `GET /me/organisers` holds `MY_ORGANISERS`: one in each state, and one the
 * caller helps on. Writes are kept per scenario and session (the
 * `Authorization` header), so two e2e projects never see each other's.
 *
 *   - `organisers-empty`: no organisers yet; setting one up works.
 *   - `organisers-paused`: every write but cancelling an event is
 *     `503 organisers_paused`. Reads answer.
 *   - `organisers-age`: every organiser route is
 *     `403 adult_confirmation_required`, and `GET /me` says
 *     `ageConfirmed: false`, until `PUT /me/age` takes an adult answer for
 *     the session.
 *   - `organisers-closed-release`: `supply` is `off` and every organiser
 *     route is `404`, as the API answers outside the release.
 *   - `organisers-club`, `organisers-club-paused`: the caller holds groups
 *     (yuvoy-app#225); `organiser-club.ts` says what each does.
 *
 * Claims routes and the door check-in are not mocked.
 */

type Organiser = components["schemas"]["Organiser"];
type OrganiserEvent = components["schemas"]["OrganiserEvent"];

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8099/v1";
const url = (p: string) => `${BASE}${p}`;

let seq = 0;
const rid = () =>
  `01J${(++seq).toString(36).toUpperCase().padStart(6, "0")}ORGS`;

function envelope(
  code: string,
  message: string,
  status: number,
  details?: Record<string, unknown>,
) {
  return HttpResponse.json(
    {
      error: {
        code,
        message,
        requestId: rid(),
        ...(details ? { details } : {}),
      },
    },
    { status, headers: mockHeaders(rid()) },
  );
}

function answer(body: unknown, status = 200) {
  return HttpResponse.json(body as Record<string, unknown>, {
    status,
    headers: { ...mockHeaders(rid()), "cache-control": "no-store" },
  });
}

const PAUSED = "Organiser pages are paused for a moment. Try again soon.";
const NO_ORGANISER = "We could not find that organiser.";
const NO_EVENT = "We could not find that event.";

/** The refusals every organiser route shares, in the order the API checks them. */
function refused(request: Request): Response | null {
  const auth = request.headers.get("authorization");
  if (!auth?.includes("Bearer sess_")) {
    return envelope("unauthorized", "Sign in to run your organiser page.", 401);
  }
  const scenario = scenarioOf(request);
  if (scenario === "organisers-closed-release") {
    // The API's own sentence outside the release (`organiserNotFound`).
    return envelope("not_found", NO_ORGANISER, 404);
  }
  if (scenario === "organisers-age" && !adults.has(auth)) {
    return envelope(
      "adult_confirmation_required",
      "Organiser pages are for people 18 and over. Confirm your age first.",
      403,
    );
  }
  return null;
}

/** A write while paused: everything but cancelling an event. */
function paused(request: Request): Response | null {
  return scenarioOf(request) === "organisers-paused"
    ? envelope("organisers_paused", PAUSED, 503)
    : null;
}

async function bodyOf(request: Request): Promise<Record<string, unknown>> {
  try {
    const body = (await request.json()) as unknown;
    return typeof body === "object" && body !== null
      ? (body as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

/** The organiser by id, or the 404 the API gives for one the caller is not in. */
function organiserOf(
  store: Store,
  id: string,
): { org: Organiser } | { no: Response } {
  const org = store.organisers.find((o) => o.id === id);
  return org ? { org } : { no: envelope("not_found", NO_ORGANISER, 404) };
}

function notOwner(org: Organiser): Response | null {
  return org.role === "owner"
    ? null
    : envelope(
        "not_owner",
        "Only the owner of this organiser page can do that.",
        403,
      );
}

/** 409 `conflict` with the organiser's state, for a suspended or closed one. */
function shut(org: Organiser): Response | null {
  return org.state === "suspended" || org.state === "closed"
    ? envelope("conflict", "This organiser page cannot do that now.", 409, {
        state: org.state,
      })
    : null;
}

function checkFields(problems: Record<string, string>): Response | null {
  return Object.keys(problems).length
    ? envelope(
        "invalid_input",
        "Check the fields marked and try again.",
        400,
        problems,
      )
    : null;
}

export const organiserHandlers = [
  http.put(url("/me/age"), async ({ request }) => {
    // People's scenarios keep their own answer (people-handlers.ts).
    if (PEOPLE_SCENARIOS.has(scenarioOf(request))) return undefined;
    const auth = request.headers.get("authorization");
    if (!auth?.includes("Bearer sess_")) {
      return envelope("unauthorized", "Sign in to add your birth year.", 401);
    }
    const body = await bodyOf(request);
    const year = body.birthYear;
    // India's year, as the API judges it.
    const thisYear = new Date(mockNow() + 330 * 60_000).getUTCFullYear();
    if (typeof year !== "number" || year < 1900 || year > thisYear) {
      return envelope("invalid_input", "Check the year and try again.", 400, {
        birthYear: `Give the year you were born, from 1900 to ${thisYear}.`,
      });
    }
    const age = thisYear - year;
    if (age === 18 && typeof body.birthdayPassed !== "boolean") {
      return envelope("invalid_input", "Check the year and try again.", 400, {
        birthdayPassed: "Tell us whether you have had your birthday this year.",
      });
    }
    if (age < 18 || (age === 18 && body.birthdayPassed === false)) {
      return envelope(
        "under_age_sign_up",
        "Yuvoy accounts are for people 18 and over, so we have closed this one. If you think this is wrong, contact us.",
        403,
      );
    }
    adults.add(auth);
    return answer({ ageConfirmed: true });
  }),

  http.get(url("/me/organisers"), ({ request }) => {
    const no = refused(request);
    if (no) return no;
    const store = storeOf(request);
    return answer({ items: store.organisers, clubsToLink: store.clubsToLink });
  }),

  http.post(url("/organisers"), async ({ request }) => {
    const no = refused(request) ?? paused(request);
    if (no) return no;
    const body = await bodyOf(request);
    if ("clubId" in body) {
      const club = clubCreate(storeOf(request), scenarioOf(request), body);
      if ("made" in club) return answer(club.made, 201);
      return envelope(club.code, club.message, club.status, club.details);
    }
    const bad = checkFields(pageProblems(body));
    if (bad) return bad;
    const page = pageFrom(body);
    const org: Organiser = {
      ...page,
      id: nextId(),
      slug: page.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, ""),
      state: "pending",
      verificationCode: "YUVOY-H8NP2D",
      selfPublish: false,
      role: "owner",
      clubId: null,
    };
    storeOf(request).organisers.unshift(org);
    return answer(org, 201);
  }),

  http.get(url("/organisers/:id"), ({ request, params }) => {
    const no = refused(request);
    if (no) return no;
    const found = organiserOf(storeOf(request), String(params.id));
    return "no" in found ? found.no : answer(found.org);
  }),

  http.patch(url("/organisers/:id"), async ({ request, params }) => {
    const no = refused(request) ?? paused(request);
    if (no) return no;
    const store = storeOf(request);
    const found = organiserOf(store, String(params.id));
    if ("no" in found) return found.no;
    const { org } = found;
    const stop =
      notOwner(org) ??
      (org.state === "closed"
        ? envelope("conflict", "This organiser page is closed.", 409, {
            state: org.state,
          })
        : null);
    if (stop) return stop;
    const body = await bodyOf(request);
    const kept = clubKept(org, body);
    if (kept)
      return envelope(kept.code, kept.message, kept.status, kept.details);
    const bad = checkFields(pageProblems(body));
    if (bad) return bad;
    const page = pageFrom(body);
    const next: Organiser = {
      ...org,
      ...page,
      about: page.about,
      contactEmail: page.contactEmail,
    };
    store.organisers = store.organisers.map((o) =>
      o.id === org.id ? next : o,
    );
    return answer(next);
  }),

  http.get(url("/organisers/:id/helpers"), ({ request, params }) => {
    const no = refused(request);
    if (no) return no;
    const store = storeOf(request);
    const found = organiserOf(store, String(params.id));
    if ("no" in found) return found.no;
    const rows = store.helpers.get(found.org.id) ?? [];
    const items =
      found.org.role === "owner"
        ? rows
        : rows.map(({ firstName }) => ({ firstName }));
    return answer({ items });
  }),

  http.post(url("/organisers/:id/helpers"), async ({ request, params }) => {
    const no = refused(request) ?? paused(request);
    if (no) return no;
    const store = storeOf(request);
    const found = organiserOf(store, String(params.id));
    if ("no" in found) return found.no;
    const { org } = found;
    const stop = notOwner(org);
    if (stop) return stop;
    if (org.state !== "verified") {
      return envelope(
        "conflict",
        "Helpers can be added once Yuvoy has checked this page.",
        409,
        { state: org.state },
      );
    }
    const email = text((await bodyOf(request)).email).toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      return envelope("invalid_input", "Give an email address.", 400, {
        email: "Give an email address.",
      });
    }
    const person = KNOWN_HELPER_EMAILS[email];
    if (!person) {
      const sentence =
        "Nobody has signed in to Yuvoy with that email yet. Ask them to sign in once with it first.";
      return envelope("no_account_with_that_email", sentence, 400, {
        email: sentence,
      });
    }
    const rows = store.helpers.get(org.id) ?? [];
    // Somebody already a member is answered as they are.
    if (!rows.some((r) => r.travellerId === person.travellerId)) {
      store.helpers.set(org.id, [...rows, { ...person }]);
    }
    return answer({ ...person }, 201);
  }),

  http.delete(
    url("/organisers/:id/helpers/:travellerId"),
    ({ request, params }) => {
      const no = refused(request) ?? paused(request);
      if (no) return no;
      const store = storeOf(request);
      const found = organiserOf(store, String(params.id));
      if ("no" in found) return found.no;
      const stop = notOwner(found.org);
      if (stop) return stop;
      const rows = store.helpers.get(found.org.id) ?? [];
      const id = String(params.travellerId);
      if (!rows.some((r) => r.travellerId === id)) {
        return envelope("not_found", "That person is not a helper here.", 404);
      }
      store.helpers.set(
        found.org.id,
        rows.filter((r) => r.travellerId !== id),
      );
      return new HttpResponse(null, {
        status: 204,
        headers: mockHeaders(rid()),
      });
    },
  ),

  http.get(url("/organisers/:id/events"), ({ request, params }) => {
    const no = refused(request);
    if (no) return no;
    const store = storeOf(request);
    const found = organiserOf(store, String(params.id));
    if ("no" in found) return found.no;
    return answer({ items: store.events.get(found.org.id) ?? [] });
  }),

  http.post(url("/organisers/:id/events"), async ({ request, params }) => {
    const no = refused(request) ?? paused(request);
    if (no) return no;
    const store = storeOf(request);
    const found = organiserOf(store, String(params.id));
    if ("no" in found) return found.no;
    const { org } = found;
    const stop = shut(org);
    if (stop) return stop;
    const body = await bodyOf(request);
    const bad = checkFields(eventProblems(body));
    if (bad) return bad;
    const event: OrganiserEvent = {
      ...eventFrom(body),
      id: nextId(),
      state: org.selfPublish ? "live" : "in_checking",
    };
    store.events.set(org.id, [event, ...(store.events.get(org.id) ?? [])]);
    return answer(event, 201);
  }),

  http.patch(
    url("/organisers/:id/events/:eventPostId"),
    async ({ request, params }) => {
      const no = refused(request) ?? paused(request);
      if (no) return no;
      const store = storeOf(request);
      const found = organiserOf(store, String(params.id));
      if ("no" in found) return found.no;
      const { org } = found;
      const events = store.events.get(org.id) ?? [];
      const event = events.find((e) => e.id === String(params.eventPostId));
      if (!event) return envelope("not_found", NO_EVENT, 404);
      if (event.state === "ended") {
        return envelope(
          "event_has_ended",
          "This event has ended, so it cannot be changed.",
          409,
        );
      }
      if (event.state === "cancelled" || event.state === "not_accepted") {
        return envelope("conflict", "This event cannot be changed.", 409, {
          state: event.state,
        });
      }
      const stop = shut(org);
      if (stop) return stop;
      const body = await bodyOf(request);
      const bad = checkFields(eventProblems(body));
      if (bad) return bad;
      const next: OrganiserEvent = {
        id: event.id,
        ...(event.eventId ? { eventId: event.eventId } : {}),
        ...(event.lastCheckedAt ? { lastCheckedAt: event.lastCheckedAt } : {}),
        ...(event.picture ? { picture: event.picture } : {}),
        ...eventFrom(body),
        state:
          event.state === "live" && !org.selfPublish
            ? "changes_in_checking"
            : event.state,
      };
      store.events.set(
        org.id,
        events.map((e) => (e.id === event.id ? next : e)),
      );
      return answer(next);
    },
  ),

  // Works while organiser pages are paused.
  http.post(
    url("/organisers/:id/events/:eventPostId/cancel"),
    ({ request, params }) => {
      const no = refused(request);
      if (no) return no;
      const store = storeOf(request);
      const found = organiserOf(store, String(params.id));
      if ("no" in found) return found.no;
      const events = store.events.get(found.org.id) ?? [];
      const event = events.find((e) => e.id === String(params.eventPostId));
      if (!event) return envelope("not_found", NO_EVENT, 404);
      if (event.state === "ended") {
        return envelope(
          "event_has_ended",
          "This event has ended, so it cannot be cancelled.",
          409,
        );
      }
      if (event.state === "not_accepted") {
        return envelope("conflict", "This event was not accepted.", 409, {
          state: event.state,
        });
      }
      // Cancelling again answers the event as it is.
      const next: OrganiserEvent = { ...event, state: "cancelled" };
      store.events.set(
        found.org.id,
        events.map((e) => (e.id === event.id ? next : e)),
      );
      return answer(next);
    },
  ),

  http.get(
    url("/organisers/:id/events/:eventPostId/numbers"),
    ({ request, params }) => {
      const no = refused(request);
      if (no) return no;
      const store = storeOf(request);
      const found = organiserOf(store, String(params.id));
      if ("no" in found) return found.no;
      const events = store.events.get(found.org.id) ?? [];
      const event = events.find((e) => e.id === String(params.eventPostId));
      if (!event) return envelope("not_found", NO_EVENT, 404);
      const on = new URL(request.url).searchParams.get("on");
      if (on !== null && !/^\d{4}-\d{2}-\d{2}$/.test(on)) {
        return envelope("invalid_input", "Check the date and try again.", 400, {
          on: "Give a date as YYYY-MM-DD.",
        });
      }
      return answer(
        event.state === "live" || event.state === "changes_in_checking"
          ? liveNumbers(on)
          : zeroNumbers(event),
      );
    },
  ),
];
