import { EXPERIENCE_DETAIL, mockNow } from "./fixtures";
import type { components } from "../src/lib/api/schema.gen";
import type { BookingMessage, MockReservation } from "./booking-support";

/*
  The booking mocks' answer and conversation helpers, moved word for word
  from booking-handlers.ts (yuvoy-app#243): what an answer records or is
  refused for, the questions a party was asked, the seeded conversation,
  why writing is shut, and the contact-detail rules.
*/
type Experience = components["schemas"]["Experience"];

type MockQuestion = NonNullable<Experience["questions"]>[number];

/**
 * What the server would actually record from a sent `answers` list.
 *
 * Everything that "does not fit" is dropped silently, because that is what the
 * contract says happens: "an answer that does not fit is not recorded and
 * never refuses the checkout on its own; it leaves its question unanswered".
 * A mock that accepted anything would hide a client sending a `choice` value
 * that is not one of the options - which is exactly the silent loss the
 * controls in `question-fields.tsx` are shaped to prevent.
 *
 * Case is ignored on `yes_no` and `choice`, as `POST /bookings/answers` says.
 */
export function recordAnswers(
  questions: readonly MockQuestion[],
  sent: readonly unknown[],
): Record<string, string> {
  const byId = new Map(questions.map((q) => [q.id, q]));
  const out: Record<string, string> = {};
  for (const entry of sent) {
    if (!entry || typeof entry !== "object") continue;
    const { questionId, answer } = entry as {
      questionId?: unknown;
      answer?: unknown;
    };
    if (typeof questionId !== "string" || typeof answer !== "string") continue;
    const question = byId.get(questionId);
    if (!question) continue;
    if (answer.length > 300) continue;
    if (question.answerType === "yes_no") {
      const lower = answer.toLowerCase();
      if (lower !== "yes" && lower !== "no") continue;
      out[questionId] = lower;
      continue;
    }
    if (question.answerType === "choice") {
      const match = (question.options ?? []).find(
        (o) => o.toLowerCase() === answer.toLowerCase(),
      );
      if (!match) continue;
      out[questionId] = match;
      continue;
    }
    out[questionId] = answer;
  }
  return out;
}

/**
 * What `POST /bookings/answers` refuses, keyed as the API keys it: by the
 * answer's place in the list sent, `answers[0].answer`. An answer holding a
 * phone number, an email address or a link carries the API's sentence and
 * `answers[0].contactDetail` (yuvoy-api#282 item 5). Anything here means
 * nothing is saved.
 */
export function answerProblems(
  questions: readonly MockQuestion[],
  sent: readonly unknown[],
): Record<string, string> {
  const problems: Record<string, string> = {};
  const seen = new Set<string>();
  sent.forEach((entry, i) => {
    const at = `answers[${i}]`;
    const { questionId, answer } = (entry ?? {}) as {
      questionId?: unknown;
      answer?: unknown;
    };
    const id = typeof questionId === "string" ? questionId.trim() : "";
    const question = questions.find((q) => q.id === id);
    if (!question) {
      problems[`${at}.questionId`] = "not a question this booking asks";
      return;
    }
    if (seen.has(id)) {
      problems[`${at}.questionId`] =
        "this question is answered twice in one request";
      return;
    }
    seen.add(id);
    const kind =
      question.answerType === "short_text" && typeof answer === "string"
        ? contactDetailIn(answer.trim())
        : null;
    if (kind) {
      problems[`${at}.answer`] = answerContactRefusal(kind);
      problems[`${at}.contactDetail`] = kind;
      return;
    }
    if (Object.keys(recordAnswers([question], [entry])).length === 0) {
      problems[`${at}.answer`] = "does not fit this question";
    }
  });
  return problems;
}

/**
 * Every question this party was asked, as the status page shows them.
 *
 * The listing's current questions first, in its order, then anything this
 * party answered that it no longer asks, with `current: false`.
 */
export function partyQuestions(record: MockReservation) {
  const questions = record.slug
    ? (EXPERIENCE_DETAIL[record.slug]?.questions ?? [])
    : [];
  const answers = record.answers ?? {};
  const current = questions.map((q) => ({
    questionId: q.id,
    text: q.text,
    answerType: q.answerType,
    ...(q.options ? { options: q.options } : {}),
    required: q.required,
    current: true,
    answered: answers[q.id] !== undefined,
    ...(answers[q.id] !== undefined
      ? { answer: answers[q.id], answeredAt: new Date(mockNow()).toISOString() }
      : {}),
  }));
  const known = new Set(questions.map((q) => q.id));
  const retired = Object.entries(answers)
    .filter(([id]) => !known.has(id))
    .map(([id, answer]) => ({
      questionId: id,
      text: "A question this trip no longer asks.",
      answerType: "short_text" as const,
      required: false,
      current: false,
      answered: true,
      answer,
      answeredAt: new Date(mockNow()).toISOString(),
    }));
  return [...current, ...retired];
}

/**
 * The conversation on a booking.
 *
 * Seeded with enough from the business to exercise every shape the panel has
 * to draw, and ids are ordered strings so "newer than the marker" is a string
 * comparison rather than a date parse.
 *
 * `?__scenario=long-thread` seeds 60, which is past the 50 a page holds, so
 * "See earlier messages" and the cursor are reachable by hand.
 * `?__scenario=text-removed` seeds one carrying `textRemovedAt` in place of
 * `text` - the case that must render as a message whose text was removed and
 * never as a blank bubble.
 */
export function conversation(
  record: MockReservation,
  scenario: string,
): BookingMessage[] {
  const from = record.slug ? "Sample Dive Operator" : "Sample Dive Operator";
  const seeded: BookingMessage[] = [];
  const count = scenario === "long-thread" ? 60 : 2;
  for (let i = 0; i < count; i++) {
    seeded.push({
      id: `msg_${String(i).padStart(4, "0")}_s`,
      from: "operator",
      senderName: from,
      text: `Message ${i + 1} from the boat.`,
      sentAt: new Date(mockNow() - (count - i) * 60_000).toISOString(),
    });
  }
  if (scenario === "text-removed") {
    seeded.push({
      id: "msg_9998_s",
      from: "operator",
      senderName: from,
      // Exactly one of `text` and `textRemovedAt`, never both, never neither.
      textRemovedAt: "2026-11-20T00:00:00Z",
      sentAt: new Date(mockNow() - 30_000).toISOString(),
    });
  }
  return [...seeded, ...(record.messages ?? [])];
}

/** Why writing is shut, or `undefined` while it is open. */
export function closedReasonFor(
  record: MockReservation,
  scenario: string,
): "not_booked" | "cancelled" | "declined" | "window_closed" | undefined {
  if (scenario === "messages-window-closed") return "window_closed";
  if (scenario === "cancelled") return "cancelled";
  if (scenario === "declined") return "declined";
  if (record.released) return "cancelled";
  /*
    A link whose hold or request never became a booking. It answers an empty,
    complete conversation with `canWrite: false`, "not an error" - which is
    the case a client is most likely to have treated as a failure.
  */
  if (!record.cashBooked && !record.paid) return "not_booked";
  return undefined;
}

export function closedSentence(reason: string): string {
  switch (reason) {
    case "not_booked":
      return "There is no booking behind this link yet, so there is nobody to write to. Messages open once the booking is made.";
    case "cancelled":
      return "This booking was cancelled, so no more messages can be sent. The conversation can still be read.";
    case "declined":
      return "This booking was declined, so no more messages can be sent. The conversation can still be read.";
    default:
      return "Messages close seven days after a trip ends, and this one has closed. The conversation can still be read.";
  }
}

/**
 * The server's D-051 rules, as `internal/contactdetail` writes them at the
 * pinned contract. The APP does not re-implement these; this is the other
 * side, and it is exact so a screen is tested against what the API refuses.
 *
 * Since yuvoy-api#282 item 5 the same rules screen answers too, and three
 * kinds of digits are set aside before a phone number is counted: a date
 * (14.09.2026), a span of clock times with no colon (0830-0930) and a code
 * that runs from letters into digits (Z1234567). A bare run of ten digits is
 * still a number.
 */
export function contactDetailIn(
  text: string,
): "phone" | "email" | "link" | null {
  if (/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/.test(text)) {
    return "email";
  }
  if (
    /(https?:\/\/|www\.|\b[a-z0-9-]+\.(com|in|net|org|io|co|me)\b)/i.test(text)
  ) {
    return "link";
  }
  const digits = text
    .replace(
      /\b(?:(?:0?[1-9]|[12]\d|3[01])[./-](?:0?[1-9]|[12]\d|3[01])[./-](?:\d{4}|\d{2})|\d{4}[./-](?:0?[1-9]|1[0-2])[./-](?:0?[1-9]|[12]\d|3[01]))\b/g,
      "_",
    )
    .replace(
      /\b(?:[01]\d|2[0-3])[0-5]\d\s*-\s*(?:[01]\d|2[0-3])[0-5]\d\b/g,
      "_",
    )
    .replace(/\b[A-Za-z]+\d[A-Za-z0-9]*\b/g, "_");
  return /(?:\d[\s\-().]*){7,}/.test(digits) ? "phone" : null;
}

/** The API's sentence for an answer holding one, without the answer. */
export function answerContactRefusal(kind: "phone" | "email" | "link"): string {
  const what =
    kind === "email"
      ? "an email address"
      : kind === "link"
        ? "a link"
        : "a phone number, from seven or more digits written close together";
  return `an answer cannot include a phone number, an email address or a link, and this one looks like it has ${what}. Write it another way`;
}
