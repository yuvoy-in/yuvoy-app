import { http, HttpResponse } from "msw";
import type { components } from "../src/lib/api/schema.gen";
import { mockHeaders, mockNow } from "./fixtures";
import {
  CREW_LIMIT,
  CREW_MEMBER_LIMIT,
  crewId,
  memberOf,
} from "./crew-fixtures";
import {
  adultWithName,
  bodyOf,
  envelope,
  gate,
  json,
  paused,
  rid,
  url,
} from "./people-handlers";
import type { PeopleState } from "./people-state";

/**
 * Crews (yuvoy-app#227, the web half of yuvoy-mobile#387): a traveller's
 * own named lists of their friends, the four `/me/crews` routes, behind the
 * `people` release like the rest of People (`people-handlers.ts`).
 *
 * Crews are kept in the People session state, so they follow the same
 * scenario and session as the friends list and are forgotten with it (an
 * under-18 answer, or `__resetPeopleMocks`). What each scenario starts with
 * (the names and ids are in `crew-fixtures.ts`):
 *
 *   - `people`, `people-all`, `people-paused`: one crew, "College gang",
 *     with Kiran, Anjali, Rahul and Sneha.
 *   - `people-crews-none`: `people` with no crews.
 *   - `people-crews-full`: twenty crews, so a new one is
 *     `409 crew_limit_reached` until one is deleted.
 *   - `people-crews-big`: 55 friends and one crew of 50, "Whole batch". One
 *     more member is `400 invalid_input`.
 *   - `people-crews-empty`: one crew, "Old flatmates", with nobody in it.
 *   - `people-crews-gone-friend`: one crew, "Trek group", of Kiran, Anjali,
 *     Rahul, Sameer T. and Nisha V. The last two stopped being friends, so
 *     saving with them is `409 not_friends` with their two ids; saving
 *     again without them works.
 *   - `people-crews-down`: `people`, and every crew route is `500`. The
 *     rest of People works.
 *   - `people-first`, `people-age-locked`: no crews. Saving is
 *     `403 adult_confirmation_required`, then `409 name_required` until the
 *     name step.
 *   - `people-paused`: saving is `403 people_paused`; deleting still works.
 *
 * As the API: names are trimmed and 1 to 40 characters, members are 1 to 50
 * of the caller's friends now (repeats count once), at most 20 crews, newest
 * first. Unfriend leaves the person in the caller's crews, so saving that
 * crew's members afterwards is `409 not_friends`. Deleting is `204` also for
 * a crew that is gone or not the caller's; changing one is `404`.
 */

type Crew = components["schemas"]["Crew"];

/** Crews made in this process, for their ids. */
let made = 0;

/** An id for a crew made in this process. */
function nextCrewId(): string {
  return crewId(1000 + ++made);
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The People gate, then the crews outage. */
function crewGate(request: Request) {
  const g = gate(request);
  if (g instanceof Response) return g;
  if (g.scenario === "people-crews-down") {
    return envelope("internal_error", "Something went wrong at our end.", 500);
  }
  return g;
}

/** What a save needs from the caller: People not paused, an adult, a name. */
function mayWrite(s: PeopleState): Response | null {
  if (s.standing !== "ok") {
    return paused(s, "Your use of People is paused for now.");
  }
  return adultWithName(s);
}

type Read<T> = { ok: T } | { no: Response };

/** A crew name as sent: trimmed, 1 to 40 characters. */
export function readName(name: unknown): Read<string> {
  const trimmed = typeof name === "string" ? name.trim() : "";
  if (trimmed.length < 1 || trimmed.length > 40) {
    return {
      no: envelope("invalid_input", "Give the crew a name.", 400, {
        name: "1 to 40 characters.",
      }),
    };
  }
  return { ok: trimmed };
}

/** Member ids as sent: 1 to 50 person ids, a repeat counted once. */
export function readMemberIds(ids: unknown): Read<string[]> {
  const no = (why: string) => ({
    no: envelope("invalid_input", why, 400, {
      memberIds: `1 to ${CREW_MEMBER_LIMIT} friends.`,
    }),
  });
  if (
    !Array.isArray(ids) ||
    !ids.every((id) => typeof id === "string" && UUID.test(id))
  ) {
    return no("Pick the friends for this crew.");
  }
  const unique = [...new Set(ids as string[])];
  if (unique.length < 1) return no("Pick at least one friend.");
  if (unique.length > CREW_MEMBER_LIMIT) {
    return no(`A crew can have up to ${CREW_MEMBER_LIMIT} friends.`);
  }
  return { ok: unique };
}

/** The members for these ids, or `409 not_friends` naming who is not a friend now. */
function membersFor(s: PeopleState, ids: string[]): Read<Crew["members"]> {
  const byId = new Map(s.friends.map((f) => [f.personId, f]));
  const notFriends = ids.filter((id) => !byId.has(id));
  if (notFriends.length > 0) {
    return {
      no: envelope(
        "not_friends",
        "Some of the people you picked are not your friends now.",
        409,
        { personIds: notFriends },
      ),
    };
  }
  return { ok: ids.map((id) => memberOf(byId.get(id)!)) };
}

/** Only the keys the contract has. */
function onlyKeys(body: Record<string, unknown>, keys: string[]): boolean {
  return Object.keys(body).every((k) => keys.includes(k));
}

const NO_CONTENT = () =>
  new HttpResponse(null, { status: 204, headers: mockHeaders(rid()) });

export const crewHandlers = [
  http.get(url("/me/crews"), ({ request }) => {
    const g = crewGate(request);
    if (g instanceof Response) return g;
    return json({ crews: g.s.crews });
  }),

  http.post(url("/me/crews"), async ({ request }) => {
    const g = crewGate(request);
    if (g instanceof Response) return g;
    const { s } = g;
    const no = mayWrite(s);
    if (no) return no;
    const body = await bodyOf(request);
    if (!onlyKeys(body, ["name", "memberIds"])) {
      return envelope("invalid_input", "Send a name and memberIds.", 400);
    }
    const name = readName(body.name);
    if ("no" in name) return name.no;
    const ids = readMemberIds(body.memberIds);
    if ("no" in ids) return ids.no;
    if (s.crews.length >= CREW_LIMIT) {
      return envelope(
        "crew_limit_reached",
        `You can have up to ${CREW_LIMIT} crews. Delete one to save another.`,
        409,
      );
    }
    const members = membersFor(s, ids.ok);
    if ("no" in members) return members.no;
    const saved: Crew = {
      crewId: nextCrewId(),
      name: name.ok,
      members: members.ok,
      createdAt: new Date(mockNow()).toISOString(),
    };
    s.crews.unshift(saved);
    return json(saved, 201);
  }),

  http.patch(url("/me/crews/:crewId"), async ({ request, params }) => {
    const g = crewGate(request);
    if (g instanceof Response) return g;
    const { s } = g;
    const no = mayWrite(s);
    if (no) return no;
    const body = await bodyOf(request);
    const keys = Object.keys(body);
    if (keys.length === 0 || !onlyKeys(body, ["name", "memberIds"])) {
      return envelope("invalid_input", "Send a name, memberIds or both.", 400);
    }
    const name = body.name === undefined ? null : readName(body.name);
    if (name && "no" in name) return name.no;
    const ids =
      body.memberIds === undefined ? null : readMemberIds(body.memberIds);
    if (ids && "no" in ids) return ids.no;
    const at = s.crews.findIndex((c) => c.crewId === params.crewId);
    if (at < 0) return envelope("not_found", "Not found.", 404);
    const members = ids ? membersFor(s, ids.ok) : null;
    if (members && "no" in members) return members.no;
    // A new object, so a list read earlier keeps what it had.
    const saved: Crew = {
      ...s.crews[at],
      ...(name ? { name: name.ok } : {}),
      ...(members ? { members: members.ok } : {}),
    };
    s.crews[at] = saved;
    return json(saved);
  }),

  // Nobody is told, and 204 also for a crew that is gone or not the caller's.
  // Not gated on standing: a paused traveller can still delete.
  http.delete(url("/me/crews/:crewId"), ({ request, params }) => {
    const g = crewGate(request);
    if (g instanceof Response) return g;
    g.s.crews = g.s.crews.filter((c) => c.crewId !== params.crewId);
    return NO_CONTENT();
  }),
];
