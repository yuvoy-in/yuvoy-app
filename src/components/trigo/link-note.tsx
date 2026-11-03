"use client";

import { Button } from "@/components/ui/button";
import { YuvoyError } from "@/lib/api/errors";
import type { TrigoMessage } from "@/lib/trigo/api";
import { useRequestTrigoHandoff } from "@/lib/trigo/handoff";
import {
  ASK_TEAM_FAILED,
  ASK_TEAM_TO_CHECK,
  linkNotCheckedLine,
} from "@/lib/trigo/words";

/**
 * Under a reply to a message that held a link (yuvoy-app#223 (c)). Trigo
 * never opens links, so the note says nothing on that domain was checked, and
 * the button hands this message to the team (`requestTrigoHandoff` with the
 * reply's id). After the tap there are no new words from us: the server's own
 * line, saying when the team will reply, joins the chat.
 *
 * A refusal shows the API's sentence (an ended chat is 409 "This chat has
 * ended. Start a new one to ask the team."); no answer at all shows ours.
 */
export function LinkNote({
  message,
  conversationId,
}: {
  message: TrigoMessage;
  conversationId: string | null;
}) {
  const handoff = useRequestTrigoHandoff();
  const domain = message.linkNotChecked?.domain;
  if (!domain) return null;

  const failed = handoff.isError
    ? handoff.error instanceof YuvoyError && handoff.error.message
      ? handoff.error.message
      : ASK_TEAM_FAILED
    : null;

  return (
    <div
      className="flex w-full max-w-[85%] flex-col items-start gap-2"
      data-testid="trigo-link-note"
    >
      <p className="text-body text-forest/70 text-pretty">
        {linkNotCheckedLine(domain)}
      </p>
      {handoff.isSuccess ? null : (
        <Button
          variant="outline"
          size="sm"
          disabled={!conversationId}
          aria-busy={handoff.isPending || undefined}
          onClick={() => {
            // A second tap while the first is out does nothing.
            if (!conversationId || handoff.isPending) return;
            handoff.mutate({ conversationId, messageId: message.id });
          }}
        >
          {ASK_TEAM_TO_CHECK}
        </Button>
      )}
      {failed ? (
        <p role="alert" className="text-body text-pretty">
          {failed}
        </p>
      ) : null}
    </div>
  );
}
