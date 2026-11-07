import { describeError } from "@/components/states";
import { YuvoyError } from "@/lib/api/errors";
import {
  answersRequiredIds,
  answersRequiredReasons,
  unansweredRequired,
  type AnswerDraft,
} from "@/lib/booking/answers";
import { formatMoney } from "@/lib/format/money";
import { civilFromDate, weekdayDayMonth } from "@/lib/format/date";
import type { GateView } from "@/components/auth/invite-gate";
import type { Standing } from "@/lib/site/access";
import type { AgeBand } from "./screening-fields";
import type { components } from "@/lib/api/schema.gen";

type Experience = components["schemas"]["Experience"];
type Slot = components["schemas"]["Slot"];
type Money = components["schemas"]["Money"];

/**
 * The body of the form's `blockers` memo: what must still be done before the
 * button does anything, in the words the bar says them.
 */
export function checkoutBlockers({
  needsName,
  needsPhone,
  name,
  whatsapp,
  policyAccepted,
  safety,
  declaredClear,
  ageBands,
  guests,
  enforceAnswers,
  questions,
  answers,
}: {
  needsName: boolean;
  needsPhone: boolean;
  name: string;
  whatsapp: string;
  policyAccepted: boolean;
  safety: Experience["safety"];
  declaredClear: boolean | undefined;
  ageBands: (AgeBand | undefined)[];
  guests: number;
  enforceAnswers: boolean;
  questions: NonNullable<Experience["questions"]>;
  answers: AnswerDraft;
}): string[] {
  const out: string[] = [];
  /*
    Only the fields the form is still SHOWING (yuvoy-app#32). A signed-in
    traveller has no name box and no number box, so demanding either leaves
    Pay permanently dead under "still needs your name" on a form that does
    not ask for one.

    `phoneGiven` rather than a non-empty check: `PhoneField` seeds the value
    with a dial code, so "+91" alone is not a number.
  */
  if (needsName && !name.trim()) out.push("your name");
  if (needsPhone && whatsapp.replace(/\D/g, "").length <= 4) {
    out.push("a WhatsApp number");
  }
  if (!policyAccepted) out.push("the cancellation policy");
  if (safety?.screener && declaredClear === undefined) {
    // Omitted is not false: the form must not let this through.
    out.push("the health check");
  }
  if (safety?.minAge) {
    const filled = ageBands.slice(0, guests).filter(Boolean).length;
    if (filled < guests) out.push("an age range for everyone");
  }
  /*
    Refused here rather than by the server. The same test produces
    `409 answers_required`, so predicting it saves a traveller on island
    signal a round trip and a scroll back up a form they thought was done.
    Only when the body will actually carry `answers`: with nothing sent,
    nothing is required, and a blocker would be a button dead for no reason.
  */
  if (enforceAnswers && unansweredRequired(questions, answers).length > 0) {
    out.push("the operator's questions");
  }
  return out;
}

/**
 * What a refused booking says, read from `create.error`: the panel, the
 * questions and fields it names, and whether the sign-in ended.
 */
export function readCheckoutFailure(error: unknown) {
  const failure = error ? describeError(error) : null;
  /*
    The questions a `409 answers_required` named, marked in place. The panel
    below says what happened; this says WHICH, which is the part a traveller
    can act on without reading the form again from the top.
  */
  const flaggedQuestions = answersRequiredIds(error);
  // And why, beside each one whose answer was sent and not taken.
  const answerReasons = answersRequiredReasons(error);
  const capacityError =
    error instanceof YuvoyError && error.code === "capacity_unavailable"
      ? error
      : null;
  /*
    The two refusals about WHO is booking (yuvoy-app#32), handled the same way
    as in the Ask pop-up.

    `400` with `details["contact.name"]` is a profile with no name on record,
    and the sentence belongs on the field it concerns. `401` is a session that
    ended mid-form; `refresh` re-asks the server so the block flips back to
    both fields rather than showing "Booking as ..." over a dead session.
  */
  const whoFailure = error instanceof YuvoyError ? error : null;
  const nameRefusal =
    whoFailure?.status === 400 &&
    typeof whoFailure.details["contact.name"] === "string"
      ? (whoFailure.details["contact.name"] as string)
      : undefined;
  // The same for the number, asked of an account with none (yuvoy-app#229).
  // "required" is a key, not a sentence, so it gets ours.
  const phoneSaid =
    whoFailure?.status === 400 ? whoFailure.details["contact.whatsapp"] : null;
  const phoneRefusal =
    typeof phoneSaid === "string"
      ? phoneSaid === "required"
        ? "Add a WhatsApp number so we can send your booking."
        : phoneSaid
      : undefined;
  const sessionEnded = whoFailure?.status === 401;
  return {
    failure,
    flaggedQuestions,
    answerReasons,
    capacityError,
    nameRefusal,
    phoneRefusal,
    sessionEnded,
  };
}

/**
 * Built from what is chosen, skipping what is not, so it never reads
 * "· · 2 people". The day comes from our own tables rather than `Intl`: this
 * page is server rendered and that is the app#67 hydration case.
 */
export function checkoutSummaryLine(
  slot: Slot,
  guests: number,
  total: Money | null,
): string[] {
  const civil = civilFromDate(slot.localDate ?? "");
  return [
    civil ? weekdayDayMonth(civil) : null,
    slot.localStartTime ? slot.localStartTime.slice(0, 5) : null,
    `${guests} ${guests === 1 ? "person" : "people"}`,
    total ? formatMoney(total) : null,
  ].filter(Boolean) as string[];
}

/**
 * Which view the gate draws, from where this device stands.
 *
 * `unknown` (a `GET /me` this device could not make) draws the code screen
 * rather than nothing. That is not a refusal invented here: the API refused
 * this booking for want of an invitation, and a read that failed says
 * nothing about the number. A code is what is missing either way, and the
 * one screen that can be wrong about it, "you are in", is the one that needs
 * a yes to draw.
 */
export function gateViewFor(standing: Standing | undefined): GateView {
  return standing === undefined
    ? "checking"
    : standing === "signed-out"
      ? "signed-out"
      : standing === "admitted"
        ? "in"
        : "code";
}

/**
 * "Send request", not "Ask the operator" (yuvoy-app#62 item 7).
 *
 * The old label belonged to a pop-up on the listing page that this issue
 * deleted. On a checkout page with a day, a time, a party and their details
 * already filled in, "Ask" understates what the traveller just did: they have
 * committed to everything except the operator's yes.
 */
export function checkoutAction(
  isRequest: boolean,
  total: Money | null,
  cashAtCounter: boolean,
): string {
  return isRequest
    ? "Send request"
    : total && cashAtCounter
      ? `Book now, pay ${formatMoney(total)} cash on the day`
      : total
        ? `Book now · ${formatMoney(total)}`
        : "Book now";
}
