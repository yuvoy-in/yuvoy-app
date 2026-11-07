import type { components } from "../src/lib/api/schema.gen";
import { CLUB_IDS, CLUBS_HELD } from "./organiser-fixtures";
import { pageFrom, restProblems, text } from "./organiser-fields";
import { holdsClubs, nextId, type Store } from "./organiser-store";

/**
 * A group's organiser page (yuvoy-app#225, the web half of yuvoy-mobile#395):
 * `createOrganiser` with `clubId`, and the edit rule for an organiser set up
 * from a group. Split out of `organiser-handlers.ts` to keep it short; the
 * handlers turn a `Refusal` here into the API's error envelope.
 *
 *   - `organisers-club`: the caller holds two groups, `CLUBS_HELD`, by name:
 *     "Sample Lagoon Runners" (`sports`) and "Sample Sunset Quiz" (no
 *     category), with no organisers yet. A create from a group answers 201
 *     `verified`, with the group's name and place, `clubId` set and no
 *     `verificationCode`, and that group leaves `clubsToLink` for the session.
 *     A second create for the same group is 409 `club_already_linked` with
 *     `details.organiserId` of the first.
 *   - `organisers-club-paused`: the same groups, but People is paused:
 *     `clubsToLink` is empty and a create for a held group is 403
 *     `people_paused`.
 *
 * In every scenario, in the order the API checks: a body that sends `name`
 * or `destinationKey`, or a `clubId` that is not an id, is 400 under that
 * field; an id that is no group is 404; `CLUB_IDS.heldByAnother` (or any
 * group, where the caller holds none) is 403 `not_club_holder`. An edit of a
 * group's organiser that changes its name or place is 400 under that field.
 * The day limit is not mocked.
 */

type Organiser = components["schemas"]["Organiser"];

/** An error answer, before the handlers wrap it. */
export interface Refusal {
  status: number;
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The API's sentences (yuvoy-mobile#395, "Messages from the API"). */
const SAID = {
  name: "A group's organiser has the group's own name, so leave the name out.",
  place:
    "A group's organiser has the group's own place, so leave the place out.",
  clubId: "Choose one of the groups you hold.",
  noGroup: "We could not find that group.",
  notHolder:
    "Only the person who holds this group on Yuvoy can set up its organiser.",
  peoplePaused: "Your use of People is paused for now.",
  linked: "This group already has an organiser.",
  keepsName: "A group's organiser keeps the group's name.",
  keepsPlace: "A group's organiser keeps the group's place.",
} as const;

/** A 400 naming its fields: the one sentence as the message, or the whole line for several. */
function fieldsRefused(problems: Record<string, string>): Refusal | null {
  const sentences = Object.values(problems);
  if (sentences.length === 0) return null;
  return {
    status: 400,
    code: "invalid_input",
    message:
      sentences.length === 1
        ? (sentences[0] ?? "")
        : "Check the fields marked and try again.",
    details: problems,
  };
}

function slugOf(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/** `POST /organisers` with `clubId`: the organiser made, or the API's refusal. */
export function clubCreate(
  store: Store,
  scenario: string,
  body: Record<string, unknown>,
): { made: Organiser } | Refusal {
  const problems: Record<string, string> = {};
  if (body.name !== undefined) problems.name = SAID.name;
  if (body.destinationKey !== undefined) problems.destinationKey = SAID.place;
  const clubId = text(body.clubId).toLowerCase();
  if (!UUID.test(clubId)) problems.clubId = SAID.clubId;
  const bad = fieldsRefused({ ...problems, ...restProblems(body) });
  if (bad) return bad;

  const club = CLUBS_HELD.find((c) => c.clubId === clubId);
  if (!club && clubId !== CLUB_IDS.heldByAnother) {
    return { status: 404, code: "not_found", message: SAID.noGroup };
  }
  if (!club || !holdsClubs(scenario)) {
    return { status: 403, code: "not_club_holder", message: SAID.notHolder };
  }
  if (scenario === "organisers-club-paused") {
    return {
      status: 403,
      code: "people_paused",
      message: SAID.peoplePaused,
      details: { standing: "restricted" },
    };
  }
  const first = store.linked.get(club.clubId);
  if (first) {
    return {
      status: 409,
      code: "club_already_linked",
      message: SAID.linked,
      details: { organiserId: first },
    };
  }

  const page = pageFrom({
    ...body,
    name: club.name,
    destinationKey: club.destinationKey,
  });
  // Verified at once: holding the group is the proof, so there is no code.
  const org: Organiser = {
    ...page,
    id: nextId(),
    slug: slugOf(club.name),
    state: "verified",
    selfPublish: false,
    role: "owner",
    clubId: club.clubId,
  };
  // The API lists the person's organisers oldest first.
  store.organisers.push(org);
  store.linked.set(club.clubId, org.id);
  store.clubsToLink = store.clubsToLink.filter((c) => c.clubId !== club.clubId);
  return { made: org };
}

/**
 * `PATCH /organisers/{id}` on a group's organiser: the name and place must be
 * sent back as stored (trimmed, as the API reads them), and every other
 * field's problem comes in the same 400. Null for any other organiser, or
 * when nothing is wrong.
 */
export function clubKept(
  org: Organiser,
  body: Record<string, unknown>,
): Refusal | null {
  if (org.clubId === null) return null;
  const problems: Record<string, string> = {};
  if (text(body.name) !== org.name.trim()) problems.name = SAID.keepsName;
  if (text(body.destinationKey) !== org.destinationKey.trim()) {
    problems.destinationKey = SAID.keepsPlace;
  }
  return fieldsRefused({ ...problems, ...restProblems(body) });
}
