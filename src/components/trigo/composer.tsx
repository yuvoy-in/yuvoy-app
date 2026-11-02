"use client";

import { useId, type KeyboardEvent, type Ref } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { TRIGO_DRAFT_MAX, writeDraft, type TrigoDraft } from "@/lib/trigo/keys";
import {
  COMPOSER_NOTE,
  REMAINING_SHOWN_AT,
  remainingLine,
} from "@/lib/trigo/words";
import { COMPOSER_LABEL, SEND, SENDING, charactersLeft } from "./ui-words";

/** The count shows from here: 1,000 is the most, and a cut-off is a surprise. */
const COUNT_FROM = 900;

/**
 * Where the traveller writes to Trigo.
 *
 * ## The text and its key live in sessionStorage
 *
 * Every change is written with `writeDraft`, which keeps the key while the
 * text is unchanged and mints a new one when it changes. So a retry of the
 * same words sends the same `Idempotency-Key` and the API answers once, and
 * a reload or a sign-in round trip finds the words still here (R5-T5, the
 * booking idempotency lifecycle).
 *
 * ## Focus stays here
 *
 * The field is never disabled, only read-only while a turn is out, so the
 * caret never leaves it: a disabled field drops focus to the page. Send is
 * the one control that turns off (offline, a turn out, the day's limit), and
 * a tap on it hands focus back to the field.
 */
export function Composer({
  value,
  onChange,
  onSend,
  sendOff,
  busy,
  remaining,
  fieldRef,
}: {
  value: string;
  onChange: (text: string) => void;
  /** The text and the key to send it with. */
  onSend: (draft: TrigoDraft) => void;
  /** Offline, at the limit, or a state that cannot take a turn. */
  sendOff: boolean;
  /** A turn is out: the field holds still until it answers. */
  busy: boolean;
  remaining: number | null;
  fieldRef?: Ref<HTMLTextAreaElement>;
}) {
  const noteId = useId();
  const empty = value.trim().length === 0;
  const off = sendOff || busy || empty;

  const change = (text: string) => {
    const next = text.slice(0, TRIGO_DRAFT_MAX);
    writeDraft(next);
    onChange(next);
  };

  const send = () => {
    if (off) return;
    const draft = writeDraft(value);
    if (draft) onSend(draft);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    // Enter sends, Shift+Enter is a new line, and never mid-composition:
    // an IME for Hindi or Telugu uses Enter to pick a word.
    if (e.key !== "Enter" || e.shiftKey || e.nativeEvent.isComposing) return;
    e.preventDefault();
    send();
  };

  const left = TRIGO_DRAFT_MAX - value.length;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        send();
      }}
    >
      {remaining !== null && remaining > 0 && remaining <= REMAINING_SHOWN_AT ? (
        <p className="text-forest/75 label mb-2">{remainingLine(remaining)}</p>
      ) : null}
      <div className="flex items-end gap-2">
        <Textarea
          ref={fieldRef}
          aria-label={COMPOSER_LABEL}
          aria-describedby={noteId}
          value={value}
          rows={2}
          maxLength={TRIGO_DRAFT_MAX}
          readOnly={busy}
          onChange={(e) => change(e.target.value)}
          onKeyDown={onKeyDown}
          className="rounded-control border-paper-line bg-paper-deep text-forest focus:border-forest/60 focus:bg-paper ease-interaction w-full resize-none border px-4 py-3 text-base transition-[border-color,background-color] duration-200 outline-none"
        />
        <Button
          type="submit"
          size="md"
          disabled={off}
          pending={busy}
          pendingLabel={SENDING}
          onMouseDown={(e) => e.preventDefault()}
        >
          {SEND}
        </Button>
      </div>
      <p id={noteId} className="text-forest/70 label mt-2">
        {COMPOSER_NOTE}
        {left <= TRIGO_DRAFT_MAX - COUNT_FROM ? (
          <span className="ml-2">{charactersLeft(left)}</span>
        ) : null}
      </p>
    </form>
  );
}
