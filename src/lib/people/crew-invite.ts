import { NetworkError, YuvoyError } from "@/lib/api/errors";
import {
  PEOPLE_FAILURE_WORDS,
  PEOPLE_SHUT_LINE,
  PeopleShutError,
} from "./people-stand-ins";

/**
 * Invite a crew to a plan (yuvoy-mobile#392, web half, R10-T2): the words,
 * the line after an invite, and what a failure says. No React here.
 */

/** Mobile's words, the same on the web. */
export const CREW_INVITE_WORDS = Object.freeze({
  button: "Invite to a plan",
  loading: "Loading your plans",
  noPlans:
    "You have no plans coming up. Make one first, then invite your crew.",
  plansPaused: "Plans are paused right now. Try again in a little while.",
  /** Ours: plans are not open to this account (a 404 on the plans read or an invite). */
  plansClosed: "Plans aren't open to your account yet.",
  gone: "That plan isn't there any more, so nobody was invited.",
  /** Added to the empty crews line on mobile: "..., and invite them to plans in one tap." */
  crewsEmptyClause: ", and invite them to plans in one tap.",
  tryAgain: "Try again",
});

/** Why a plan no longer takes invites, as `details.reason` says. */
export type PlanClosedReason = "started" | "cancelled" | "done" | "closed";

/** The API's lines for `409 plan_closed`, used when an answer has none. */
export const PLAN_CLOSED_WORDS: Readonly<Record<PlanClosedReason, string>> =
  Object.freeze({
    started: "This plan has started, so its times and answers are fixed.",
    cancelled: "This plan was cancelled.",
    done: "This plan is done.",
    closed: "Yuvoy closed this plan.",
  });

function count(n: unknown): number {
  return typeof n === "number" && Number.isFinite(n) && n > 0
    ? Math.floor(n)
    : 0;
}

/**
 * The line after an invite the API took. `invited` are the crew members
 * added now; `skipped` are the ones left out (already on the plan, or who
 * cannot be added).
 */
export function crewInviteLine(result: {
  invited: number;
  skipped: number;
}): string {
  const invited = count(result.invited);
  const skipped = count(result.skipped);
  const left = skipped > 0 ? ` ${skipped} left out.` : "";
  if (invited > 0) return `${invited} invited.${left}`;
  return `Nobody new to invite.${left}`;
}

export type CrewInviteFailureKind =
  | "peopleClosed"
  | "gone"
  | "closed"
  | "age"
  | "name"
  | "paused"
  | "ended"
  | "plansPaused"
  | "plansClosed"
  | "signIn"
  | "noSignal"
  | "fault";

export interface CrewInviteFailure {
  kind: CrewInviteFailureKind;
  line: string;
  /** Whether Try again can help. */
  retry: boolean;
  /** For `closed`: why the plan takes no more invites. */
  reason?: PlanClosedReason;
}

/**
 * Thrown by the invite hook in place of a 404 once the releases, read again,
 * say plans is closed to this reader while People is open. The API answers
 * that state 404 (decision A: never success), and the picker says the same.
 */
export class PlansShutError extends Error {
  constructor() {
    super("Plans is closed to this reader.");
    this.name = "PlansShutError";
  }
}

function planClosedReason(error: YuvoyError): PlanClosedReason {
  const r = error.details.reason;
  return r === "started" || r === "cancelled" || r === "done" || r === "closed"
    ? r
    : "closed";
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
 * What a failed invite says. A 404 is never success (decision A): once the
 * hook has read the releases again it is People closed (`PeopleShutError`),
 * plans closed (`PlansShutError`) or the plan is not there, and nobody was
 * invited.
 */
export function crewInviteFailure(error: unknown): CrewInviteFailure {
  if (error instanceof PeopleShutError) {
    return { kind: "peopleClosed", line: PEOPLE_SHUT_LINE, retry: false };
  }
  if (error instanceof PlansShutError) {
    return {
      kind: "plansClosed",
      line: CREW_INVITE_WORDS.plansClosed,
      retry: false,
    };
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
    return { kind: "gone", line: CREW_INVITE_WORDS.gone, retry: false };
  }
  if (error.status === 409 && error.code === "plan_closed") {
    const reason = planClosedReason(error);
    return {
      kind: "closed",
      line: said(error, PLAN_CLOSED_WORDS[reason]),
      retry: false,
      reason,
    };
  }
  if (error.status === 409 && error.code === "name_required") {
    return { kind: "name", line: PEOPLE_FAILURE_WORDS.name, retry: false };
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
  // Only the plans store's own 503. Any other 503 is a fault with Try again.
  if (error.status === 503 && error.code === "plans_unavailable") {
    return {
      kind: "plansPaused",
      line: CREW_INVITE_WORDS.plansPaused,
      retry: true,
    };
  }
  if (error.status === 401) {
    return { kind: "signIn", line: PEOPLE_FAILURE_WORDS.signIn, retry: false };
  }
  // A 400 is this app sending something wrong: the same request again cannot help.
  if (error.status === 400) {
    return { kind: "fault", line: PEOPLE_FAILURE_WORDS.fault, retry: false };
  }
  return { kind: "fault", line: PEOPLE_FAILURE_WORDS.fault, retry: true };
}

/**
 * What the plan picker says when `GET /me/plans` fails: a 404 is the plans
 * release closed to this traveller (not "no plans", which is a 200 with an
 * empty list); a 503 plans_unavailable is plans paused. Anything else offers
 * Try again.
 */
export function planPickerLine(error: unknown): {
  line: string;
  retry: boolean;
} {
  if (error instanceof YuvoyError && error.status === 404) {
    return { line: CREW_INVITE_WORDS.plansClosed, retry: false };
  }
  if (
    error instanceof YuvoyError &&
    error.status === 503 &&
    error.code === "plans_unavailable"
  ) {
    return { line: CREW_INVITE_WORDS.plansPaused, retry: true };
  }
  if (error instanceof YuvoyError && error.status === 401) {
    return { line: PEOPLE_FAILURE_WORDS.signIn, retry: false };
  }
  if (error instanceof NetworkError) {
    return { line: PEOPLE_FAILURE_WORDS.noSignal, retry: true };
  }
  return { line: PEOPLE_FAILURE_WORDS.fault, retry: true };
}
