import { describe, it, expect } from "vitest";
import { YuvoyError } from "@/lib/api/errors";
import {
  ANSWER_MAX,
  answerableNow,
  answersHoldContactDetails,
  answersRequiredIds,
  answersRequiredReasons,
  asListingQuestion,
  batchAnswers,
  canEnforceAnswers,
  changedAnswers,
  isUnanswerable,
  refusedAnswerReasons,
  refusedForContactDetails,
  toBookingAnswers,
  unansweredRequired,
} from "./answers";
import type { components } from "@/lib/api/schema.gen";

type ListingQuestion = components["schemas"]["ListingQuestion"];
type PartyQuestion = components["schemas"]["PartyQuestion"];

const yesNo: ListingQuestion = {
  id: "q_dived",
  text: "Has everyone dived before?",
  answerType: "yes_no",
  required: true,
};
const choice: ListingQuestion = {
  id: "q_agency",
  text: "Which agency?",
  answerType: "choice",
  options: ["PADI", "SSI"],
  required: false,
};
const text: ListingQuestion = {
  id: "q_hotel",
  text: "Which hotel?",
  answerType: "short_text",
  required: false,
};

describe("what the checkout sends", () => {
  it("leaves a blank draft out rather than sending an empty answer", () => {
    // An empty `answer` "does not fit", so the server drops it and leaves the
    // question unanswered. Omitting it says the same thing with one less way
    // to be surprised.
    expect(
      toBookingAnswers([yesNo, text], { q_dived: "yes", q_hotel: "   " }),
    ).toEqual([{ questionId: "q_dived", answer: "yes" }]);
  });

  it("keeps the listing's order, not the draft's", () => {
    const sent = toBookingAnswers([yesNo, choice, text], {
      q_hotel: "Sea View",
      q_agency: "SSI",
      q_dived: "no",
    });
    expect(sent.map((a) => a.questionId)).toEqual([
      "q_dived",
      "q_agency",
      "q_hotel",
    ]);
  });

  it("never sends more than the 300 characters the API records", () => {
    const [sent] = toBookingAnswers([text], { q_hotel: "x".repeat(400) });
    expect(sent.answer).toHaveLength(ANSWER_MAX);
  });
});

describe("the blocker that predicts the 409", () => {
  it("names a required question with nothing in it", () => {
    expect(unansweredRequired([yesNo, choice], {})).toEqual([yesNo]);
  });

  it("counts whitespace as unanswered", () => {
    expect(unansweredRequired([yesNo], { q_dived: " \n " })).toEqual([yesNo]);
  });

  it("lets an optional question through unanswered", () => {
    expect(unansweredRequired([choice, text], {})).toEqual([]);
  });
});

describe("a question no control can answer", () => {
  const brokenRequired: ListingQuestion = {
    id: "q_broken",
    text: "Pick one",
    answerType: "choice",
    required: true,
  };

  it("is a choice question the operator saved with no options", () => {
    expect(isUnanswerable(brokenRequired)).toBe(true);
    expect(isUnanswerable({ ...brokenRequired, options: [] })).toBe(true);
    expect(isUnanswerable(choice)).toBe(false);
    expect(isUnanswerable(yesNo)).toBe(false);
  });

  /*
    The load-bearing one. Sending `answers` turns required questions on, so a
    required question nothing can answer would refuse every checkout with a
    409 the traveller has no way to clear: a permanently dead Book button,
    which is the yuvoy-app#28 defect that stopped all booking for a month.
  */
  it("stops the checkout enforcing answers at all when it is required", () => {
    expect(canEnforceAnswers([yesNo, brokenRequired])).toBe(false);
    expect(unansweredRequired([brokenRequired], {})).toEqual([]);
  });

  it("changes nothing when it is merely optional", () => {
    expect(
      canEnforceAnswers([yesNo, { ...brokenRequired, required: false }]),
    ).toBe(true);
  });
});

describe("reading the refusal", () => {
  function refusal(details: Record<string, unknown>) {
    return new YuvoyError({
      code: "answers_required",
      message: "no",
      status: 409,
      details,
    });
  }

  it("names each question the server pointed at", () => {
    expect(
      answersRequiredIds(
        refusal({
          questions: [
            { questionId: "q_dived", text: "Has everyone dived before?" },
          ],
        }),
      ),
    ).toEqual(["q_dived"]);
  });

  /*
    Defensive because this is one of the few places a server `details` blob
    decides what a form marks. A shape that is not what the contract says must
    leave the traveller with the plain refusal, never take checkout to the
    error boundary.
  */
  it("gives nothing rather than throwing on a details blob it did not expect", () => {
    expect(answersRequiredIds(refusal({}))).toEqual([]);
    expect(answersRequiredIds(refusal({ questions: "all of them" }))).toEqual(
      [],
    );
    expect(answersRequiredIds(refusal({ questions: [null, 7, {}] }))).toEqual(
      [],
    );
    expect(answersRequiredIds(new Error("nope"))).toEqual([]);
    expect(answersRequiredIds(undefined)).toEqual([]);
  });

  it("ignores a different code carrying the same details", () => {
    const other = new YuvoyError({
      code: "capacity_unavailable",
      message: "no",
      status: 409,
      details: { questions: [{ questionId: "q_dived", text: "x" }] },
    });
    expect(answersRequiredIds(other)).toEqual([]);
  });
});

/*
  An answer holding a phone number, an email address or a link is refused,
  never dropped (yuvoy-api#282 item 5), with the API's reason to show beside
  it. These are the API's own sentences at the pinned contract.
*/
describe("why an answer was not taken", () => {
  const CONTACT =
    "an answer cannot include a phone number, an email address or a link, and this one looks like it has a link. Write it another way";

  it("reads a checkout refusal's reason per question, as a sentence", () => {
    const error = new YuvoyError({
      code: "answers_required",
      message: "Some answers need another look before you can book.",
      status: 409,
      details: {
        questions: [
          {
            questionId: "q_hotel",
            text: "Which hotel?",
            reason: CONTACT,
            contactDetail: "link",
          },
          { questionId: "q_dived", text: "Has everyone dived before?" },
        ],
      },
    });
    expect(answersRequiredIds(error)).toEqual(["q_hotel", "q_dived"]);
    expect([...answersRequiredReasons(error)]).toEqual([
      [
        "q_hotel",
        "An answer cannot include a phone number, an email address or a link, and this one looks like it has a link. Write it another way.",
      ],
    ]);
    expect(answersHoldContactDetails(error)).toBe(true);
  });

  it("gives a choice no longer offered its reason, and a blank one none", () => {
    const error = new YuvoyError({
      code: "answers_required",
      message:
        "Some questions this trip asks need an answer before you can book.",
      status: 409,
      details: {
        questions: [
          {
            questionId: "q_agency",
            text: "Which agency?",
            reason: "that choice is no longer offered, pick again",
          },
        ],
      },
    });
    expect(answersRequiredReasons(error).get("q_agency")).toBe(
      "That choice is no longer offered, pick again.",
    );
    expect(answersHoldContactDetails(error)).toBe(false);
  });

  it("strips a long dash the API's details still carry", () => {
    const error = new YuvoyError({
      code: "answers_required",
      message: "no",
      status: 409,
      details: {
        questions: [
          {
            questionId: "q_hotel",
            text: "x",
            reason: "not that \u2014 pick again",
          },
        ],
      },
    });
    expect(answersRequiredReasons(error).get("q_hotel")).not.toMatch(
      /[\u2013\u2014\u2015]/,
    );
  });

  it("maps a booking link's refusal back to the questions in the batch sent", () => {
    const error = new YuvoyError({
      code: "invalid_input",
      message: "some of these answers need fixing",
      status: 400,
      details: {
        "answers[1].answer": CONTACT,
        "answers[1].contactDetail": "link",
        // A place the batch does not have names nothing here.
        "answers[7].answer": "does not fit this question",
      },
    });
    const sent = [
      { questionId: "q_dived", answer: "yes" },
      { questionId: "q_hotel", answer: "see arrived.in" },
    ];
    expect([...refusedAnswerReasons(error, sent)]).toEqual([
      [
        "q_hotel",
        "An answer cannot include a phone number, an email address or a link, and this one looks like it has a link. Write it another way.",
      ],
    ]);
    expect(refusedForContactDetails(error)).toBe(true);
  });

  it("reads nothing from another refusal", () => {
    const closed = new YuvoyError({
      code: "answers_closed",
      message: "no",
      status: 409,
      details: { "answers[0].answer": CONTACT },
    });
    expect(
      refusedAnswerReasons(closed, [{ questionId: "q", answer: "a" }]).size,
    ).toBe(0);
    expect(refusedForContactDetails(closed)).toBe(false);
    expect(answersRequiredReasons(new Error("no")).size).toBe(0);
    expect(answersHoldContactDetails(undefined)).toBe(false);
  });
});

describe("the booking page's side", () => {
  const party: PartyQuestion[] = [
    {
      questionId: "q_dived",
      text: "Has everyone dived before?",
      answerType: "yes_no",
      required: true,
      current: true,
      answered: true,
      answer: "yes",
    },
    {
      questionId: "q_hotel",
      text: "Which hotel?",
      answerType: "short_text",
      required: false,
      current: true,
      answered: false,
    },
    {
      questionId: "q_gone",
      text: "A question this trip no longer asks.",
      answerType: "short_text",
      required: false,
      current: false,
      answered: true,
      answer: "Something",
    },
  ];

  it("offers a control only for the questions the listing still asks", () => {
    expect(answerableNow(party).map((q) => q.questionId)).toEqual([
      "q_dived",
      "q_hotel",
    ]);
  });

  it("sends only what changed, because what is left out keeps what it had", () => {
    expect(
      changedAnswers(party, { q_dived: "yes", q_hotel: "Sea View" }),
    ).toEqual([{ questionId: "q_hotel", answer: "Sea View" }]);
  });

  it("sends a genuine correction to an already-answered question", () => {
    expect(changedAnswers(party, { q_dived: "no" })).toEqual([
      { questionId: "q_dived", answer: "no" },
    ]);
  });

  it("never sends an answer to a question that can no longer take one", () => {
    expect(changedAnswers(party, { q_gone: "Changed my mind" })).toEqual([]);
  });

  it("carries a party question across to the shared controls", () => {
    expect(asListingQuestion(party[0])).toEqual({
      id: "q_dived",
      text: "Has everyone dived before?",
      answerType: "yes_no",
      required: true,
    });
  });

  it("splits a save at the ten the call accepts", () => {
    const many = Array.from({ length: 23 }, (_, i) => ({
      questionId: `q${i}`,
      answer: "x",
    }));
    const batches = batchAnswers(many);
    expect(batches.map((b) => b.length)).toEqual([10, 10, 3]);
    expect(batches.flat()).toEqual(many);
  });

  it("makes no batch out of nothing", () => {
    expect(batchAnswers([])).toEqual([]);
  });
});
