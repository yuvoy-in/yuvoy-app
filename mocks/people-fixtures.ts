import type { components } from "../src/lib/api/schema.gen";

/**
 * The people People starts with under the `people*` scenarios
 * (yuvoy-app#222), apart from the handlers so an e2e spec can name the codes
 * and the people without loading MSW. `people-handlers.ts` says which
 * scenario starts with what.
 *
 * No phone number or email anywhere: a non-friend is a `shortName` and an
 * initial, a friend is the first word of their name.
 */

type PersonRef = components["schemas"]["PersonRef"];
type Friend = components["schemas"]["Friend"];
type FriendRequest = components["schemas"]["FriendRequest"];

/** A uuid that is the same every run, numbered. */
export function personId(n: number): string {
  return `00000000-0000-4000-8000-${n.toString().padStart(12, "0")}`;
}

/** Somebody who is not a friend, as a request or a link's owner shows them. */
function stranger(n: number, shortName: string): PersonRef {
  return { personId: personId(n), shortName, initial: shortName[0] };
}

/** The traveller's own link in `people`. Its code looks up as `self`. */
export const OWN_LINK_CODE = "ASHAM-LNK22";

export const PRIYA = stranger(101, "Priya S.");
export const ARJUN = stranger(102, "Arjun N.");
export const MEERA = stranger(103, "Meera J.");
export const RAVI = stranger(104, "Ravi K.");
export const DEV = stranger(105, "Dev P.");
/** The friend `KIRAN-FRND2` belongs to, and the newest friend in `people`. */
export const KIRAN = stranger(106, "Kiran R.");

/**
 * The fixed lookup codes (`POST /friend-links/lookup`). Any case, hyphen
 * optional, as the API reads them. `owner` is whose link it is: the relation
 * is worked out from the session's lists at the time of the call, so it
 * follows Accept, Take back and Unfriend.
 */
export const FRIEND_LINK_CODES = {
  /** `ok`, relation `none` (Ravi K. is in no list). Send request works. */
  none: "RAVIK-NONE2",
  /** `ok`, relation `requested` (Meera J., the request out). */
  requested: "MEERA-SENT2",
  /** `ok`, relation `request_in` (Priya S., a request in). */
  requestIn: "PRIYA-ASKS2",
  /** `ok`, relation `friends` (Kiran, a friend). */
  friends: "KIRAN-FRND2",
  /** `ok`, relation `self`: the traveller's own live link. */
  self: OWN_LINK_CODE,
  /** `expired`. Asking answers `410 friend_link_expired`. */
  expired: "DEVPX-EXPD2",
  /** `full`. Asking answers `409 friend_link_full`. */
  full: "DEVPX-FULL2",
  /** `unavailable`, as is any code nobody holds. Asking is still `202`. */
  unavailable: "GONEX-NOPE2",
} as const;

/** The owners of the fixed codes that are not the traveller's own. */
export const CODE_OWNERS: Record<string, PersonRef> = {
  [FRIEND_LINK_CODES.none]: RAVI,
  [FRIEND_LINK_CODES.requested]: MEERA,
  [FRIEND_LINK_CODES.requestIn]: PRIYA,
  [FRIEND_LINK_CODES.friends]: KIRAN,
  [FRIEND_LINK_CODES.expired]: DEV,
  [FRIEND_LINK_CODES.full]: DEV,
};

/** A code as the API compares it: upper case, no hyphen. */
export function normalCode(code: string): string {
  return code.toUpperCase().replace(/-/g, "");
}

/** A friend made from somebody who was not one: the first word only. */
export function friendOf(person: PersonRef, since: string): Friend {
  const name = person.shortName.split(" ")[0];
  return {
    personId: person.personId,
    name,
    firstName: name,
    initial: person.initial,
    since,
  };
}

const MORE_FRIENDS = [
  "Anjali",
  "Rahul",
  "Sneha",
  "Vikram",
  "Divya",
  "Rohan",
  "Lakshmi",
  "Aditya",
  "Neha",
  "Siddharth",
  "Pooja",
  "Karthik",
  "Fatima",
  "Manoj",
  "Ishaan",
  "Tara",
  "Nikhil",
  "Zoya",
  "Gaurav",
  "Leela",
  "Omar",
  "Bhavna",
];

/**
 * Twenty-three friends, newest first: Kiran, then twenty-two more a few days
 * apart, so the first page of twenty has a second page of three.
 */
export function startingFriends(now: number): Friend[] {
  const day = 86_400_000;
  const at = (i: number) => new Date(now - (i + 1) * 3 * day).toISOString();
  return [
    friendOf(KIRAN, at(0)),
    ...MORE_FRIENDS.map((name, i) => ({
      personId: personId(200 + i),
      name,
      firstName: name,
      initial: name[0],
      since: at(i + 1),
    })),
  ];
}

/** Two requests in (one with mutual friends) and one out. */
export function startingRequests(now: number): {
  requestsIn: FriendRequest[];
  requestsOut: FriendRequest[];
} {
  const hoursAgo = (h: number) => new Date(now - h * 3_600_000).toISOString();
  return {
    requestsIn: [
      {
        requestId: personId(901),
        direction: "incoming",
        person: PRIYA,
        source: "friend_link",
        requestedAt: hoursAgo(3),
        mutualFriends: 3,
      },
      {
        requestId: personId(902),
        direction: "incoming",
        person: ARJUN,
        source: "plan",
        requestedAt: hoursAgo(30),
        mutualFriends: 0,
      },
    ],
    requestsOut: [
      {
        requestId: personId(903),
        direction: "outgoing",
        person: MEERA,
        source: "friend_link",
        requestedAt: hoursAgo(50),
      },
    ],
  };
}
