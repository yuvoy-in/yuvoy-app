"use client";

import {
  useMutation,
  useQueryClient,
  type QueryClient,
  type UseMutationResult,
} from "@tanstack/react-query";
import { createProxyClient } from "@/lib/api/client";
import { YuvoyError } from "@/lib/api/errors";
import type { components } from "@/lib/api/schema.gen";
import { qk } from "@/lib/query/policy";
import { mergeBySeq, type TrigoChatData } from "./api";

/**
 * `POST /trigo/conversations/{id}/handoff` (requestTrigoHandoff): "Ask the
 * team to check" under a reply to a link Trigo did not open (yuvoy-app#223
 * (c)). Session only, through `createProxyClient`, and never retried by React
 * Query: a repeat is the traveller's own tap, and the server writes no second
 * line for one while the hand-off is open.
 *
 * On a 200 the server's system line joins the chat by its seq at once and the
 * chat's team state is the answer's, so the screen does not wait for the next
 * poll. A 401 reads the session again; a 409 (the chat has ended) shows the
 * API's sentence where the button was.
 */

export type TrigoHandoff = components["schemas"]["TrigoHandoff"];

export interface HandoffVars {
  conversationId: string;
  /** The reply the traveller asked from. */
  messageId: string;
}

export function withHandoff(
  old: TrigoChatData | undefined,
  answer: TrigoHandoff,
): TrigoChatData | undefined {
  if (!old) return old;
  return {
    ...old,
    conversation: old.conversation
      ? { ...old.conversation, team: answer.team }
      : old.conversation,
    messages: mergeBySeq(old.messages, [answer.message]),
  };
}

function onSignedOut(qc: QueryClient, error: unknown): void {
  if (error instanceof YuvoyError && error.status === 401) {
    void qc.invalidateQueries({ queryKey: qk.session() });
  }
}

export function useRequestTrigoHandoff(): UseMutationResult<
  TrigoHandoff,
  unknown,
  HandoffVars
> {
  const qc = useQueryClient();
  return useMutation({
    retry: false,
    mutationFn: async ({ conversationId, messageId }: HandoffVars) => {
      const client = createProxyClient();
      const { data, error } = await client.POST(
        "/trigo/conversations/{id}/handoff",
        {
          params: { path: { id: conversationId } },
          body: { messageId },
        },
      );
      if (error) throw error;
      return data;
    },
    onSuccess: (answer, vars) => {
      qc.setQueryData<TrigoChatData>(
        qk.trigoConversation(vars.conversationId),
        (old) => withHandoff(old, answer),
      );
      void qc.invalidateQueries({ queryKey: qk.trigoConversations() });
    },
    onError: (error) => onSignedOut(qc, error),
  });
}
