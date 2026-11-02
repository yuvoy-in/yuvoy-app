import { NetworkError, YuvoyError } from "@/lib/api/errors";
import type { components } from "@/lib/api/schema.gen";
import type { PlaceDestination } from "@/lib/site/place-choice";
import type { PlaceMarket } from "@/lib/site/places";
import {
  CLAIM_FIELD_WORDS,
  CLUB_API_WORDS,
  CLUB_REPORT_WORDS,
  CLUB_WORDS,
  PEOPLE_ERROR_WORDS,
  type ClaimField,
  type ClubReportReason,
} from "./club-words";

/**
 * The groups directory's logic (yuvoy-mobile#386, web backfill), ported
 * from mobile's `packages/core/src/people/clubs.ts` with the same names.
 *
 * Left out on purpose: Follow (yuvoy-mobile#392) and `claimable`, which the
 * web's pinned contract does not have. Claim shows while `onYuvoy` is false.
 * Every answer is read by its status and `error.code`, never its message.
 */

export type Club = components["schemas"]["Club"];
export type ClubList = components["schemas"]["ClubList"];
export type ClubClaimInput = components["schemas"]["ClubClaimInput"];
export type ClubClaimReceipt = components["schemas"]["ClubClaimReceipt"];
export type ClubRemovalRequest = components["schemas"]["ClubRemovalRequest"];
export type ClubRemovalReceipt = components["schemas"]["ClubRemovalReceipt"];
export type ClubReport = components["schemas"]["ClubReport"];
export type ClubReportReceipt = components["schemas"]["ClubReportReceipt"];

const filled = (value: string | null | undefined): string | null =>
  value?.trim() || null;

/**
 * A card's line and a page's: "{what} · {meets} · {area}", a part that is
 * null (or blank) left out with its " · ".
 */
export function clubMeta(club: Pick<Club, "what" | "meets" | "area">): string {
  return [club.what, club.meets, club.area]
    .map(filled)
    .filter((part): part is string => part !== null)
    .join(" · ");
}

/** "On Yuvoy" once someone who runs the group has claimed it, else "Not on Yuvoy yet". */
export function clubLabel(club: Pick<Club, "onYuvoy">): string {
  return club.onYuvoy ? CLUB_WORDS.onYuvoy : CLUB_WORDS.notOnYuvoy;
}

/** A card's words for a screen reader, in the order they are drawn (the emoji is not read). */
export function clubCardLabel(club: Club): string {
  return [
    club.name,
    clubMeta(club),
    CLUB_WORDS.from(club.sourceName),
    clubLabel(club),
  ].join(", ");
}

/**
 * The place last picked, by its destination key (`andaman/havelock`). The
 * shape of mobile's `PlaceChoice` that `clubPlaces` reads. On the web it
 * comes from `?place=` or the `yv_place` cookie.
 */
export interface ClubPlacePick {
  destination?: string | null;
}

/**
 * The place chips: every place in the places list, in its order, a place
 * never twice, with the place picked last moved first (it is the one chosen
 * when the directory opens). A pick that names no town, or one the list does
 * not have now, moves nothing.
 */
export function clubPlaces(
  markets: readonly Pick<PlaceMarket, "destinations">[],
  choice: ClubPlacePick | null,
): PlaceDestination[] {
  const seen = new Set<string>();
  const all: PlaceDestination[] = [];
  for (const market of markets) {
    for (const destination of market.destinations) {
      if (seen.has(destination.key)) continue;
      seen.add(destination.key);
      all.push(destination);
    }
  }
  const picked = choice?.destination
    ? all.find((d) => d.key === choice.destination)
    : undefined;
  return picked ? [picked, ...all.filter((d) => d !== picked)] : all;
}

/** What the claim form holds as typed. */
export interface ClaimForm {
  roleText: string;
  contactEmail: string;
  proofUrl: string;
  note: string;
}

/**
 * The claim to send: each field without its outer spaces, the optional two
 * left out when empty. The API checks the rest (lengths, the email,
 * `https://` only) and names any field it refuses.
 */
export function claimBody(form: ClaimForm): ClubClaimInput {
  const proofUrl = form.proofUrl.trim();
  const note = form.note.trim();
  return {
    roleText: form.roleText.trim(),
    contactEmail: form.contactEmail.trim(),
    ...(proofUrl ? { proofUrl } : {}),
    ...(note ? { note } : {}),
  };
}

/** The two required fields left empty, said on each before anything is sent. */
export function claimMissing(
  form: ClaimForm,
): Partial<Record<ClaimField, string>> {
  const missing: Partial<Record<ClaimField, string>> = {};
  if (!form.roleText.trim()) missing.roleText = CLAIM_FIELD_WORDS.roleText;
  if (!form.contactEmail.trim())
    missing.contactEmail = CLAIM_FIELD_WORDS.contactEmail;
  return missing;
}

/** The removal to send: the reason, and nothing else (the form has no note and no email). */
export function clubRemovalBody(
  reason: ClubRemovalRequest["reason"],
): ClubRemovalRequest {
  return { reason };
}

/** "Something else" with no note: the report form asks for one before it sends. */
export function reportNeedsNote(
  reason: ClubReportReason | null,
  note: string,
): boolean {
  return reason === "other" && note.trim() === "";
}

/** The report to send: the reason, and the note when there is one. */
export function clubReportBody(
  reason: ClubReportReason,
  note: string,
): ClubReport {
  const text = note.trim();
  return text ? { reason, note: text } : { reason };
}

/** Which form a refusal came from: each has its own 429 sentence. */
export type ClubAction = "claim" | "removal" | "report";

/**
 * What a refused claim, removal or report means for the screen, by the
 * status and `error.code`:
 *   - `gone` (404): the group is not shown now (hidden, removed, or the
 *     release closed): back to the directory, read again, with the API's
 *     message;
 *   - `fields` (400 `invalid_input` naming a field of the form): each said
 *     on its field;
 *   - `age` (403 `adult_confirmation_required`), `name` (409
 *     `name_required`), `paused` (403 `people_paused`): a line saying what
 *     is needed. Mobile opens a step here; the web has none yet;
 *   - `waiting` (409 `conflict`, `claim_waiting`), `claimed` (409
 *     `conflict`, `already_claimed`), `limit` (429): the API's message, and
 *     nothing changes;
 *   - `say`: anything else (no signal, a 401, a 503, a 400 the app should
 *     never cause), a line to show, with what was typed kept to send again.
 */
export type ClubFailure =
  | { kind: "gone"; line: string }
  | { kind: "fields"; fields: Partial<Record<ClaimField, string>> }
  | { kind: "age"; line: string }
  | { kind: "name"; line: string }
  | { kind: "paused"; line: string }
  | { kind: "waiting"; line: string }
  | { kind: "claimed"; line: string }
  | { kind: "limit"; line: string }
  | { kind: "say"; line: string };

const LIMIT_WORDS: Record<ClubAction, string> = {
  claim: CLUB_API_WORDS.claimLimit,
  removal: CLUB_API_WORDS.removalLimit,
  report: CLUB_API_WORDS.reportLimit,
};

const CLAIM_FIELDS: readonly ClaimField[] = [
  "roleText",
  "contactEmail",
  "proofUrl",
  "note",
];

/** The fields a 400 names that the form has, each with our sentence for it. */
function refusedFields(
  action: ClubAction,
  details: Record<string, unknown>,
): Partial<Record<ClaimField, string>> {
  const fields: Partial<Record<ClaimField, string>> = {};
  if (action === "claim") {
    for (const key of CLAIM_FIELDS) {
      if (key in details) fields[key] = CLAIM_FIELD_WORDS[key];
    }
  } else if (action === "report" && "note" in details) {
    fields.note = CLUB_REPORT_WORDS.noteTooLong;
  }
  return fields;
}

export function clubFailure(action: ClubAction, error: unknown): ClubFailure {
  if (error instanceof NetworkError) {
    return { kind: "say", line: PEOPLE_ERROR_WORDS.noSignal };
  }
  if (!(error instanceof YuvoyError)) {
    return { kind: "say", line: PEOPLE_ERROR_WORDS.fault };
  }
  const said = filled(error.message);
  const details = error.details;
  switch (error.status) {
    case 404:
      return { kind: "gone", line: said ?? CLUB_API_WORDS.gone };
    case 400:
      if (error.code === "invalid_input") {
        const fields = refusedFields(action, details);
        if (Object.keys(fields).length > 0) return { kind: "fields", fields };
      }
      break;
    case 401:
      return { kind: "say", line: PEOPLE_ERROR_WORDS.signIn };
    case 403:
      if (error.code === "adult_confirmation_required") {
        return { kind: "age", line: PEOPLE_ERROR_WORDS.age };
      }
      if (error.code === "people_paused") {
        const ended = details.standing === "removed";
        return {
          kind: "paused",
          line: ended ? PEOPLE_ERROR_WORDS.ended : PEOPLE_ERROR_WORDS.paused,
        };
      }
      break;
    case 409: {
      if (error.code === "name_required") {
        return { kind: "name", line: PEOPLE_ERROR_WORDS.name };
      }
      if (error.code === "conflict" && details.reason === "claim_waiting") {
        return { kind: "waiting", line: said ?? CLUB_API_WORDS.claimWaiting };
      }
      if (error.code === "conflict" && details.reason === "already_claimed") {
        return { kind: "claimed", line: said ?? CLUB_API_WORDS.alreadyClaimed };
      }
      break;
    }
    case 429:
      return { kind: "limit", line: said ?? LIMIT_WORDS[action] };
  }
  return { kind: "say", line: PEOPLE_ERROR_WORDS.fault };
}
