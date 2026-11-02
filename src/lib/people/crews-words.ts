import type { components } from "@/lib/api/schema.gen";
import type { PersonRef } from "./people-words";

export type Crew = components["schemas"]["Crew"];
export type CrewList = components["schemas"]["CrewList"];
export type CrewInput = components["schemas"]["CrewInput"];
export type CrewPatch = components["schemas"]["CrewPatch"];

/** The most crews one person can keep, as the API counts them. */
export const CREWS_MOST = 20;
/** The most friends in one crew. */
export const CREW_MEMBERS_MOST = 50;
/** The longest crew name, in characters once trimmed. */
export const CREW_NAME_MOST = 40;

/**
 * Every word of crews on the web (yuvoy-app#227, the web half of
 * yuvoy-mobile#387): the section on People, a crew's page and the editor.
 * The same words as the app, so a traveller who uses both reads one thing.
 *
 * A refusal the API explains (`people_paused`, a `429`) is shown in the
 * API's own sentence. What is here is what the screens say on their own.
 */
export const CREWS_WORDS = {
  head: "Crews",
  newCrew: "New crew",
  empty: 'Save a group of friends, like "College gang" or "Office lunch".',
  foot: "Only you see your crews. Nobody is told they are in one.",
  limit: `You have ${CREWS_MOST} crews, the most there can be. Delete one to make another.`,
  loading: "Loading your crews",
  failed: "Your crews did not load",
  nobody: "No one in this crew now",
  back: { href: "/people", label: "People" },
  /** The editor's way back to the crew it changes. */
  backToCrew: "the crew",

  /** The editor, for a new crew and for changing one. */
  newTitle: "New crew",
  editTitle: "Edit crew",
  nameLabel: "Crew name",
  namePlaceholder: "Like College gang",
  nameBlank: "Give your crew a name.",
  nameLong: `Keep the name to ${CREW_NAME_MOST} characters or fewer.`,
  pickHead: "Friends in this crew",
  picked: (n: number) => `${n} of ${CREW_MEMBERS_MOST} picked`,
  pickOne: "Pick at least one friend.",
  pickMost: `A crew can have ${CREW_MEMBERS_MOST} friends at most.`,
  noFriends:
    "You have no friends on Yuvoy yet. Add a friend, then make a crew.",
  save: "Save crew",
  saving: "Saving",
  cancel: "Cancel",
  /** A pick list row for somebody who stopped being a friend. */
  notFriendTag: "Not your friend now",
  /** After `not_friends`: the button that unticks them. */
  takeOut: "Take them out",
  takenOut: "Taken out. Save the crew again to keep it.",

  /** A crew's own page. */
  edit: "Edit crew",
  delete: "Delete crew",
  deleteTitle: (name: string) => `Delete ${name}?`,
  deleteBody: "Your friends stay your friends. Nobody is told.",
  deleteKeep: "Keep",
  deleting: "Deleting",
  deleted: "Crew deleted",
  saved: "Crew saved",
  /** A save or delete that answered `404`, once the release was read again. */
  closedNotSaved: "People is closed for now, so this crew was not saved.",
  closedNotDeleted: "People is closed for now, so this crew was not deleted.",
  /** A `404` that the reads after it could not explain. */
  notSaved: "This crew was not saved. Try again.",
  notDeleted: "This crew was not deleted. Try again.",
  gone: {
    title: "This crew is not there any more",
    body: "It may have been deleted on another device.",
    action: "Back to People",
  },
} as const;

/** The name a crew shows for one of its members: first name, else short. */
export function crewMemberName(member: PersonRef): string {
  return member.firstName ?? member.shortName;
}

/** "1 friend", "4 friends", or that nobody is in it now. */
export function crewCountLine(count: number): string {
  if (count === 0) return CREWS_WORDS.nobody;
  return count === 1 ? "1 friend" : `${count} friends`;
}

/** "A and B", "A, B and C". */
function andList(names: string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/** Up to three names, then "and N more": "Kiran, Anjali, Rahul and 2 more". */
export function crewMembersLine(members: PersonRef[]): string {
  const names = members.map(crewMemberName);
  if (names.length <= 3) return andList(names);
  return `${names.slice(0, 3).join(", ")} and ${names.length - 3} more`;
}

/** After `not_friends`: who stopped being a friend, by name. */
export function notFriendsLine(names: string[]): string {
  if (names.length === 0) {
    return "Someone in this crew is not your friend any more.";
  }
  return names.length === 1
    ? `${names[0]} is not your friend any more, so they cannot be in this crew.`
    : `${andList(names)} are not your friends any more, so they cannot be in this crew.`;
}

/** A name's length as the API counts it: trimmed, in characters. */
export function crewNameLength(name: string): number {
  return [...name.trim()].length;
}

/**
 * What a change to a crew sends: only what changed, the name trimmed. Null
 * when nothing did, so nothing is sent. Members compare as sets.
 */
export function crewChange(
  crew: Crew,
  name: string,
  memberIds: string[],
): CrewPatch | null {
  const patch: CrewPatch = {};
  const trimmed = name.trim();
  if (trimmed !== crew.name) patch.name = trimmed;
  const before = new Set(crew.members.map((m) => m.personId.toLowerCase()));
  const after = new Set(memberIds.map((id) => id.toLowerCase()));
  const same =
    before.size === after.size && [...after].every((id) => before.has(id));
  if (!same) patch.memberIds = memberIds;
  return Object.keys(patch).length > 0 ? patch : null;
}
