import { YuvoyError } from "@/lib/api/errors";
import type { components } from "@/lib/api/schema.gen";

type ListingQuestion = components["schemas"]["ListingQuestion"];
type PartyQuestion = components["schemas"]["PartyQuestion"];
type BookingAnswer = components["schemas"]["BookingAnswer"];

/**
 * The listing's own questions, and what a form is allowed to do with them.
 *
 * Every rule here is the contract's, and each one is a refusal or a lost
 * answer if a form gets it wrong:
 *
 *   - **`answers` is sent whenever the listing asks anything, even empty.**
 *     Omitted, "nothing about questions is checked, the listing's required
 *     ones included": the booking is made and every question reads as not
 *     answered yet on the operator's manifest. Sending it is what makes a
 *     required question count.
 *   - **An answer that does not fit is silently not recorded.** It "never
 *     refuses the checkout on its own: it only leaves its question
 *     unanswered". So a `choice` answer that is not one of `options`, or a
 *     `yes_no` that is not `yes` or `no`, costs the traveller their answer
 *     with nothing on screen to say so. The controls are therefore built so
 *     that a wrong answer cannot come out of them: a select and two radios,
 *     never free text.
 *   - **300 characters.** Enforced on the input, not trimmed at submit, so
 *     nobody types four hundred and loses a hundred of them without knowing.
 *
 * The predicates live here rather than in the form because the checkout and
 * the booking page apply the same ones to two different shapes, and because a
 * rule about what the server will accept is worth a unit test of its own.
 */

/** The longest answer the API records. Anything past it is dropped. */
export const ANSWER_MAX = 300;

/** `POST /bookings/answers` takes 1 to 10 answers in one call. */
export const ANSWERS_PER_SAVE = 10;

/** One draft answer per question id, as a form holds it. */
export type AnswerDraft = Record<string, string>;

/** Whether a draft holds something worth sending. */
export function isAnswered(value: string | undefined): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

/**
 * A question no control can put a valid answer into.
 *
 * A `choice` question is answered with "exactly one of `options`", and
 * `options` is optional in the schema. With none, every control we could draw
 * produces an answer the server will not record. If such a question is also
 * `required`, sending `answers` refuses the checkout with a `409` the
 * traveller has no way to satisfy: a permanently dead Book button, caused by
 * a field an operator mis-saved.
 *
 * This should never fire. It is written because the alternative to handling it
 * is the yuvoy-app#28 defect again, and that one stopped every booking in the
 * product for a month.
 */
export function isUnanswerable(question: ListingQuestion): boolean {
  return (
    question.answerType === "choice" &&
    !(question.options && question.options.length > 0)
  );
}

/** The questions a form can actually draw a control for. */
export function answerableQuestions(
  questions: readonly ListingQuestion[],
): ListingQuestion[] {
  return questions.filter((q) => !isUnanswerable(q));
}

/**
 * Whether the checkout may send `answers` at all.
 *
 * Sending it is what turns required questions on. If the listing carries a
 * REQUIRED question this form cannot answer, sending `answers` buys a refusal
 * nobody can clear, so the body omits it: nothing about questions is checked,
 * the booking goes through, and the traveller answers from the booking link
 * afterwards. That is the contract's own fallback, and it is strictly better
 * than a checkout that cannot finish.
 *
 * A merely optional unanswerable question does not suppress anything. It is
 * left out of the body and the operator chases it, exactly as an unanswered
 * optional question already is.
 */
export function canEnforceAnswers(
  questions: readonly ListingQuestion[],
): boolean {
  return !questions.some((q) => q.required && isUnanswerable(q));
}

/**
 * The required questions this draft has not answered.
 *
 * The form's own blocker, and deliberately the same test the server applies:
 * `409 answers_required` on a checkout is a refusal the client can predict,
 * and predicting it saves a traveller on island signal a round trip and a
 * scroll back up a form they thought they had finished.
 */
export function unansweredRequired(
  questions: readonly ListingQuestion[],
  draft: AnswerDraft,
): ListingQuestion[] {
  return answerableQuestions(questions).filter(
    (q) => q.required && !isAnswered(draft[q.id]),
  );
}

/**
 * The `answers` a checkout sends.
 *
 * Blank drafts are left out rather than sent as empty strings. An empty
 * `answer` is an answer that "does not fit", so the server would drop it and
 * leave the question unanswered anyway; leaving it out says the same thing
 * with one less way to be surprised.
 *
 * The result is part of the request body, so it is inside the idempotency
 * fingerprint (`fingerprintBody`) without anything here arranging that.
 * Changing an answer mints a new key, which is right: it is a different
 * booking request, and replaying the old key would hand back a reservation
 * carrying the answers the traveller just corrected.
 */
export function toBookingAnswers(
  questions: readonly ListingQuestion[],
  draft: AnswerDraft,
): BookingAnswer[] {
  const out: BookingAnswer[] = [];
  for (const q of answerableQuestions(questions)) {
    const value = draft[q.id]?.trim();
    if (!value) continue;
    out.push({ questionId: q.id, answer: value.slice(0, ANSWER_MAX) });
  }
  return out;
}

/**
 * The question ids a `409 answers_required` named.
 *
 * `details.questions` is "`{ questionId: string, text: string }[]`, in the
 * listing's order. Point at each one." Read defensively, because this is one
 * of the few places a server `details` blob decides what a form marks: a shape
 * that is not what the contract says must leave the traveller with the plain
 * refusal rather than take checkout to the error boundary.
 */
export function answersRequiredIds(error: unknown): string[] {
  if (!(error instanceof YuvoyError)) return [];
  if (error.code !== "answers_required") return [];
  const raw = (error.details as { questions?: unknown }).questions;
  if (!Array.isArray(raw)) return [];
  return raw
    .map((entry) =>
      entry && typeof entry === "object"
        ? (entry as { questionId?: unknown }).questionId
        : undefined,
    )
    .filter((id): id is string => typeof id === "string");
}

/* ------------------------------------------------ the booking page's side */

/**
 * A `PartyQuestion` seen as a `ListingQuestion`, so one set of controls draws
 * both. The two carry the same question under two key names, `id` and
 * `questionId`, because one is asked and the other is answered.
 */
export function asListingQuestion(question: PartyQuestion): ListingQuestion {
  return {
    id: question.questionId,
    text: question.text,
    answerType: question.answerType,
    ...(question.options ? { options: question.options } : {}),
    required: question.required,
  };
}

/**
 * The questions the booking page may still take an answer to.
 *
 * `current: false` means "the listing no longer asks it, and it cannot be
 * answered again" -- those stay on screen, with their words and their answer,
 * and without a control.
 */
export function answerableNow(
  questions: readonly PartyQuestion[],
): PartyQuestion[] {
  return questions.filter(
    (q) => q.current && !isUnanswerable(asListingQuestion(q)),
  );
}

/**
 * What a save sends: the current questions whose draft differs from what is
 * already recorded.
 *
 * Only the changed ones, because "questions left out keep what they had". A
 * resent identical answer is a write that means nothing, and on a listing with
 * more than ten questions it would spend the per-call budget on answers nobody
 * touched.
 */
export function changedAnswers(
  questions: readonly PartyQuestion[],
  draft: AnswerDraft,
): BookingAnswer[] {
  const out: BookingAnswer[] = [];
  for (const q of answerableNow(questions)) {
    const value = draft[q.questionId];
    if (value === undefined) continue;
    const next = value.trim();
    if (!next) continue;
    if (next === (q.answer ?? "")) continue;
    out.push({ questionId: q.questionId, answer: next.slice(0, ANSWER_MAX) });
  }
  return out;
}

/**
 * A save, split to the call's limit.
 *
 * The listing's own `questions` has no cap and `POST /bookings/answers` takes
 * at most ten, so a save of more goes in batches. Each batch is atomic in
 * itself and each answer carries the whole set back, so a later batch failing
 * leaves the screen showing exactly what was saved rather than what was typed.
 */
export function batchAnswers(
  answers: readonly BookingAnswer[],
): BookingAnswer[][] {
  const out: BookingAnswer[][] = [];
  for (let i = 0; i < answers.length; i += ANSWERS_PER_SAVE) {
    out.push(answers.slice(i, i + ANSWERS_PER_SAVE));
  }
  return out;
}
