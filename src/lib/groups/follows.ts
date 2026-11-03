import { NetworkError, YuvoyError } from "@/lib/api/errors";
import {
  PEOPLE_FAILURE_WORDS,
  PEOPLE_SHUT_LINE,
  PeopleShutError,
} from "@/lib/people/people-stand-ins";

/**
 * Follow a group (yuvoy-mobile#392, web half, R10-T2): the words, what a
 * failure says, and how the follows list changes after a tap. No React here,
 * so all of it is tested on its own.
 *
 * The API keeps at most this many follows per traveller and answers `409
 * follow_limit_reached` past it.
 */
export const FOLLOW_LIMIT = 200;

/** Mobile's words, the same on the web. */
export const FOLLOW_WORDS = Object.freeze({
  follow: "Follow",
  following: "Following",
  sending: "Sending",
  tryAgain: "Try again",
  tryingAgain: "Trying again",
  followLabel: (name: string) => `Follow ${name}`,
  followingLabel: (name: string) => `Following ${name}`,
  unavailable: "Follow is not available right now.",
  lead: (city: string) =>
    `Clubs and communities in ${city} that meet regularly. Follow the ones you like.`,
  footer: "Follow one and we'll tell you once if it joins.",
  privacy: "Groups you follow see nothing.",
});

/** The API's own lines, used when an answer arrives without one. */
export const FOLLOW_API_WORDS = Object.freeze({
  closed: "People isn't open to your account yet.",
  gone: "We couldn't find that group.",
  limit: `You follow ${FOLLOW_LIMIT} groups already. Stop following one to follow another.`,
  down: "People is not available right now. Try again later.",
});

export type FollowFailureKind =
  | "closed"
  | "gone"
  | "limit"
  | "signIn"
  | "age"
  | "name"
  | "paused"
  | "ended"
  | "down"
  | "noSignal"
  | "fault";

export interface FollowFailure {
  kind: FollowFailureKind;
  /** The line under the button. */
  line: string;
  /** Whether Try again can help. */
  retry: boolean;
}

/*
  The API's own line, or ours. An answer without the API's error body comes
  back as `internal_error` with "The server answered 503.", which is not a
  line for a person, so it gets ours too.
*/
function said(error: YuvoyError, fallback: string): string {
  if (error.code === "internal_error") return fallback;
  const line = error.message.trim();
  return line.length > 0 ? line : fallback;
}

/**
 * What a failed follow, unfollow or follows read says. A 404 is never read
 * as success (decision A): once the hook has read the releases again it is
 * either People closed (`PeopleShutError`) or "not there".
 */
export function followFailure(error: unknown): FollowFailure {
  if (error instanceof PeopleShutError) {
    return { kind: "closed", line: PEOPLE_SHUT_LINE, retry: false };
  }
  if (error instanceof NetworkError) {
    return {
      kind: "noSignal",
      line: PEOPLE_FAILURE_WORDS.noSignal,
      retry: true,
    };
  }
  if (!(error instanceof YuvoyError)) {
    return { kind: "fault", line: PEOPLE_FAILURE_WORDS.fault, retry: true };
  }
  if (error.status === 404) {
    return { kind: "gone", line: FOLLOW_API_WORDS.gone, retry: false };
  }
  if (error.status === 401) {
    return { kind: "signIn", line: PEOPLE_FAILURE_WORDS.signIn, retry: false };
  }
  if (error.status === 403 && error.code === "adult_confirmation_required") {
    return { kind: "age", line: PEOPLE_FAILURE_WORDS.age, retry: false };
  }
  if (error.status === 403 && error.code === "people_paused") {
    if (error.details.standing === "removed") {
      return { kind: "ended", line: PEOPLE_FAILURE_WORDS.ended, retry: false };
    }
    return { kind: "paused", line: PEOPLE_FAILURE_WORDS.paused, retry: false };
  }
  if (error.status === 409 && error.code === "name_required") {
    return { kind: "name", line: PEOPLE_FAILURE_WORDS.name, retry: false };
  }
  if (error.status === 409 && error.code === "follow_limit_reached") {
    return {
      kind: "limit",
      line: said(error, FOLLOW_API_WORDS.limit),
      retry: false,
    };
  }
  if (error.status === 503) {
    return {
      kind: "down",
      line: said(error, FOLLOW_API_WORDS.down),
      retry: true,
    };
  }
  return { kind: "fault", line: PEOPLE_FAILURE_WORDS.fault, retry: true };
}

/** One group in the follows list, as `GET /me/club-follows` names it. */
export interface FollowedClub {
  clubId: string;
  slug: string;
  name: string;
}

/** The body of `GET /me/club-follows`. */
export interface ClubFollows {
  clubIds: string[];
  clubs: FollowedClub[];
}

/**
 * The follows list after a follow (`on`) or an unfollow that the API took.
 * A list not read yet stays unread. A new follow goes first, as the API
 * lists newest first; one already there keeps its place, and so does the
 * list when an unfollow names a group it does not have.
 */
export function followsAfter(
  old: ClubFollows | undefined,
  clubId: string,
  on: boolean,
  club?: FollowedClub,
): ClubFollows | undefined {
  if (!old) return old;
  if (on) {
    const ids = old.clubIds.includes(clubId)
      ? old.clubIds
      : [clubId, ...old.clubIds];
    const listed = old.clubs.some((c) => c.clubId === clubId);
    const clubs = club && !listed ? [club, ...old.clubs] : old.clubs;
    if (ids === old.clubIds && clubs === old.clubs) return old;
    return { ...old, clubIds: ids, clubs };
  }
  if (
    !old.clubIds.includes(clubId) &&
    !old.clubs.some((c) => c.clubId === clubId)
  ) {
    return old;
  }
  return {
    ...old,
    clubIds: old.clubIds.filter((id) => id !== clubId),
    clubs: old.clubs.filter((c) => c.clubId !== clubId),
  };
}

/** Whether a group is followed, by the follows list as it stands. */
export function isFollowing(
  follows: ClubFollows | undefined,
  clubId: string,
): boolean {
  return follows?.clubIds.includes(clubId) ?? false;
}
