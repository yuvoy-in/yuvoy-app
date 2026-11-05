import type { components } from "../src/lib/api/schema.gen";
import { bigFriends, startingCrews } from "./crew-fixtures";
import { mockNow } from "./fixtures";
import {
  CODE_OWNERS,
  FRIEND_LINK_CODES,
  OWN_LINK_CODE,
  normalCode,
  personId,
  startingFriends,
  startingRequests,
} from "./people-fixtures";

/**
 * What People keeps per session under the `people*` scenarios
 * (yuvoy-app#222): which scenario opens the release, each session's lists
 * and link, and what a friend link code looks up as. The routes are in
 * `people-handlers.ts`, which says what each scenario starts with.
 */

type PeopleHome = components["schemas"]["PeopleHome"];
type PeopleSummary = components["schemas"]["PeopleSummary"];
type PersonRef = components["schemas"]["PersonRef"];
type FriendLink = components["schemas"]["FriendLink"];
type Crew = components["schemas"]["Crew"];

/** Every scenario that sets the `people` release; `people-handlers.ts` says what each does. */
export const PEOPLE_SCENARIOS: ReadonlySet<string> = new Set([
  "people",
  "people-all",
  "people-first",
  "people-paused",
  "people-age-locked",
  "people-down",
  "people-outside",
  // Crews (yuvoy-app#227); `crew-handlers.ts` says what each starts with.
  "people-crews-none",
  "people-crews-full",
  "people-crews-big",
  "people-crews-empty",
  "people-crews-down",
]);

/** The stage a scenario gives `people`; null is `off`. */
export function peopleStageOf(scenario: string): "staff" | "all" | null {
  if (!PEOPLE_SCENARIOS.has(scenario)) return null;
  return scenario === "people-all" ? "all" : "staff";
}

/** Whether `GET /me` answers `cohort: staff` under the scenario. */
export function peopleStaffCohort(scenario: string): boolean {
  return peopleStageOf(scenario) === "staff" && scenario !== "people-outside";
}

/** Whether the release is open to the caller under the scenario. */
export function peopleOpen(scenario: string): boolean {
  return peopleStageOf(scenario) !== null && scenario !== "people-outside";
}

export interface PeopleState extends Omit<
  PeopleHome,
  "needsName" | "friendCount"
> {
  /** The account's name, which `PATCH /me` changes. */
  name: string | null;
  friends: ReturnType<typeof startingFriends>;
  /** For new link codes, so each is new. */
  links: number;
  /** The traveller's crews, newest first (yuvoy-app#227). */
  crews: Crew[];
}

const DAY = 86_400_000;

export function linkFor(code: string, requestsLeft: number, days: number) {
  return {
    code,
    url: `https://app.yuvoy.in/add/${code}`,
    expiresAt: new Date(mockNow() + days * DAY).toISOString(),
    requestsLeft,
  } satisfies FriendLink;
}

function startState(scenario: string): PeopleState {
  const now = mockNow();
  const blank = {
    standing: "ok" as const,
    standingUntil: null,
    requestEmails: true,
    friends: [],
    requestsIn: [],
    requestsOut: [],
    friendLink: null,
    privateUpcomingGoing: 0,
    links: 0,
    crews: [],
  };
  if (scenario === "people-first") {
    return {
      ...blank,
      ageConfirmed: false,
      name: null,
      sharing: null,
      privateUpcomingGoing: 2,
    };
  }
  if (scenario === "people-age-locked") {
    return { ...blank, ageConfirmed: false, name: "Asha Menon", sharing: null };
  }
  const paused = scenario === "people-paused";
  const friends =
    scenario === "people-crews-big" ? bigFriends(now) : startingFriends(now);
  return {
    ...blank,
    ...startingRequests(now),
    ageConfirmed: true,
    name: "Asha Menon",
    sharing: "friends",
    standing: paused ? "requests_paused" : "ok",
    standingUntil: paused ? new Date(now + 7 * DAY).toISOString() : null,
    friends,
    friendLink: linkFor(OWN_LINK_CODE, 17, 21),
    crews: startingCrews(scenario, now, friends),
  };
}

const states = new Map<string, PeopleState>();

/** Requests made in this process, for their ids. */
let asked = 0;

/** An id for a request made in this process. */
export function nextRequestId(): string {
  return personId(1000 + ++asked);
}

export function stateOf(auth: string, scenario: string): PeopleState {
  const key = `${scenario}|${auth}`;
  let state = states.get(key);
  if (!state) {
    state = startState(scenario);
    states.set(key, state);
  }
  return state;
}

/** No name, or a first word that is not a name (a number, a link). */
export function needsNameOf(name: string | null): boolean {
  const first = name?.trim().split(/\s+/)[0] ?? "";
  return !/^\p{L}[\p{L}'.-]*$/u.test(first);
}

export function homeOf(s: PeopleState): PeopleHome {
  return {
    ageConfirmed: s.ageConfirmed,
    standing: s.standing,
    standingUntil: s.standingUntil,
    sharing: s.sharing,
    needsName: needsNameOf(s.name),
    requestEmails: s.requestEmails,
    friendCount: s.friends.length,
    requestsIn: s.requestsIn,
    requestsOut: s.requestsOut,
    friendLink: s.friendLink,
    privateUpcomingGoing: s.privateUpcomingGoing,
  };
}

/* --------------------------------------- what `GET` and `PATCH /me` read */

/** `people` on `GET /me`: present only while the release is open. */
export function peopleSummaryFor(
  auth: string,
  scenario: string,
): PeopleSummary | null {
  if (!peopleOpen(scenario)) return null;
  const s = stateOf(auth, scenario);
  return { standing: s.standing, requestsWaiting: s.requestsIn.length };
}

/** `ageConfirmed` and `name` on `GET /me` under a People scenario. */
export function peopleAccountFor(
  auth: string,
  scenario: string,
): { ageConfirmed: boolean; name: string | null } | null {
  if (!PEOPLE_SCENARIOS.has(scenario)) return null;
  const s = stateOf(auth, scenario);
  return { ageConfirmed: s.ageConfirmed, name: s.name };
}

/** `PATCH /me` with a name, under a People scenario. */
export function setPeopleName(auth: string, scenario: string, name: string) {
  stateOf(auth, scenario).name = name.trim();
}

/** A new code for the traveller's link, the same for one session and count. */
export function newCode(key: string): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let h = 2166136261;
  for (const ch of key) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
  let code = "";
  for (let i = 0; i < 10; i++) {
    code += alphabet[h % alphabet.length];
    h = Math.imul(h ^ (i + 1), 2654435761) >>> 0;
  }
  return `${code.slice(0, 5)}-${code.slice(5)}`;
}

/** The owner of a fixed code by its compared form. */
const OWNERS = new Map(
  Object.entries(CODE_OWNERS).map(([code, person]) => [
    normalCode(code),
    person,
  ]),
);

type Looked =
  | { state: "expired" | "full" | "unavailable" }
  | {
      state: "ok";
      owner: PersonRef;
      relation: "self" | "none" | "requested" | "request_in" | "friends";
    };

export function look(s: PeopleState, code: string): Looked {
  const c = normalCode(code);
  if (c === normalCode(FRIEND_LINK_CODES.expired)) return { state: "expired" };
  if (c === normalCode(FRIEND_LINK_CODES.full)) return { state: "full" };
  if (s.friendLink && c === normalCode(s.friendLink.code)) {
    const name = s.name?.trim() ?? "";
    const [first, second] = name.split(/\s+/);
    return {
      state: "ok",
      owner: {
        personId: "00000000-0000-4000-8000-000000000001",
        shortName: second ? `${first} ${second[0]}.` : first,
        firstName: first,
        initial: first[0] ?? "A",
      },
      relation: "self",
    };
  }
  const owner = OWNERS.get(c);
  if (!owner) return { state: "unavailable" };
  const id = owner.personId;
  const relation = s.friends.some((f) => f.personId === id)
    ? "friends"
    : s.requestsOut.some((r) => r.person.personId === id)
      ? "requested"
      : s.requestsIn.some((r) => r.person.personId === id)
        ? "request_in"
        : "none";
  // As the API: the first name only where the caller may see it (a friend).
  return {
    state: "ok",
    owner:
      relation === "friends"
        ? { ...owner, firstName: owner.shortName.split(" ")[0] }
        : owner,
    relation,
  };
}

/**
 * Unfriend, as the API does it: the person leaves the caller's friends and
 * every one of the caller's crews at once (and the caller theirs, which the
 * mock does not keep). Ids compare in any case.
 */
export function unfriend(s: PeopleState, id: string): void {
  const gone = id.toLowerCase();
  const other = (personId: string) => personId.toLowerCase() !== gone;
  s.friends = s.friends.filter((f) => other(f.personId));
  // A new object for a crew that changes, so a list read earlier keeps it.
  s.crews = s.crews.map((c) =>
    c.members.some((m) => !other(m.personId))
      ? { ...c, members: c.members.filter((m) => other(m.personId)) }
      : c,
  );
}

/** Forget one session's People, as an under-18 answer closes the account. */
export function forgetPeople(auth: string, scenario: string): void {
  states.delete(`${scenario}|${auth}`);
}

/** Test-only: forget every change between cases. */
export function __resetPeopleMocks(): void {
  states.clear();
}
