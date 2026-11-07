"use client";

import { useSyncExternalStore, type RefObject } from "react";
import type { UseMutationResult } from "@tanstack/react-query";
import { describeError, FailurePanel } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/cn";
import { civilHere, dayMonth, clockTime } from "@/lib/format/date";
import { MESSAGE_MAX, describeSendRefusal } from "@/lib/booking/messages";
import type { components } from "@/lib/api/schema.gen";

type BookingMessage = components["schemas"]["BookingMessage"];

/**
 * The composer under the conversation, drawn while `canWrite` says the
 * thread can be written in. The draft, the send and its one-at-a-time ref
 * belong to `MessageThread`, which clears the draft once a send lands.
 */
export function MessageComposer({
  draft,
  setDraft,
  send,
  sendingRef,
}: {
  draft: string;
  setDraft: (draft: string) => void;
  send: UseMutationResult<BookingMessage, Error, string>;
  sendingRef: RefObject<boolean>;
}) {
  const refusal = send.error ? describeSendRefusal(send.error) : null;
  const otherFailure =
    send.error && !refusal
      ? describeError(send.error, { tokenBearing: true })
      : null;
  const over = draft.length > MESSAGE_MAX;

  return (
    <form
      className="mt-5"
      onSubmit={(e) => {
        e.preventDefault();
        const text = draft.trim();
        if (!text || over || send.isPending || sendingRef.current) {
          return;
        }
        sendingRef.current = true;
        send.mutate(text, {
          onSettled: () => {
            sendingRef.current = false;
          },
        });
      }}
    >
      <label htmlFor="message-text" className="sr-only">
        Write to the operator
      </label>
      <Textarea
        id="message-text"
        rows={3}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder="Ask them anything about the day."
        aria-describedby="message-limit"
        /*
          `text-base`, not `text-sm`: iOS Safari zooms the page in
          for any focused control computing under 16px and never
          zooms back out (yuvoy-app#35).
        */
        className={cn(
          "rounded-control border-paper-line bg-paper-deep text-forest focus:border-forest/60 focus:bg-paper ease-interaction w-full resize-y border px-4 py-3 text-base transition-[border-color,background-color] duration-200 outline-none",
          over && "border-terra-deep",
        )}
      />

      <div className="mt-2 flex items-center justify-between gap-3">
        <p
          id="message-limit"
          className={cn("text-xs", over ? "text-terra-deep" : "text-forest/70")}
        >
          {/*
            Only near the limit. A counter on an empty box is noise,
            and the number that matters is how many are left.
          */}
          {draft.length > MESSAGE_MAX - 100
            ? `${MESSAGE_MAX - draft.length} characters left`
            : "No phone numbers, email addresses or links."}
        </p>
        <Button
          type="submit"
          size="sm"
          disabled={!draft.trim() || over || send.isPending}
        >
          {send.isPending ? "Sending…" : "Send"}
        </Button>
      </div>

      {/*
        The server's own sentence, because the refusal is about the
        traveller's text and the same text fails again. Never the
        generic panel, which would offer a retry that cannot work.
      */}
      {refusal ? (
        <p role="alert" className="text-terra-deep mt-3 text-sm">{refusal}</p>
      ) : null}
      {otherFailure ? (
        <FailurePanel failure={otherFailure} className="mt-3" />
      ) : null}
    </form>
  );
}

/**
 * Whether this tab is in front.
 *
 * Through `useSyncExternalStore` rather than an effect that reads the value
 * and calls `setState`: the document's visibility IS external state, reading
 * it during render would be impure, and a synchronous `setState` in an effect
 * body cascades a second render on every mount.
 */
export function useTabVisible(): boolean {
  return useSyncExternalStore(
    (onChange) => {
      document.addEventListener("visibilitychange", onChange);
      return () => document.removeEventListener("visibilitychange", onChange);
    },
    () => document.visibilityState === "visible",
    // Server-rendered: there is no tab yet, and nothing marks anything there.
    () => true,
  );
}

export function Message({ message }: { message: BookingMessage }) {
  const mine = message.from === "traveller";
  return (
    <li className={cn("flex flex-col", mine ? "items-end" : "items-start")}>
      <div
        className={cn(
          "rounded-card max-w-[85%] px-4 py-3",
          /*
            The operator's side on paper with a hairline: the thread sits in a
            raised panel whose ground IS paper-deep, so a paper-deep bubble was
            the same colour as what it sat on (cited 3 Oct 2026).
          */
          mine
            ? "bg-forest text-paper"
            : "border-paper-line bg-paper text-forest border",
        )}
      >
        {/*
          The operator's side is the host speaking, so its name and words are
          in the host's voice. The traveller's own side stays in ours.
        */}
        <p
          className={cn(
            "text-xs",
            mine ? "text-paper/70 font-bold" : "voice-host text-forest/70",
          )}
        >
          {message.senderName}
        </p>
        {/*
          A MESSAGE WHOSE TEXT WAS REMOVED IS NOT AN EMPTY MESSAGE.

          Text is removed a set time after the trip ends and the message stays,
          with who wrote it and when, carrying `textRemovedAt` in place of
          `text`: "show it as a message whose text was removed, never as an
          empty one." A blank bubble reads as something the app lost.

          `whitespace-pre-line` because the API keeps the line breaks a person
          typed, and a message that arrives as three lines should read as three.
        */}
        {message.text !== undefined ? (
          <p
            className={cn(
              "text-body mt-1 text-pretty whitespace-pre-line",
              !mine && "voice-host",
            )}
          >
            {message.text}
          </p>
        ) : (
          <p
            className={cn(
              "mt-1 text-sm italic",
              mine ? "text-paper/70" : "text-forest/70",
            )}
          >
            The text of this message was removed.
          </p>
        )}
      </div>
      <time
        dateTime={message.sentAt}
        className="text-forest/70 mt-1 text-[10px] tabular-nums"
      >
        {formatSent(message.sentAt)}
      </time>
    </li>
  );
}

/**
 * The messages in the order given, each once, as its last mention has it: a
 * message removed since an earlier page was read is drawn removed.
 */
export function inOrderOnce(...lists: BookingMessage[][]): BookingMessage[] {
  const latest = new Map<string, BookingMessage>();
  for (const list of lists) for (const m of list) latest.set(m.id, m);
  const drawn = new Set<string>();
  const out: BookingMessage[] = [];
  for (const list of lists) {
    for (const m of list) {
      if (drawn.has(m.id)) continue;
      drawn.add(m.id);
      out.push(latest.get(m.id) ?? m);
    }
  }
  return out;
}

/**
 * When it was sent, in the reader's own zone.
 *
 * The departure is rendered in the MARKET's zone elsewhere on this screen,
 * because a 7am dive shown as 1:30am is a missed boat. A message is the
 * opposite case: "when did they write this" is a question about the reader's
 * own day, and a traveller still at home reading 15:45 for something sent at
 * their 10:15 would be the confusing one.
 *
 * ## The sharpest case in yuvoy-app#67, and it was sharp in two ways
 *
 * This used to format with `Intl.DateTimeFormat(undefined, { month: "short" })`.
 * A formatter with no locale takes the RUNTIME's, so the string varied by
 * engine and not merely by CLDR version: measured on the same instant, WebKit
 * gave `16 Sep at 17:30` and Chromium gave `Sep 16, 17:30`. Different month
 * spelling, different separator, and a different FIELD ORDER. Two travellers
 * on the same thread read different sentences.
 *
 * It is also the one stamp on the screen that a server could never render
 * correctly even with the names fixed, because the zone is the reader's and a
 * server does not know it. That is safe here and structurally so: this thread
 * hangs off a status token in the URL fragment, `useFragmentToken`'s server
 * snapshot is `null`, and a fragment is never sent to a server. If this
 * component is ever moved somewhere the server has the data, the stamp must
 * move behind a mount check or a `suppressHydrationWarning`, because the zone
 * cannot be made to agree.
 *
 * The machine-readable value is on the `<time dateTime>` above and is the
 * unmodified ISO instant, so nothing downstream depends on this spelling.
 */
function formatSent(iso: string): string | null {
  const civil = civilHere(iso);
  if (!civil) return null;
  return `${dayMonth(civil)}, ${clockTime(civil)}`;
}
