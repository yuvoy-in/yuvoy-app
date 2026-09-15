"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createApiClient } from "@/lib/api/client";
import { describeError, FailurePanel } from "@/components/states";
import { qk } from "@/lib/query/policy";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";
import { QuestionFields } from "@/components/checkout/question-fields";
import {
  answerableNow,
  asListingQuestion,
  batchAnswers,
  changedAnswers,
  type AnswerDraft,
} from "@/lib/booking/answers";
import type { components } from "@/lib/api/schema.gen";

type BookingStatus = components["schemas"]["BookingStatus"];
type PartyQuestion = components["schemas"]["PartyQuestion"];

/**
 * What the operator asked, and what this party answered - yuvoy-app#46 §4.
 *
 * A traveller can reach checkout without answering: `answers` is only sent
 * when the form could ask properly, and an optional question can simply be
 * skipped. So the booking link is the second chance, and the contract builds
 * the screen for it: every question this party was asked, answered or not, in
 * the listing's order, with the words they were asked rather than the words
 * the listing carries today.
 *
 * ## `answersOpen` is told, never inferred
 *
 * "Told rather than inferred, so a form is never offered that would be
 * refused." It is `true` while the booking is going ahead and its departure
 * has not left. Nothing here derives that from `state` and `slot.startsAt`,
 * which would be two clocks disagreeing across a timezone, and would offer a
 * form on the morning after a trip that the server answers `409
 * answers_closed`.
 *
 * ## A question the listing no longer asks
 *
 * `current: false` means exactly that, and "it cannot be answered again". It
 * still renders, with its own words and its answer, because an answer this
 * party gave is theirs and a screen that hides it looks like it lost it. It
 * gets no control.
 *
 * ## The answer replaces, and only what changed is sent
 *
 * "Each answer replaces this party's earlier answer to the same question" and
 * "questions left out keep what they had", so every current question is an
 * editable control prefilled from what is recorded, and Save sends the ones
 * that differ. One mode rather than two, and a correction costs no more than
 * a first answer.
 */
export function BookingQuestions({
  token,
  questions,
  answersOpen,
}: {
  token: string;
  questions: readonly PartyQuestion[];
  answersOpen: boolean;
}) {
  const qc = useQueryClient();
  /*
    Drafts are keyed by question id and start EMPTY rather than seeded from
    the recorded answers. `changedAnswers` treats an absent draft as untouched,
    so an unseeded map means "nothing to save" on arrival, which is the truth.
    Seeding would make the Save button's enabled state depend on string
    equality against a value the server may have normalised.
  */
  const [draft, setDraft] = useState<AnswerDraft>({});

  const open = answerableNow(questions);
  const past = questions.filter((q) => !q.current);

  const save = useMutation({
    retry: false,
    mutationFn: async () => {
      const client = createApiClient();
      /*
        Batched, because the call takes 1 to 10 and the listing's own
        `questions` has no cap. Sequential rather than parallel: each answer
        replaces, so two in flight against the same question would land in
        whichever order the network chose. The LAST answer wins and is what
        the screen then shows, since every response carries the whole set.
      */
      let latest: PartyQuestion[] | null = null;
      for (const batch of batchAnswers(changedAnswers(questions, draft))) {
        const { data, error } = await client.POST("/bookings/answers", {
          headers: { Authorization: `Bearer ${token}` },
          body: { answers: batch },
        });
        if (error) throw error;
        latest = data.questions;
      }
      return latest;
    },
    onSuccess: (saved) => {
      if (!saved) return;
      /*
        The action's own result, not a refetch.

        `POST /bookings/answers` answers with "every question and answer for
        this party, as the status page shows them" - the same array the status
        response carries - so a refetch would ask for what is already in hand.
        It also has to be written rather than merely rendered locally: this
        booking may be `final`, in which case the poller has stopped and a
        refetch is the ONLY thing that would ever update the cache again.
      */
      qc.setQueryData(qk.bookingStatus(token), (prev?: BookingStatus) =>
        prev ? { ...prev, questions: saved } : prev,
      );
      // The drafts have landed, so nothing is pending any more.
      setDraft({});
    },
  });

  const pending = changedAnswers(questions, draft);
  const unanswered = open.filter((q) => !q.answered).length;

  return (
    <Panel className="mt-8">
      <section aria-labelledby="booking-questions">
        <h2 id="booking-questions" className="label text-forest/75">
          What the operator asked
        </h2>

        {answersOpen && open.length > 0 ? (
          <>
            <QuestionFields
              className="mt-4"
              questions={open.map(asListingQuestion)}
              draft={{ ...recordedAnswers(open), ...draft }}
              onChange={(id, value) =>
                setDraft((prev) => ({ ...prev, [id]: value }))
              }
              legend={
                unanswered > 0
                  ? "Still to answer"
                  : "Your answers, if anything has changed"
              }
              intro="These go to the operator running the trip. You can change an answer up until the departure leaves."
            />

            <Button
              variant="outline"
              size="sm"
              className="mt-5"
              disabled={pending.length === 0 || save.isPending}
              onClick={() => save.mutate()}
            >
              {save.isPending ? "Saving…" : "Save answers"}
            </Button>

            {/*
              Quiet, and only after a save. The screen already shows the
              answers beside their questions, so this is a receipt rather than
              a state - and it never appears before somebody has done anything.
            */}
            {save.isSuccess && pending.length === 0 ? (
              <p role="status" className="text-forest/70 mt-3 text-sm">
                Saved. The operator can see this.
              </p>
            ) : null}
          </>
        ) : (
          <AnswerList questions={open} closed />
        )}

        {save.error ? (
          <FailurePanel
            failure={describeError(save.error, { tokenBearing: true })}
            className="mt-4"
          />
        ) : null}

        {/*
          Questions the listing has stopped asking. Kept with the words this
          party was asked, because the answer is theirs and a screen that drops
          it looks like it lost it.
        */}
        {past.length > 0 ? (
          <div className="border-paper-line mt-6 border-t pt-5">
            <p className="text-forest/70 text-xs">
              Asked when you booked. This trip no longer asks these.
            </p>
            <AnswerList questions={past} className="mt-3" />
          </div>
        ) : null}
      </section>
    </Panel>
  );
}

/** Every question and its answer, with no control. */
function AnswerList({
  questions,
  className,
  closed,
}: {
  questions: readonly PartyQuestion[];
  className?: string;
  /** Answers are shut, so say why an unanswered one will stay that way. */
  closed?: boolean;
}) {
  if (questions.length === 0) return null;
  return (
    <dl className={className ?? "mt-4"}>
      {questions.map((q) => (
        <div key={q.questionId} className="mt-3 first:mt-0">
          <dt className="text-forest/70 text-sm">{q.text}</dt>
          <dd className="mt-0.5 text-sm font-bold">
            {q.answered && q.answer
              ? q.answer
              : closed
                ? "Not answered, and this one is closed now."
                : "Not answered."}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/** What the server has recorded, as a draft the controls can start from. */
function recordedAnswers(questions: readonly PartyQuestion[]): AnswerDraft {
  const out: AnswerDraft = {};
  for (const q of questions) {
    if (q.answered && q.answer) out[q.questionId] = q.answer;
  }
  return out;
}
