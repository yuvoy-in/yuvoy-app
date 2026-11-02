"use client";

import { useEffect, useRef } from "react";
import { Button, ButtonLink } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import type { TrigoMessage } from "@/lib/trigo/api";
import { ASK_THE_TEAM, GREETING, TRY_AGAIN, TYPING } from "@/lib/trigo/words";
import {
  REMOVED_MESSAGE,
  SPEAKER_TEAM,
  SPEAKER_TRIGO,
  SPEAKER_YOU,
} from "./ui-words";

/** The help route, until R5-T2's in-chat hand-off is built. */
export const HELP_PATH = "/help";

/**
 * The chat, oldest first, drawn from what the API sent and nothing else.
 *
 * The typed text is never put in the list: it stays in the composer until the
 * answer comes back with the traveller's message in it, so no line is ever
 * on screen twice (R5-T5).
 *
 * `role="log"` with `aria-live="polite"`: a new reply is read out once, after
 * whatever the reader was saying. The greeting sits at the top of a new chat
 * and is ours, not a message.
 */
export function MessageList({
  messages,
  typing,
  retrySeq,
  onRetry,
}: {
  messages: TrigoMessage[];
  /** A turn is out: the typing line shows at the foot. */
  typing: boolean;
  /** The seq of a timed-out reply that offers Try again (same text, new key). */
  retrySeq: number | null;
  onRetry: () => void;
}) {
  const end = useRef<HTMLDivElement | null>(null);
  const last = messages.at(-1)?.seq ?? 0;

  /*
    A new message or the typing line scrolls the foot into view. Older pages
    are not in this part (no `before` reads yet), so there is no reading
    position above to keep.
  */
  useEffect(() => {
    const node = end.current;
    if (node && typeof node.scrollIntoView === "function") {
      node.scrollIntoView({ block: "end" });
    }
  }, [last, typing]);

  return (
    <div role="log" aria-live="polite" aria-label="Messages">
      <ol className="flex flex-col gap-3">
        {messages.length === 0 ? (
          <li className="flex justify-start">
            <p className={cn(BUBBLE, OTHER)}>{GREETING}</p>
          </li>
        ) : null}
        {messages.map((message) => (
          <MessageItem
            key={message.id}
            message={message}
            canRetry={message.seq === retrySeq}
            onRetry={onRetry}
          />
        ))}
      </ol>
      {typing ? (
        <p className="text-forest/70 text-body text-pretty mt-3" data-testid="trigo-typing">
          {TYPING}
        </p>
      ) : null}
      <div ref={end} />
    </div>
  );
}

const BUBBLE =
  "rounded-card max-w-[85%] px-4 py-3 text-body text-pretty whitespace-pre-line break-words";
const MINE = "bg-forest text-paper";
const OTHER = "border-paper-line bg-paper text-forest border";

function speakerOf(message: TrigoMessage): string {
  if (message.role === "traveller") return SPEAKER_YOU;
  if (message.role === "team") return message.staffName || SPEAKER_TEAM;
  return SPEAKER_TRIGO;
}

function MessageItem({
  message,
  canRetry,
  onRetry,
}: {
  message: TrigoMessage;
  canRetry: boolean;
  onRetry: () => void;
}) {
  const text =
    message.removed || message.text === null ? REMOVED_MESSAGE : message.text;

  if (message.role === "system") {
    return (
      <li className="text-forest/70 text-body text-pretty text-center">
        <p>{text}</p>
      </li>
    );
  }

  const mine = message.role === "traveller";
  return (
    <li
      className={cn("flex flex-col gap-2", mine ? "items-end" : "items-start")}
      data-seq={message.seq}
    >
      <p className={cn(BUBBLE, mine ? MINE : OTHER)}>
        <span className="sr-only">{speakerOf(message)}: </span>
        {message.role === "team" ? (
          <span aria-hidden="true" className="label mb-1 block">
            {speakerOf(message)}
          </span>
        ) : null}
        <span>{text}</span>
      </p>
      {message.handoffOffer || canRetry ? (
        <div className="flex flex-wrap gap-2">
          {canRetry ? (
            <Button variant="outline" size="sm" onClick={onRetry}>
              {TRY_AGAIN}
            </Button>
          ) : null}
          {message.handoffOffer ? (
            <ButtonLink href={HELP_PATH} variant="outline" size="sm">
              {ASK_THE_TEAM}
            </ButtonLink>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}
