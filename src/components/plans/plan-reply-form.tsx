"use client";

import { useRef, useState, type ReactNode } from "react";
import {
  useChangedBeforeHydration,
  type FormField,
} from "@/lib/react/use-changed-before-hydration";
import {
  bodyFromDraft,
  canSendReply,
  draftFromPlan,
  needsAdultTick,
  type ReplyDraft,
  type TimeAnswer,
} from "@/lib/plans/reply-draft";
import { planMoment, planTimeRange, rupees } from "@/lib/plans/format";
import type { PlanActions, PlanView } from "@/lib/plans/types";
import { answerLabel, planWords, refusalLine } from "@/lib/plans/words";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";
import { UpiPayPanel } from "./upi-pay-panel";

const ANSWERS: readonly TimeAnswer[] = ["can", "maybe", "cant"];

type Outcome =
  | { kind: "sent"; notClaimed: string[] }
  | { kind: "refused"; line: string; field?: "adult" | "extra" };

/**
 * The reply: times, the vote, the bring list, paid marks and the age tick,
 * in one form with one button (yuvoy-app#193, yuvoy-mobile#373).
 *
 * One request per press, carrying the whole reply (see `reply-draft.ts` for
 * why a reply cannot be sent a tap at a time). The answer to it IS the plan,
 * so it replaces the one on screen and the form starts again from it; nothing
 * is read again.
 *
 * Once replies close (`canReply` false) the answers are still drawn, as a
 * record, but only the paid ticks can change: a paid-only reply is the one
 * the API still takes.
 *
 * A refusal keeps every answer as it was on screen and says why in a line
 * the page moves focus to. The age tick's refusal sits under the tick.
 *
 * A refusal of one of `formExtras`' own fields (`extraFields`, the guest
 * page's first name) is drawn by those fields, under the field, and focused
 * by the page that drew them; this form then draws no second copy of it.
 */
export function PlanReplyForm({
  plan,
  actions,
  signedIn,
  formExtras,
  extraFields,
  onPlan,
  onGone,
}: {
  plan: PlanView;
  actions: PlanActions;
  signedIn: boolean;
  formExtras?: ReactNode;
  /** The `invalid_input` fields `formExtras` draws its own line for. */
  extraFields?: readonly string[];
  onPlan: (plan: PlanView) => void;
  onGone: () => void;
}) {
  const [draft, setDraft] = useState<ReplyDraft>(() => draftFromPlan(plan));
  const [sending, setSending] = useState(false);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const alertRef = useRef<HTMLParagraphElement>(null);

  // Ticks and radios chosen while the server's copy was on screen and the
  // script was still on its way: taken into the draft, as a tap would be.
  useChangedBeforeHydration(formRef, (fields) =>
    setDraft((d) => fields.reduce(applyField, d)),
  );

  const open = plan.canReply;
  const decided = plan.decidedTimeId !== undefined;
  const times = decided
    ? plan.times.filter((t) => t.id === plan.decidedTimeId)
    : plan.times;
  const voting = open && !plan.decidedIdeaId && plan.ideas.length > 0;
  const askAdult = needsAdultTick(plan);
  const adultError =
    outcome?.kind === "refused" && outcome.field === "adult"
      ? outcome.line
      : undefined;

  const refuse = (line: string, field?: "adult" | "extra") => {
    setOutcome({ kind: "refused", line, field });
    // After the render that draws the line.
    requestAnimationFrame(() => alertRef.current?.focus());
  };

  async function send() {
    if (sending) return;
    const ready = bodyFromDraft(plan, draft);
    if ("problem" in ready) return refuse(ready.problem.message, "adult");
    setSending(true);
    setOutcome(null);
    try {
      const result = await actions.reply(ready.body);
      if (result.kind === "ok") {
        onPlan(result.plan);
        setDraft(draftFromPlan(result.plan));
        setOutcome({ kind: "sent", notClaimed: result.plan.notClaimed ?? [] });
      } else if (result.kind === "gone") {
        onGone();
      } else if (result.kind === "refused") {
        const invalid = result.code === "invalid_input";
        const field =
          // Under the tick when there is one; a tick this view did not draw
          // cannot carry a line, so the line goes with the rest.
          askAdult && invalid && result.reason === "adult"
            ? "adult"
            : invalid && result.reason && extraFields?.includes(result.reason)
              ? "extra"
              : undefined;
        refuse(refusalLine(result, plan.planner.name), field);
      } else {
        refuse(planWords.notSent);
      }
    } finally {
      setSending(false);
    }
  }

  const closes = plan.answersCloseAt
    ? planMoment(plan.answersCloseAt, plan.timeZone)
    : null;
  const itemLabel = (id: string) =>
    plan.items.find((i) => i.id === id)?.label ?? id;

  return (
    <form
      ref={formRef}
      className="mt-8 space-y-8"
      onSubmit={(e) => {
        e.preventDefault();
        void send();
      }}
    >
      {times.length > 0 ? (
        <fieldset>
          <legend className="font-display tracking-display leading-display text-2xl text-balance">
            {decided && times[0]
              ? planWords.areYouGoing(
                  planTimeRange(times[0].startsAt, times[0].endsAt, plan.timeZone) ?? "",
                )
              : planWords.canYouMakeIt}
          </legend>
          <div className="mt-4 space-y-4">
            {times.map((time) => {
              const range = planTimeRange(time.startsAt, time.endsAt, plan.timeZone);
              return (
                <Panel key={time.id} tone="outline">
                  <fieldset>
                    {decided ? null : (
                      <legend className="text-base">{range}</legend>
                    )}
                    <p className="text-forest/70 mt-1 text-sm tabular-nums">
                      {planWords.counts(time.counts)}
                    </p>
                    <div className="mt-3 flex flex-wrap gap-x-6 gap-y-3">
                      {ANSWERS.map((answer) => (
                        <label key={answer} className="flex items-center gap-2">
                          <input
                            type="radio"
                            name={`answer-${time.id}`}
                            value={answer}
                            checked={draft.answers[time.id] === answer}
                            disabled={!open}
                            onChange={() =>
                              setDraft((d) => ({
                                ...d,
                                answers: { ...d.answers, [time.id]: answer },
                              }))
                            }
                            className="accent-terra-deep size-6 shrink-0"
                          />
                          <span>{answerLabel(answer, decided)}</span>
                        </label>
                      ))}
                    </div>
                  </fieldset>
                </Panel>
              );
            })}
          </div>
        </fieldset>
      ) : null}

      {voting ? (
        <fieldset>
          <legend className="font-display tracking-display leading-display text-2xl text-balance">
            {planWords.whatShouldWeDo}
          </legend>
          <div className="mt-4 space-y-3">
            {plan.ideas.map((idea) => (
              <label key={idea.id} className="flex items-start gap-3">
                <input
                  type="radio"
                  name="vote"
                  value={idea.id}
                  checked={draft.vote === idea.id}
                  onChange={() => setDraft((d) => ({ ...d, vote: idea.id }))}
                  className="accent-terra-deep size-6 shrink-0"
                />
                <span>
                  <span className="block">{idea.title}</span>
                  <span className="text-forest/70 block text-sm">
                    {planWords.votes(idea.votes)}
                  </span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
      ) : null}

      {plan.items.length > 0 ? (
        <fieldset>
          <legend className="font-display tracking-display leading-display text-2xl text-balance">
            {planWords.bringList}
          </legend>
          <ul className="mt-4 space-y-3">
            {plan.items.map((item) => (
              <li key={item.id}>
                {item.claimedBy && !item.mine ? (
                  <p>
                    <span className="block">{item.label}</span>
                    <span className="text-forest/70 block text-sm">
                      {planWords.bringing(item.claimedBy)}
                    </span>
                  </p>
                ) : (
                  <label className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      name="claim"
                      value={item.id}
                      checked={draft.claims.includes(item.id)}
                      disabled={!open}
                      onChange={(e) => {
                        const on = e.currentTarget.checked;
                        setDraft((d) => ({ ...d, claims: toggled(d.claims, item.id, on) }));
                      }}
                      className="accent-terra-deep size-6 shrink-0"
                    />
                    <span>
                      <span className="block">{item.label}</span>
                      <span className="text-forest/70 block text-sm">
                        {planWords.illBringIt}
                      </span>
                    </span>
                  </label>
                )}
              </li>
            ))}
          </ul>
        </fieldset>
      ) : null}

      {plan.costs.length > 0 ? (
        <section aria-labelledby="plan-costs">
          <h2
            id="plan-costs"
            className="font-display tracking-display leading-display text-2xl text-balance"
          >
            {planWords.costs}
          </h2>
          <ul className="mt-4 space-y-4">
            {plan.costs.map((cost) => {
              const mine = cost.mine;
              // The planner paid, so the planner has nothing to send anyone.
              const owes =
                mine !== undefined &&
                cost.split &&
                mine.amountMinor > 0 &&
                plan.role !== "planner";
              return (
                <li key={cost.id}>
                  <Panel tone="outline">
                    <p>
                      {planWords.costLine(cost.label, rupees(cost.amountMinor), cost.paidBy)}
                    </p>
                    {cost.split ? (
                      <p className="text-forest/70 mt-1 text-sm tabular-nums">
                        {planWords.havePaid(cost.paidCount, cost.shareCount)}
                      </p>
                    ) : null}
                    {!cost.split && plan.role !== "planner" ? (
                      <p className="text-forest/70 mt-2 text-sm">
                        {planWords.shareLater(plan.planner.name)}
                      </p>
                    ) : null}
                    {owes && mine ? (
                      <>
                        <p className="mt-3">
                          {planWords.yourShare(rupees(mine.amountMinor))}
                        </p>
                        <UpiPayPanel
                          share={mine.amountMinor}
                          payLink={mine.payLink}
                          payee={plan.payee}
                          payer={cost.paidBy}
                        />
                        <label className="mt-4 flex items-start gap-3">
                          <input
                            type="checkbox"
                            name="paid"
                            value={cost.id}
                            checked={draft.paid.includes(cost.id)}
                            onChange={(e) => {
                              const on = e.currentTarget.checked;
                              setDraft((d) => ({ ...d, paid: toggled(d.paid, cost.id, on) }));
                            }}
                            className="accent-terra-deep size-6 shrink-0"
                          />
                          <span>
                            <span className="block">{planWords.paidTick}</span>
                            <span className="text-forest/70 block text-sm">
                              {planWords.paidHint(cost.paidBy)}
                            </span>
                          </span>
                        </label>
                        {mine.receivedMarked ? (
                          <p className="mt-2 text-sm">{planWords.received(cost.paidBy)}</p>
                        ) : null}
                      </>
                    ) : null}
                  </Panel>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      {askAdult ? (
        <div>
          <label className="flex items-start gap-3">
            <input
              type="checkbox"
              name="adult"
              checked={draft.adult}
              aria-invalid={adultError ? true : undefined}
              aria-describedby={adultError ? "plan-adult-error" : undefined}
              onChange={(e) => {
                const on = e.currentTarget.checked;
                setDraft((d) => ({ ...d, adult: on }));
              }}
              className="accent-terra-deep size-6 shrink-0"
            />
            <span>{planWords.adult}</span>
          </label>
          {adultError ? (
            <p
              id="plan-adult-error"
              ref={alertRef}
              role="alert"
              tabIndex={-1}
              className="text-terra-deep mt-2 text-sm outline-none"
            >
              {adultError}
            </p>
          ) : null}
        </div>
      ) : null}

      {formExtras}

      {/* A field's refusal is drawn under its field, above; this is the rest. */}
      {outcome?.kind === "refused" && !outcome.field ? (
        <p
          ref={alertRef}
          role="alert"
          tabIndex={-1}
          className="text-terra-deep text-sm outline-none"
        >
          {outcome.line}
        </p>
      ) : null}

      <div role="status">
        {outcome?.kind === "sent" ? (
          <div className="space-y-1 text-sm">
            <p>
              {planWords.thanks(plan.me?.name ?? "")}
              {closes && plan.canReply
                ? ` ${signedIn ? planWords.changeUntil(closes) : planWords.changeFromThisPhone(closes)}`
                : null}
            </p>
            {outcome.notClaimed.map((id) => (
              <p key={id}>{planWords.takenFirst(itemLabel(id))}</p>
            ))}
          </div>
        ) : null}
      </div>

      {canSendReply(plan) ? (
        <Button
          type="submit"
          size="lg"
          block
          pending={sending}
          pendingLabel={planWords.sending}
        >
          {plan.me ? planWords.updateReply : planWords.sendReply}
        </Button>
      ) : null}
    </form>
  );
}

function toggled(list: string[], id: string, on: boolean): string[] {
  const rest = list.filter((x) => x !== id);
  return on ? [...rest, id] : rest;
}

/** One field changed before hydration, into the draft, as its tap would. */
function applyField(draft: ReplyDraft, field: FormField): ReplyDraft {
  if (!(field instanceof HTMLInputElement)) return draft;
  const { name, value, checked } = field;
  if (name.startsWith("answer-") && checked) {
    const answer = ANSWERS.find((a) => a === value);
    if (!answer) return draft;
    return { ...draft, answers: { ...draft.answers, [name.slice(7)]: answer } };
  }
  if (name === "vote" && checked) return { ...draft, vote: value };
  if (name === "claim") return { ...draft, claims: toggled(draft.claims, value, checked) };
  if (name === "paid") return { ...draft, paid: toggled(draft.paid, value, checked) };
  if (name === "adult") return { ...draft, adult: checked };
  return draft;
}
