"use client";

import { useRef, useState } from "react";
import { useChangedBeforeHydration } from "@/lib/react/use-changed-before-hydration";
import type { PlanActions, PlanReportBody, PlanView } from "@/lib/plans/types";
import { planWords } from "@/lib/plans/words";
import { Button } from "@/components/ui/button";
import { Sheet, SheetPresence } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";

type Reason = PlanReportBody["reason"];
const REASONS: readonly Reason[] = [
  "unsafe",
  "harassment",
  "spam",
  "impersonation",
  "other",
];
/** The contract's ceiling on `note`. */
const NOTE_MAX = 300;

/**
 * Reporting a plan, or somebody on it, to a person at Yuvoy (yuvoy-app#193;
 * `reportPlan`, `PlanReport`).
 *
 * The words are drafts until yuvoy-api#418 Q18 is answered; the shape is the
 * contract's: one of five reasons, an optional first name from the plan, and
 * an optional note only staff read. `202` has no body, so a sent report
 * changes nothing on the plan and the sheet just says thanks.
 *
 * The person list is the plan's own first names, never typed: the API
 * refuses a name that is not on the plan (`details.personName`), and a list
 * cannot hold one. The reader is left out of it.
 *
 * It takes only `people` from the plan, which is all it reads, so the
 * guest page's "not working" page can offer it with no plan at all
 * (`{ people: [] }`, yuvoy-mobile#373 case 16): a removed guest has no plan
 * to read, and the report is then about the plan as a whole.
 */
export function PlanReport({
  plan,
  report,
  label,
  onGone,
}: {
  plan: Pick<PlanView, "people">;
  report: NonNullable<PlanActions["report"]>;
  label: string;
  onGone: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="ghost" className="mt-2" onClick={() => setOpen(true)}>
        {label}
      </Button>
      <SheetPresence open={open}>
        <ReportSheet
          plan={plan}
          report={report}
          title={label}
          open={open}
          onClose={() => setOpen(false)}
          onGone={onGone}
        />
      </SheetPresence>
    </>
  );
}

function ReportSheet({
  plan,
  report,
  title,
  open,
  onClose,
  onGone,
}: {
  plan: Pick<PlanView, "people">;
  report: NonNullable<PlanActions["report"]>;
  title: string;
  open: boolean;
  onClose: () => void;
  onGone: () => void;
}) {
  const [reason, setReason] = useState<Reason | null>(null);
  const [person, setPerson] = useState("");
  const [note, setNote] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  // Drawn only after a tap, so nothing is typed before it hydrates; asked
  // anyway, as every form here is, in case a later change draws it sooner.
  useChangedBeforeHydration(formRef, (fields) => {
    for (const field of fields) {
      if (field.name === "reason" && field instanceof HTMLInputElement) {
        const r = REASONS.find((x) => x === field.value);
        if (field.checked && r) setReason(r);
      }
      if (field.name === "person") setPerson(field.value);
      if (field.name === "note") setNote(field.value);
    }
  });

  const names = [
    ...new Set(plan.people.filter((p) => !p.you).map((p) => p.name)),
  ];

  async function send() {
    if (sending || !reason) return;
    setSending(true);
    setProblem(null);
    try {
      const body: PlanReportBody = { reason };
      if (person) body.personName = person;
      if (note.trim()) body.note = note.trim().slice(0, NOTE_MAX);
      const result = await report(body);
      if (result.kind === "sent" || result.kind === "ok") setSent(true);
      else if (result.kind === "gone") {
        onClose();
        onGone();
      } else if (
        result.code === "invalid_input" &&
        result.reason === "personName"
      ) {
        setProblem(planWords.reportPersonUnknown);
      } else if (result.code === "rate_limited") {
        setProblem(planWords.reportTooFast);
      } else {
        setProblem(planWords.reportNotSent);
      }
    } finally {
      setSending(false);
    }
  }

  if (sent) {
    return (
      <Sheet
        open={open}
        onClose={onClose}
        title={title}
        footer={
          <Button block size="lg" variant="outline" onClick={onClose}>
            {planWords.reportClose}
          </Button>
        }
      >
        <p role="status" className="text-body text-pretty">
          {planWords.reportSent}
        </p>
      </Sheet>
    );
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={title}
      footer={
        <Button
          block
          size="lg"
          type="submit"
          form="plan-report"
          disabled={!reason}
          pending={sending}
          pendingLabel={planWords.reportSending}
        >
          {planWords.reportSend}
        </Button>
      }
    >
      <form
        id="plan-report"
        ref={formRef}
        className="space-y-6"
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
      >
        <fieldset>
          <legend className="label text-forest/75">
            {planWords.reportWhy}
          </legend>
          <div className="mt-3 space-y-3">
            {REASONS.map((r) => (
              <label key={r} className="flex items-start gap-3">
                <input
                  type="radio"
                  name="reason"
                  value={r}
                  checked={reason === r}
                  onChange={() => setReason(r)}
                  className="accent-terra-deep size-6 shrink-0"
                />
                <span>{planWords.reportReason[r]}</span>
              </label>
            ))}
          </div>
        </fieldset>

        {names.length > 0 ? (
          <div>
            <label
              htmlFor="plan-report-person"
              className="label text-forest/75"
            >
              {planWords.reportPerson}
            </label>
            <select
              id="plan-report-person"
              name="person"
              value={person}
              onChange={(e) => setPerson(e.currentTarget.value)}
              className="border-paper-line bg-paper-deep text-forest rounded-control mt-2 h-12 w-full border px-4 text-base"
            >
              <option value="">{planWords.reportWholePlan}</option>
              {names.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </div>
        ) : null}

        <div>
          <label htmlFor="plan-report-note" className="label text-forest/75">
            {planWords.reportNote}
          </label>
          <Textarea
            id="plan-report-note"
            name="note"
            value={note}
            maxLength={NOTE_MAX}
            rows={4}
            aria-describedby="plan-report-note-hint"
            onChange={(e) => setNote(e.currentTarget.value)}
            className="border-paper-line bg-paper-deep text-forest rounded-control mt-2 w-full border p-4 text-base"
          />
          <p id="plan-report-note-hint" className="text-forest/70 mt-1 text-sm">
            {planWords.reportNoteHint}
          </p>
        </div>

        {problem ? (
          <p role="alert" className="text-terra-deep text-sm">
            {problem}
          </p>
        ) : null}
      </form>
    </Sheet>
  );
}
