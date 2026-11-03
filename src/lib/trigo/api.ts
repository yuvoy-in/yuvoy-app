"use client";

import { useSyncExternalStore } from "react";
import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from "@tanstack/react-query";
import { createProxyClient } from "@/lib/api/client";
import { YuvoyError } from "@/lib/api/errors";
import { qk } from "@/lib/query/policy";
import type { components } from "@/lib/api/schema.gen";
import { clearDraftFor } from "./keys";
import { isSignedOut } from "./failures";

/**
 * Trigo's calls for the web chat (yuvoy-app#223, R5-T5; behaviour from
 * yuvoy-mobile#356).
 *
 * ## Signed in, always, through the proxy
 *
 * Every Trigo route is session only, so every call here goes through
 * `createProxyClient`: the session rides in the HttpOnly cookie and the
 * browser never holds a token. A `401` means the session is over, so it
 * invalidates the session query and the screen falls to its sign-in line.
 *
 * ## A turn is never retried by React Query
 *
 * `POST /trigo/turns` is answered by a model and counts against the day's 20.
 * The fetch layer never retries a write, and the mutation is `retry: false`
 * as well. "Try again" is the traveller's own tap, with the same key, so a
 * repeat comes back as the stored turn instead of a second answer.
 */

export type TrigoMessage = components["schemas"]["TrigoMessage"];
export type TrigoTurnResult = components["schemas"]["TrigoTurnResult"];
export type TrigoConversation = components["schemas"]["TrigoConversation"];
export type TrigoConsent = components["schemas"]["TrigoConsent"];
export type TrigoTurnInput = components["schemas"]["TrigoTurnInput"];
type TrigoConversationPage = components["schemas"]["TrigoConversationPage"];

/** The only surface the web ever names to the consent routes. */
const SURFACE = "web" as const;

function onSignedOut(qc: QueryClient, error: unknown): void {
  if (isSignedOut(error)) {
    void qc.invalidateQueries({ queryKey: qk.session() });
  }
}

/* ------------------------------------------------------------- consent */

/** Whether this traveller accepted the notice in force, and its words. */
export function useTrigoConsent(
  enabled: boolean,
): UseQueryResult<TrigoConsent> {
  const qc = useQueryClient();
  return useQuery({
    queryKey: qk.trigoConsent(),
    enabled,
    retry: false,
    queryFn: async ({ signal }) => {
      const client = createProxyClient();
      const { data, error } = await client.GET("/trigo/consent", { signal });
      if (error) {
        onSignedOut(qc, error);
        throw error;
      }
      return data;
    },
  });
}

/** Accepting the notice shown, for the web. */
export function useAcceptTrigoConsent(): UseMutationResult<
  void,
  unknown,
  { noticeVersion: string }
> {
  const qc = useQueryClient();
  return useMutation({
    retry: false,
    mutationFn: async ({ noticeVersion }) => {
      const client = createProxyClient();
      const { error } = await client.POST("/trigo/consent", {
        body: { noticeVersion, surface: SURFACE },
      });
      if (error) throw error;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.trigoConsent() });
    },
    onError: (error) => {
      onSignedOut(qc, error);
      // A 400 means the notice changed under the reader: show the new one.
      if (error instanceof YuvoyError && error.status === 400) {
        void qc.invalidateQueries({ queryKey: qk.trigoConsent() });
      }
    },
  });
}

/** "Turn off Trigo": withdraws the consent given on the web. */
export function useWithdrawTrigoConsent(): UseMutationResult<
  void,
  unknown,
  void
> {
  const qc = useQueryClient();
  return useMutation({
    retry: false,
    mutationFn: async () => {
      const client = createProxyClient();
      const { error } = await client.DELETE("/trigo/consent", {
        params: { query: { surface: SURFACE } },
      });
      if (error) throw error;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.trigoConsent() });
    },
    onError: (error) => onSignedOut(qc, error),
  });
}

/* --------------------------------------------------------------- chats */

/** This traveller's recent chats, newest first (at most 20). */
export function useTrigoConversations(
  enabled: boolean,
): UseQueryResult<TrigoConversation[]> {
  const qc = useQueryClient();
  return useQuery({
    queryKey: qk.trigoConversations(),
    enabled,
    retry: false,
    queryFn: async ({ signal }) => {
      const client = createProxyClient();
      const { data, error } = await client.GET("/trigo/conversations", {
        signal,
      });
      if (error) {
        onSignedOut(qc, error);
        throw error;
      }
      return data.conversations;
    },
  });
}

/**
 * Two lists of messages as one: each `seq` once, the later list's copy kept
 * (a message can change, for one when its text is removed), oldest first.
 */
export function mergeBySeq(
  a: TrigoMessage[],
  b: TrigoMessage[],
): TrigoMessage[] {
  const bySeq = new Map<number, TrigoMessage>();
  for (const m of a) bySeq.set(m.seq, m);
  for (const m of b) bySeq.set(m.seq, m);
  return [...bySeq.values()].sort((x, y) => x.seq - y.seq);
}

/**
 * What the cache holds for one chat: every message read so far, and the
 * latest page's counts. A turn's answer is merged into the same entry, so the
 * list and the next poll never disagree about what is on screen.
 */
export interface TrigoChatData {
  conversation: TrigoConversation | null;
  messages: TrigoMessage[];
  remainingToday: number | null;
  resetsAt: string | null;
  pollAfterSeconds: number;
}

function maxSeq(messages: TrigoMessage[]): number {
  let max = 0;
  for (const m of messages) if (m.seq > max) max = m.seq;
  return max;
}

function fromPage(
  old: TrigoChatData | undefined,
  page: TrigoConversationPage,
): TrigoChatData {
  return {
    conversation: page.conversation,
    messages: mergeBySeq(old?.messages ?? [], page.messages),
    remainingToday: page.remainingToday,
    resetsAt: page.resetsAt,
    pollAfterSeconds: page.pollAfterSeconds,
  };
}

/**
 * Whether the tab is in front. Polling stops behind another tab: a reply
 * that lands meanwhile is read on the next poll after the tab comes back.
 * (The same hook as `message-thread.tsx`'s.)
 */
function useTabVisible(): boolean {
  return useSyncExternalStore(
    (onChange) => {
      document.addEventListener("visibilitychange", onChange);
      return () => document.removeEventListener("visibilitychange", onChange);
    },
    () => document.visibilityState === "visible",
    // Server-rendered: there is no tab yet, and nothing polls there.
    () => true,
  );
}

export interface TrigoChat {
  /** Merged by seq, ascending, never twice. */
  messages: TrigoMessage[];
  conversation: TrigoConversation | null;
  remainingToday: number | null;
  resetsAt: string | null;
  /** 0 = no polling. */
  pollAfterSeconds: number;
  isPending: boolean;
  error: unknown;
  /** 404 on this id: the caller drops it and starts from the list. */
  notFound: boolean;
}

/*
  Chats whose next read is in full, per cache: the chat id and the number of
  the ask. A number per ask means a read that started before a second ask
  does not clear that second one.
*/
const fullReads = new WeakMap<QueryClient, Map<string, number>>();
let fullReadAsks = 0;

/**
 * Reads the chat again with no `after`: its newest page, merged by `seq` so
 * the fresh copy of each message wins. For a card's answer: the card sits on
 * an older message, which an `after` read never sends again, so only a full
 * read brings back its state as the server has it (used, expired,
 * superseded, its booking reference). Polling keeps the cheap `after` read.
 *
 * When the chat is not on screen, the ask waits for its next read.
 */
export function readTrigoChatInFull(
  qc: QueryClient,
  conversationId: string,
): void {
  let asks = fullReads.get(qc);
  if (!asks) {
    asks = new Map();
    fullReads.set(qc, asks);
  }
  fullReadAsks += 1;
  asks.set(conversationId, fullReadAsks);
  void qc.invalidateQueries({
    queryKey: qk.trigoConversation(conversationId),
  });
}

/**
 * One chat. The first read has no `after` (the newest 50); every read after
 * that asks only for what came after the last `seq` held, while
 * `pollAfterSeconds` is above 0 (the team is waiting or has joined) and the
 * tab is in front. After `readTrigoChatInFull` the next read has no `after`
 * again.
 */
export function useTrigoChat(
  conversationId: string | null,
  enabled: boolean,
): TrigoChat {
  const qc = useQueryClient();
  const visible = useTabVisible();
  const id = conversationId ?? "";
  const query = useQuery({
    queryKey: qk.trigoConversation(id),
    enabled: enabled && Boolean(conversationId),
    retry: false,
    queryFn: async ({ signal }): Promise<TrigoChatData> => {
      const old = qc.getQueryData<TrigoChatData>(qk.trigoConversation(id));
      const ask = fullReads.get(qc)?.get(id);
      /*
        Only a page sets `conversation`. Without one, the cache holds just a
        turn's answer: a chat the server continued under a new id has older
        messages before it, so the read has no `after` (yuvoy-app#223). A card
        action's full read has no `after` either.
      */
      const after =
        ask === undefined && old?.conversation && old.messages.length > 0
          ? maxSeq(old.messages)
          : 0;
      const client = createProxyClient();
      const { data, error } = await client.GET("/trigo/conversations/{id}", {
        params: {
          path: { id },
          query: after > 0 ? { after } : undefined,
        },
        signal,
      });
      if (error) {
        onSignedOut(qc, error);
        throw error;
      }
      const asks = fullReads.get(qc);
      if (ask !== undefined && asks?.get(id) === ask) asks.delete(id);
      return fromPage(old, data);
    },
    refetchInterval: (q) => {
      const every = q.state.data?.pollAfterSeconds ?? 0;
      return visible && every > 0 ? every * 1000 : false;
    },
  });

  const data = conversationId ? query.data : undefined;
  const error = conversationId ? query.error : null;
  return {
    messages: data?.messages ?? [],
    conversation: data?.conversation ?? null,
    remainingToday: data?.remainingToday ?? null,
    resetsAt: data?.resetsAt ?? null,
    pollAfterSeconds: data?.pollAfterSeconds ?? 0,
    isPending: Boolean(conversationId) && enabled && query.isPending,
    error,
    notFound: error instanceof YuvoyError && error.status === 404,
  };
}

/** Marks a chat read up to `seq`, so the list's unread count goes down. */
export function useMarkTrigoRead(
  conversationId: string | null,
): UseMutationResult<void, unknown, number> {
  const qc = useQueryClient();
  return useMutation({
    retry: false,
    mutationFn: async (seq: number) => {
      if (!conversationId) return;
      const client = createProxyClient();
      const { error } = await client.POST("/trigo/conversations/{id}/read", {
        params: { path: { id: conversationId } },
        body: { seq },
      });
      if (error) throw error;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.trigoConversations() });
    },
    onError: (error) => onSignedOut(qc, error),
  });
}

/* --------------------------------------------------------------- turns */

export interface SendTurnVars extends TrigoTurnInput {
  key: string;
}

/**
 * `POST /trigo/turns` with header `Idempotency-Key` = `vars.key`.
 *
 * On a 200 the turn's messages are merged into that chat's cache by `seq`,
 * the day's count and reset time move to the answer's, the list of chats is
 * read again, and the chat itself is read again for what only a page carries
 * (the chat's state and `pollAfterSeconds`, which turns on once the team is
 * waiting). The stored draft is cleared when it is the one just sent.
 *
 * `409 idempotency_in_progress` means the same message is still being
 * answered: the chat is read again rather than anything sent.
 */
/** What a turn carries from its start to its answer: when it left, for the reply's latency bucket. */
export interface SendTurnStart {
  startedAt: number;
}

export function useSendTrigoTurn(): UseMutationResult<
  TrigoTurnResult,
  unknown,
  SendTurnVars,
  SendTurnStart
> {
  const qc = useQueryClient();
  return useMutation({
    retry: false,
    onMutate: (): SendTurnStart => ({ startedAt: Date.now() }),
    mutationFn: async (vars: SendTurnVars) => {
      const body: TrigoTurnInput = { text: vars.text };
      if (vars.conversationId !== undefined) {
        body.conversationId = vars.conversationId;
      }
      if (vars.destinationKey !== undefined) {
        body.destinationKey = vars.destinationKey;
      }
      if (vars.aboutCardId !== undefined) body.aboutCardId = vars.aboutCardId;
      const client = createProxyClient();
      const { data, error } = await client.POST("/trigo/turns", {
        params: { header: { "Idempotency-Key": vars.key } },
        body,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (result, vars) => {
      const key = qk.trigoConversation(result.conversationId);
      qc.setQueryData<TrigoChatData>(key, (old) => ({
        conversation: old?.conversation
          ? { ...old.conversation, team: result.team }
          : null,
        messages: mergeBySeq(old?.messages ?? [], result.messages),
        remainingToday: result.remainingToday,
        resetsAt: result.resetsAt,
        pollAfterSeconds: old?.pollAfterSeconds ?? 0,
      }));
      clearDraftFor(vars.key);
      void qc.invalidateQueries({ queryKey: qk.trigoConversations() });
      void qc.invalidateQueries({ queryKey: key });
    },
    onError: (error, vars) => {
      onSignedOut(qc, error);
      if (
        error instanceof YuvoyError &&
        error.code === "idempotency_in_progress"
      ) {
        // A first message has no id yet: the list is where its chat shows up.
        void qc.invalidateQueries({ queryKey: qk.trigoConversations() });
        if (vars.conversationId) {
          void qc.invalidateQueries({
            queryKey: qk.trigoConversation(vars.conversationId),
          });
        }
      }
    },
  });
}

/* ------------------------------------------------------------ failures */

export {
  classifyTrigoError,
  TRIGO_WAIT_MAX_SECONDS,
  trigoWaitOf,
  type TrigoFailure,
} from "./failures";

/* ----------------------------------------------------------------- age */

export {
  classifyAgeError,
  useConfirmAge,
  type AgeFailure,
  type ConfirmAgeVars,
} from "./age";
