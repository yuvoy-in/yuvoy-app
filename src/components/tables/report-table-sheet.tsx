"use client";

import { useState } from "react";
import { YuvoyError } from "@/lib/api/errors";
import { cn } from "@/lib/cn";
import { useReportTable, type TableReport } from "@/lib/tables/use-table";
import { REPORT_REASONS, TABLE_WORDS } from "@/lib/tables/table-words";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Sheet } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";

const W = TABLE_WORDS.report;

/** The contract's own bounds, in characters after trimming. */
const NAME_MAX = 30;
const NOTE_MAX = 300;

/**
 * Reporting a table, or somebody at it (yuvoy-app#194).
 *
 * The body is `reason`, `personName` and `note` and nothing else: the server
 * reads it strictly and refuses a field it does not know. The two optional
 * fields go only when something was typed in them, trimmed, so an empty box
 * is never sent as an empty string.
 *
 * Never paused on the server, so the paused state offers it too. `202` has no
 * body: the receipt is ours, and it says who reads it and how soon. `429`
 * comes with no `Retry-After`, so there is no countdown, only "send it again
 * in a moment".
 */
export function ReportTableSheet({
  id,
  onClose,
}: {
  id: string;
  onClose: () => void;
}) {
  const send = useReportTable(id);
  const [reason, setReason] = useState<TableReport["reason"] | null>(null);
  const [personName, setPersonName] = useState("");
  const [note, setNote] = useState("");
  /** Set only after a submit, so the reasons do not scold before a tap. */
  const [tried, setTried] = useState(false);

  const tooFast = send.error instanceof YuvoyError && send.error.status === 429;

  if (send.isSuccess) {
    return (
      <Sheet open onClose={onClose} title={W.title}>
        <p role="status" className="text-body text-pretty">
          {W.sent}
        </p>
      </Sheet>
    );
  }

  const submit = () => {
    setTried(true);
    if (!reason) return;
    const name = personName.trim().slice(0, NAME_MAX);
    const said = note.trim().slice(0, NOTE_MAX);
    send.mutate({
      reason,
      ...(name ? { personName: name } : {}),
      ...(said ? { note: said } : {}),
    });
  };

  return (
    <Sheet
      open
      onClose={onClose}
      title={W.title}
      footer={
        <Button
          block
          pending={send.isPending}
          pendingLabel={W.sending}
          onClick={submit}
        >
          {W.send}
        </Button>
      }
    >
      <fieldset>
        <legend className="label text-forest/75">{W.reasonLegend}</legend>
        <div className="mt-2 flex flex-wrap gap-2">
          {REPORT_REASONS.map((option) => (
            <button
              key={option.key}
              type="button"
              aria-pressed={reason === option.key}
              onClick={() => setReason(option.key)}
              className={cn(
                "rounded-control ease-interaction tap-target border px-3 py-2 text-sm transition-colors duration-200",
                reason === option.key
                  ? "border-forest bg-forest text-paper"
                  : "border-paper-line bg-paper text-forest hover:border-forest/40",
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
        {tried && !reason ? (
          <p role="alert" className="text-terra-deep mt-2 text-sm">
            {W.reasonMissing}
          </p>
        ) : null}
      </fieldset>

      <Field
        className="mt-5"
        label={W.personName}
        value={personName}
        onChange={(e) => setPersonName(e.target.value)}
        maxLength={NAME_MAX}
        autoComplete="off"
      />

      <label className="mt-5 block">
        <span className="label text-forest/75">{W.note}</span>
        <Textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={4}
          maxLength={NOTE_MAX}
          className="rounded-control border-paper-line bg-paper focus:border-forest/60 ease-interaction mt-2 w-full border px-4 py-3 text-base transition-colors duration-200 outline-none"
        />
      </label>

      {tooFast ? (
        <p role="alert" className="text-terra-deep mt-3 text-sm">
          {W.tooFast}
        </p>
      ) : send.error ? (
        <p role="alert" className="text-terra-deep mt-3 text-sm">
          {send.error instanceof YuvoyError ? send.error.message : W.failed}
        </p>
      ) : null}
    </Sheet>
  );
}
