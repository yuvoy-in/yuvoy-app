import type { PlanReplyBody, PlanView } from "./types";
import { planWords } from "./words";

/**
 * A reader's reply while they are still making it, and the one request it
 * becomes (yuvoy-app#193, yuvoy-mobile#373).
 *
 * ## Why one form and one "Update my reply"
 *
 * `PlanReply` is a whole reply: "answers, claims and paid are complete sets;
 * anything left out is cleared". A page that sent each tap on its own would
 * have to send the whole reply on every tap anyway, and a tap that raced the
 * one before it could clear what that one set. So the page keeps the reply
 * here, the reader changes as much as they like, and one button sends it.
 * The issue's tests ask for exactly one PUT per change, and that is what this
 * gives: one press, one request, whatever was changed.
 *
 * The draft starts from `me`, so a reader who changes one answer sends every
 * other answer, claim and paid mark exactly as they were. That is the only
 * thing that makes a complete set safe to send.
 */

export type TimeAnswer = "can" | "maybe" | "cant";

export interface ReplyDraft {
  /** Time id to answer. A time with no entry is not answered. */
  answers: Record<string, TimeAnswer>;
  /** The idea this reader voted for, if any. One vote per person. */
  vote: string | null;
  /** Item ids this reader is bringing. */
  claims: string[];
  /** Cost ids this reader has marked paid. */
  paid: string[];
  /** The "I am 18 or older" tick, when it is asked for. */
  adult: boolean;
}

export function draftFromPlan(plan: PlanView): ReplyDraft {
  const answers: Record<string, TimeAnswer> = {};
  let vote: string | null = null;
  for (const { optionId, answer } of plan.me?.answers ?? []) {
    if (answer === "vote") vote = optionId;
    else answers[optionId] = answer;
  }
  // `mine` is the API's word on what this reader holds; `me.claims` says the
  // same. Both read, so a plan answered without one still fills the form.
  const claims = new Set(plan.me?.claims ?? []);
  for (const item of plan.items) if (item.mine) claims.add(item.id);
  const paid = new Set(plan.me?.paid ?? []);
  for (const cost of plan.costs) if (cost.mine?.paidMarked) paid.add(cost.id);
  return {
    answers,
    vote,
    claims: [...claims],
    paid: [...paid],
    adult: false,
  };
}

/**
 * Whether the age tick is asked for: a first reply with no session, and the
 * first reply of a member Yuvoy holds no age for. Both read as "no `me`, or a
 * `me` that has not confirmed". Never on a paid-only reply, which is the only
 * one taken once replies close, and never of the planner, who confirmed it
 * making the plan and is not a member whose age the contract asks about.
 */
export function needsAdultTick(plan: PlanView): boolean {
  return (
    plan.canReply && plan.role !== "planner" && plan.me?.adultConfirmed !== true
  );
}

/** Whether there is anything this reader can send at all. */
export function canSendReply(plan: PlanView): boolean {
  return plan.canReply || plan.costs.some((cost) => cost.mine !== undefined);
}

/**
 * The request, or the one line that says why it cannot go yet. The second is
 * the age tick: the API would refuse it with the same sentence, so the page
 * says it first rather than spending a request to hear it.
 */
export function bodyFromDraft(
  plan: PlanView,
  draft: ReplyDraft,
): { body: PlanReplyBody } | { problem: { field: "adult"; message: string } } {
  const costIds = new Set(plan.costs.map((cost) => cost.id));
  const paid = draft.paid.filter((id) => costIds.has(id));

  // Replies are closed: only a paid-only reply is taken, and it must carry
  // nothing else, or the API reads it as a reply and refuses it as started.
  if (!plan.canReply) return { body: { paid } };

  if (needsAdultTick(plan) && !draft.adult) {
    return { problem: { field: "adult", message: planWords.adultNeeded } };
  }

  // Only options the plan still has. A time, idea or item removed since the
  // page loaded is left out rather than sent: the API would refuse the whole
  // reply over one option it no longer has.
  const ideaIds = new Set(plan.ideas.map((idea) => idea.id));
  const itemIds = new Set(plan.items.map((item) => item.id));

  const answers: NonNullable<PlanReplyBody["answers"]> = [];
  for (const time of plan.times) {
    const answer = draft.answers[time.id];
    if (answer) answers.push({ optionId: time.id, answer });
  }
  if (draft.vote && ideaIds.has(draft.vote)) {
    answers.push({ optionId: draft.vote, answer: "vote" });
  }

  const body: PlanReplyBody = {
    answers,
    claims: draft.claims.filter((id) => itemIds.has(id)),
    paid,
  };
  if (needsAdultTick(plan)) body.adult = true;
  return { body };
}
