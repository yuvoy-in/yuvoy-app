import type { components } from "../src/lib/api/schema.gen";
import {
  ARJUN,
  DEV,
  KIRAN,
  MEERA,
  PRIYA,
  RAVI,
  personId,
  startingFriends,
} from "./people-fixtures";

/**
 * The crews People starts with under the `people*` scenarios
 * (yuvoy-app#227), apart from the handlers so an e2e spec can name the crews
 * and their members without loading MSW. `crew-handlers.ts` says which
 * scenario starts with what.
 *
 * A member is a `PersonRef` of a friend now, with `firstName`: as the API,
 * unfriending somebody takes them out of the caller's crews, so no list has
 * a member who stopped being a friend.
 */

type Crew = components["schemas"]["Crew"];
type Friend = components["schemas"]["Friend"];
type PersonRef = components["schemas"]["PersonRef"];

/** A crew's uuid that is the same every run, numbered. */
export function crewId(n: number): string {
  return `00000000-0000-4000-9000-${n.toString().padStart(12, "0")}`;
}

/** The most crews a person may have, and the most members in one. */
export const CREW_LIMIT = 20;
export const CREW_MEMBER_LIMIT = 50;

/** `people`, `people-all`, `people-paused`, `people-crews-down`: one crew. */
export const COLLEGE_GANG = { crewId: crewId(1), name: "College gang" };

/** `people-crews-big`: one crew of fifty, out of 55 friends. */
export const WHOLE_BATCH = { crewId: crewId(201), name: "Whole batch" };

/** `people-crews-empty`: one crew whose members are all gone. */
export const OLD_FLATMATES = { crewId: crewId(301), name: "Old flatmates" };

/** `people-crews-full`: twenty crews, newest first, `crewId(101)` to `(120)`. */
export const FULL_CREW_NAMES = [
  "Office lunch",
  "Goa 2025",
  "Badminton Sundays",
  "Book club",
  "Cousins",
  "School friends",
  "Gym buddies",
  "Trek crew",
  "Startup folks",
  "Neighbours",
  "Diving class",
  "Hostel wing",
  "Film nights",
  "Cricket team",
  "Weekend riders",
  "Wedding gang",
  "Coffee mornings",
  "Music jam",
  "Old office",
  "Beach day",
];

/** People that start as strangers, whose `shortName` a friend made of them keeps. */
const KNOWN: ReadonlyMap<string, PersonRef> = new Map(
  [PRIYA, ARJUN, MEERA, RAVI, DEV, KIRAN].map((p) => [p.personId, p]),
);

/** A friend as a crew lists them: first name shown. */
export function memberOf(friend: Friend): PersonRef {
  return {
    personId: friend.personId,
    shortName: KNOWN.get(friend.personId)?.shortName ?? friend.name,
    firstName: friend.firstName,
    initial: friend.initial,
  };
}

const MORE_FOR_BIG = [
  "Aarav",
  "Ananya",
  "Arnav",
  "Diya",
  "Farhan",
  "Gita",
  "Harsh",
  "Isha",
  "Jai",
  "Kavya",
  "Kabir",
  "Maya",
  "Naveen",
  "Nandini",
  "Pranav",
  "Riya",
  "Sahil",
  "Sanya",
  "Tanvi",
  "Uday",
  "Varun",
  "Vidya",
  "Yash",
  "Zara",
  "Akash",
  "Bina",
  "Chetan",
  "Deepa",
  "Eshan",
  "Gauri",
  "Hari",
  "Jaya",
];

/**
 * `people-crews-big` only: the 23 friends of `people` and 32 more, older,
 * so 55 in all and three pages of `GET /me/friends` at twenty a page (or two
 * at fifty).
 */
export function bigFriends(now: number): Friend[] {
  const day = 86_400_000;
  const first = startingFriends(now);
  return [
    ...first,
    ...MORE_FOR_BIG.map((name, i) => ({
      personId: personId(300 + i),
      name,
      firstName: name,
      initial: name[0],
      since: new Date(now - (80 + i) * day).toISOString(),
    })),
  ];
}

const HOUR = 3_600_000;

function crew(
  ids: { crewId: string; name: string },
  members: PersonRef[],
  createdAt: number,
): Crew {
  return {
    crewId: ids.crewId,
    name: ids.name,
    members,
    createdAt: new Date(createdAt).toISOString(),
  };
}

/** The crews a scenario starts with, newest first, from its friends. */
export function startingCrews(
  scenario: string,
  now: number,
  friends: Friend[],
): Crew[] {
  const members = (from: number, count: number) =>
    friends.slice(from, from + count).map(memberOf);
  switch (scenario) {
    case "people-crews-none":
      return [];
    case "people-crews-full":
      // Two to four members each, from across the friends list.
      return FULL_CREW_NAMES.map((name, i) =>
        crew(
          { crewId: crewId(101 + i), name },
          members(i, 2 + (i % 3)),
          now - (i + 1) * 5 * HOUR,
        ),
      );
    case "people-crews-big":
      return [
        crew(WHOLE_BATCH, members(0, CREW_MEMBER_LIMIT), now - 30 * HOUR),
      ];
    case "people-crews-empty":
      return [crew(OLD_FLATMATES, [], now - 90 * 24 * HOUR)];
    default:
      // Kiran, Anjali, Rahul and Sneha.
      return [crew(COLLEGE_GANG, members(0, 4), now - 2 * 24 * HOUR)];
  }
}
