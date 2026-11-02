"use client";

import { useId, useRef, useState } from "react";
import {
  CLUB_REPORT_REASONS,
  CLUB_REPORT_WORDS,
  type ClubReportReason,
} from "@/lib/groups/club-words";
import { clubFailure, clubReportBody, reportNeedsNote } from "@/lib/groups/clubs";
import { useReportClub } from "@/lib/groups/use-clubs";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { FormLine, FormSent, ReasonChips } from "./form-parts";

const W = CLUB_REPORT_WORDS;

/**
 * Something wrong? Tell us (yuvoy-mobile#386), for a signed-in traveller.
 * One of four reasons and "Tell us more", which "Something else" needs: the
 * label then reads "Tell us what's wrong", and Send with it empty asks for it
 * on the note and sends nothing. The listing stays as it is until a person
 * looks.
 *
 * One report goes however often Send is pressed. The answer:
 *   - 202: the API's message, and Done;
 *   - 404: the group is not shown now: its message, and Done goes back to
 *     the directory (`onLeave`);
 *   - a 400 naming the note: said on the note;
 *   - the age, name or paused refusals: said in words (no step on the web yet);
 *   - 429: the API's message, and Send stays held;
 *   - anything else: a line, with what was picked and typed kept.
 */
export function ClubReportSheet({
  clubId,
  name,
  onClose,
  onLeave,
}: {
  clubId: string;
  name: string;
  onClose: () => void;
  onLeave: () => void;
}) {
  const report = useReportClub(clubId);
  const noteId = useId();
  const [reason, setReason] = useState<ClubReportReason | null>(null);
  const [note, setNote] = useState("");
  /** Set only after a Send, so the note does not scold before a press. */
  const [tried, setTried] = useState(false);
  const [refused, setRefused] = useState<string | null>(null);
  const [line, setLine] = useState<string | null>(null);
  const [held, setHeld] = useState(false);
  const [sent, setSent] = useState<string | null>(null);
  const [gone, setGone] = useState<string | null>(null);
  const busy = useRef(false);
  const done = useRef(false);

  const noteLine =
    refused ?? (tried && reportNeedsNote(reason, note) ? W.noteMissing : null);

  const send = async () => {
    if (!reason || busy.current || done.current || held) return;
    setTried(true);
    if (reportNeedsNote(reason, note)) return;
    busy.current = true;
    setLine(null);
    setRefused(null);
    try {
      const receipt = await report.mutateAsync(clubReportBody(reason, note));
      done.current = true;
      setSent(receipt.message);
    } catch (error) {
      const why = clubFailure("report", error);
      switch (why.kind) {
        case "gone":
          done.current = true;
          setGone(why.line);
          return;
        case "fields":
          setRefused(why.fields.note ?? null);
          return;
        case "age":
        case "name":
        case "paused":
        case "limit":
          setLine(why.line);
          setHeld(true);
          return;
        default:
          setLine(why.line);
      }
    } finally {
      busy.current = false;
    }
  };

  if (gone !== null || sent !== null) {
    return (
      <Sheet
        open
        onClose={gone !== null ? onLeave : onClose}
        title={W.title(name)}
        footer={
          <Button block onClick={gone !== null ? onLeave : onClose}>
            {W.done}
          </Button>
        }
      >
        <FormSent text={gone ?? sent ?? ""} />
      </Sheet>
    );
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title={W.title(name)}
      footer={
        <Button
          block
          pending={report.isPending}
          pendingLabel={W.sending}
          disabled={!reason || held}
          onClick={() => void send()}
        >
          {W.send}
        </Button>
      }
    >
      <p className="text-body text-forest/70 mb-5 text-pretty">{W.intro}</p>

      <ReasonChips
        legend={W.reasons}
        reasons={CLUB_REPORT_REASONS}
        value={reason}
        onChange={(next) => {
          setReason(next);
          setRefused(null);
          if (!held) setLine(null);
        }}
      />

      <label className="mt-5 block">
        <span className="label text-forest/75">
          {reason === "other" ? W.noteRequired : W.note}
        </span>
        <Textarea
          value={note}
          onChange={(e) => {
            setNote(e.target.value);
            setRefused(null);
          }}
          rows={4}
          maxLength={500}
          required={reason === "other"}
          aria-invalid={noteLine ? true : undefined}
          aria-describedby={noteLine ? noteId : undefined}
          className="rounded-control border-paper-line bg-paper focus:border-forest/60 ease-interaction mt-2 w-full border px-4 py-3 text-base transition-colors duration-200 outline-none"
        />
      </label>
      {noteLine ? (
        <p id={noteId} role="alert" className="text-terra-deep mt-2 text-sm">
          {noteLine}
        </p>
      ) : null}

      <FormLine text={line} />
    </Sheet>
  );
}
