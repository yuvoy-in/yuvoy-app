"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { Middleware } from "openapi-fetch";
import { api, createProxyClient } from "@/lib/api/client";
import { YuvoyError } from "@/lib/api/errors";
import { Button } from "@/components/ui/button";
import { Sheet, SheetPresence } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { CheckIcon } from "@/components/ui/icons";
import { cn } from "@/lib/cn";
import { hideCard } from "@/lib/found/device-store";
import { recordFound } from "@/lib/found/found-outcomes";
import type { components } from "@/lib/api/schema.gen";

type EventReport = components["schemas"]["EventReport"];
type EventReportReceipt = components["schemas"]["EventReportReceipt"];
export type ReportReason = EventReport["reason"];

/**
 * The seven reasons, in the contract's order, in the words the sheet offers
 * them in (R2-T4; mobile's `REPORT_REASONS` in `packages/core/src/explore/
 * report.ts` is the same table).
 */
export const REPORT_REASONS: readonly { key: ReportReason; label: string }[] =
  Object.freeze([
    { key: "wrong_date", label: "The date or time is wrong" },
    { key: "wrong_place", label: "It's in a different place" },
    { key: "wrong_price", label: "The price is wrong" },
    { key: "cancelled", label: "It's cancelled or has ended" },
    { key: "broken_link", label: "The link doesn't work" },
    { key: "not_appropriate", label: "It shouldn't be on Yuvoy" },
    { key: "other", label: "Something else" },
  ]);

/** A note is at most this long; the API counts characters, not bytes. */
export const REPORT_NOTE_MAX = 500;
/** With "Something else" the note says what is wrong, in at least this many. */
export const REPORT_OTHER_NOTE_MIN = 3;
/** How long Send rests after reports went too fast (R2-T4 note, 6.5). */
export const REPORT_TOO_FAST_MS = 3_000;

/**
 * How a send failed:
 *   - `day_limit`: a 429 with `Retry-After`, a day's limit reached. Not again
 *     today, so Send stays held.
 *   - `too_fast`: a 429 without it. The same report can go in a moment.
 *   - `gone`: a 404, the card is no longer showing to this person.
 *   - `unsent`: anything else (no signal, a 503). The form stays as it was.
 */
export type ReportFailure = "day_limit" | "too_fast" | "gone" | "unsent";

/**
 * The sheet's words (R2-T4), kept here rather than in `found-words.ts`
 * because only this sheet says them. `noteNeeded` and `tooFast` are mobile's
 * own lines, used as they are so the two surfaces read alike; both wait on the
 * owner's copy approval with the rest of R2.
 */
export const REPORT_WORDS = Object.freeze({
  title: "Report a problem",
  question: "What's wrong with this card?",
  note: "Anything else we should know? (optional)",
  noteNeeded: "Anything else we should know?",
  noteHint: "Tell us what's wrong.",
  send: "Send report",
  sending: "Sending",
  done: "Done",
  failures: {
    day_limit: "You've sent a lot of reports today. Try again tomorrow.",
    too_fast: "Too many requests. Try again shortly.",
    gone: "This card is no longer showing.",
    unsent: "That didn't send. Check your connection and try again.",
  } satisfies Record<ReportFailure, string>,
});

/** The receipt's second line, when the API gave a reference. */
export function referenceLine(reference: string): string {
  return `Your reference is ${reference}. You'll see what we did in Help.`;
}

/** Characters, as the API counts them, after the spaces round the note go. */
function noteLength(note: string): number {
  return [...note.trim()].length;
}

/** A reason, and with "Something else" a note of three characters or more. */
export function reportReady(reason: ReportReason | null, note: string) {
  if (reason === null) return false;
  const length = noteLength(note);
  if (length > REPORT_NOTE_MAX) return false;
  return reason !== "other" || length >= REPORT_OTHER_NOTE_MIN;
}

/**
 * The body: the contract's closed `EventReport`, a reason and a note when
 * there is one. Never an id of the device: the API answers a body that still
 * carries `deviceId` with a 400, and nothing else belongs here either.
 */
export function reportBody(reason: ReportReason, note: string): EventReport {
  const trimmed = note.trim();
  return trimmed ? { reason, note: trimmed } : { reason };
}

/**
 * Report a problem with a found card (yuvoy-app#179; the API's R2-T2, `POST
 * /events/{id}/reports`).
 *
 * One of seven reasons, a note (needed for "Something else"), Send report.
 * Sent, the receipt is the API's own `message` word for word, then the
 * reference when a signed-in reporter with a number was given one.
 *
 * ## Signed in through the proxy, signed out straight to the API
 *
 * Signed in, the report counts against the person (twenty a day) and may
 * take an unchecked card out of view for everyone, so it goes through this
 * app's own `/api/v1` with the session attached. Signed out it goes direct,
 * with no credential at all, and is counted per address.
 *
 * ## When the card leaves this device's lists
 *
 * On `hidden: you`, and on every receipt to somebody signed out (the API
 * always answers `you` then, and says to hide it here). `hideCard` puts the
 * id on the device's hidden list and tells an open feed at once; `onHidden`
 * is the caller's turn. `hidden: everyone` needs neither: the API has taken
 * it out of every list already.
 *
 * ## Two kinds of 429
 *
 * Past a day's limit the API sets `Retry-After`, and the sheet says so and
 * holds Send. Sent too fast there is none: mobile's line, and Send rests for
 * three seconds before the same report may go again (R2-T4 note, 6.5). The
 * header is read off the response by a middleware on this one request,
 * because the client's error middleware throws on a 429 before any caller
 * could see the response it came on.
 *
 * Every other failure keeps the reason and the note, to send again.
 */
export function ReportSheet({
  itemId,
  open,
  onOpenChange,
  signedIn,
  onHidden,
  surface = "found_detail",
}: {
  itemId: string;
  open: boolean;
  onOpenChange(open: boolean): void;
  signedIn: boolean;
  onHidden(): void;
  /**
   * Where `problem_reported` is counted. The card's page by default, as
   * mobile counts every report; the feed may say `found_feed`.
   */
  surface?: "found_feed" | "found_detail";
}) {
  return (
    <SheetPresence open={open}>
      <ReportForm
        itemId={itemId}
        signedIn={signedIn}
        surface={surface}
        onHidden={onHidden}
        onClose={() => onOpenChange(false)}
      />
    </SheetPresence>
  );
}

/** Mounted afresh on every opening, so each report starts clean. */
function ReportForm({
  itemId,
  signedIn,
  surface,
  onHidden,
  onClose,
}: {
  itemId: string;
  signedIn: boolean;
  surface: "found_feed" | "found_detail";
  onHidden(): void;
  onClose(): void;
}) {
  const name = useId();
  const hintId = useId();
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [note, setNote] = useState("");
  /** Set by a send that was not ready, so the field does not scold early. */
  const [tried, setTried] = useState(false);
  const [sending, setSending] = useState(false);
  const [failure, setFailure] = useState<ReportFailure | null>(null);
  const [resting, setResting] = useState(false);
  const [receipt, setReceipt] = useState<EventReportReceipt | null>(null);

  // An answer that lands after the sheet was closed changes nothing on it.
  const live = useRef(true);
  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
    };
  }, []);

  // Sent too fast: Send rests a moment, then the same report may go again.
  useEffect(() => {
    if (!resting) return;
    const timer = setTimeout(() => setResting(false), REPORT_TOO_FAST_MS);
    return () => clearTimeout(timer);
  }, [resting]);

  const other = reason === "other";
  const short = other && noteLength(note) < REPORT_OTHER_NOTE_MIN;
  const held = failure === "day_limit" || failure === "gone";

  const choose = (next: ReportReason) => {
    setReason(next);
    // A day's limit and a card gone stand whatever is chosen; anything else
    // was about the report as it was.
    if (!held) setFailure(null);
  };

  const send = async () => {
    if (!reason || sending || resting || held) return;
    if (!reportReady(reason, note)) {
      setTried(true);
      return;
    }
    setFailure(null);
    setSending(true);

    const seen: { retryAfter: string | null } = { retryAfter: null };
    const watch: Middleware = {
      onResponse({ response }) {
        if (response.status === 429) {
          seen.retryAfter = response.headers.get("Retry-After");
        }
        return undefined;
      },
    };

    try {
      const client = signedIn ? createProxyClient() : api;
      const { data, error } = await client.POST("/events/{id}/reports", {
        params: { path: { id: itemId } },
        body: reportBody(reason, note),
        middleware: [watch],
      });
      if (error) throw error;
      if (!data) throw new Error("The report answer had no body.");

      recordFound("problem_reported", itemId, surface);
      if (data.hidden === "you" || !signedIn) {
        try {
          await hideCard(itemId);
        } catch {
          // The device would not keep it. The receipt stands regardless.
        }
        onHidden();
      }
      if (live.current) setReceipt(data);
    } catch (cause) {
      if (!live.current) return;
      const how = failureOf(cause, seen.retryAfter);
      setFailure(how);
      if (how === "too_fast") setResting(true);
    } finally {
      if (live.current) setSending(false);
    }
  };

  if (receipt) {
    return (
      <Sheet
        open
        onClose={onClose}
        title={REPORT_WORDS.title}
        footer={
          <Button block onClick={onClose}>
            {REPORT_WORDS.done}
          </Button>
        }
      >
        <div
          role="status"
          className="rounded-card bg-paper-deep border-forest/12 flex items-start gap-3 border p-4"
        >
          <CheckIcon className="text-forest mt-0.5" />
          <div className="min-w-0 flex-1">
            <p className="text-body text-pretty">{receipt.message}</p>
            {receipt.reference ? (
              <p className="text-body mt-3 text-pretty">
                {referenceLine(receipt.reference)}
              </p>
            ) : null}
          </div>
        </div>
      </Sheet>
    );
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title={REPORT_WORDS.title}
      footer={
        <Button
          block
          pending={sending}
          pendingLabel={REPORT_WORDS.sending}
          disabled={!reason || resting || held}
          onClick={() => void send()}
        >
          {REPORT_WORDS.send}
        </Button>
      }
    >
      <fieldset>
        <legend className="label text-forest/75">{REPORT_WORDS.question}</legend>
        <div className="mt-2 flex flex-col gap-2">
          {REPORT_REASONS.map((option) => {
            const on = reason === option.key;
            return (
              <label
                key={option.key}
                className={cn(
                  "rounded-card ease-interaction flex cursor-pointer items-center gap-3 border px-4 py-3 text-sm transition-[border-color,background-color] duration-200",
                  on
                    ? "border-forest bg-paper-deep ring-forest ring-1"
                    : "border-paper-line hover:border-forest/40",
                )}
              >
                <input
                  type="radio"
                  name={name}
                  value={option.key}
                  checked={on}
                  onChange={() => choose(option.key)}
                  className="accent-forest size-5 shrink-0"
                />
                <span>{option.label}</span>
              </label>
            );
          })}
        </div>
      </fieldset>

      <label className="mt-5 block">
        <span className="label text-forest/75">
          {other ? REPORT_WORDS.noteNeeded : REPORT_WORDS.note}
        </span>
        <Textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={4}
          maxLength={REPORT_NOTE_MAX}
          required={other}
          aria-invalid={tried && short}
          aria-describedby={other ? hintId : undefined}
          className="rounded-control border-paper-line bg-paper-deep focus:border-forest/60 focus:bg-paper ease-interaction mt-2 w-full border px-3.5 py-3 text-base transition-colors duration-200 outline-none"
        />
      </label>
      {other ? (
        <p
          id={hintId}
          role={tried && short ? "alert" : undefined}
          className={cn(
            "mt-1.5 text-xs",
            tried && short ? "text-terra-deep font-bold" : "text-forest/70",
          )}
        >
          {REPORT_WORDS.noteHint}
        </p>
      ) : null}

      {failure ? (
        <p
          role="alert"
          className="rounded-control bg-terra-deep/8 text-terra-deep mt-4 px-3.5 py-3 text-sm font-medium"
        >
          {REPORT_WORDS.failures[failure]}
        </p>
      ) : null}
    </Sheet>
  );
}

/** What a failed send was, from the error and the `Retry-After` it came with. */
function failureOf(cause: unknown, retryAfter: string | null): ReportFailure {
  if (cause instanceof YuvoyError) {
    if (cause.status === 404) return "gone";
    if (cause.status === 429) {
      return retryAfter && retryAfter.trim() ? "day_limit" : "too_fast";
    }
  }
  return "unsent";
}
