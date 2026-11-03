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
import { StalledError } from "@/lib/api/deadline";
import { NetworkError, YuvoyError } from "@/lib/api/errors";
import { qk } from "@/lib/query/policy";
import type { components } from "@/lib/api/schema.gen";
import { clearDraftFor } from "./keys";

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

function isSignedOut(error: unknown): boolean {
  return error instanceof YuvoyError && error.status === 401;
}

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

/**
 * One chat. The first read has no `after` (the newest 50); every read after
 * that asks only for what came after the last `seq` held, while
 * `pollAfterSeconds` is above 0 (the team is waiting or has joined) and the
 * tab is in front.
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
      /*
        Only a page sets `conversation`. Without one, the cache holds just a
        turn's answer: a chat the server continued under a new id has older
        messages before it, so the read has no `after` (yuvoy-app#223).
      */
      const after =
        old?.conversation && old.messages.length > 0 ? maxSeq(old.messages) : 0;
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

export type TrigoFailure =
  | { kind: "signed_out" } // 401
  | { kind: "not_released"; message: string } // 404 on turn or accept
  | { kind: "age" } // 403 adult_confirmation_required
  | { kind: "consent"; noticeVersion: string | null } // 409 consent_required, details.noticeVersion
  | { kind: "limit"; resetsAt: string | null; message: string } // 429 daily_limit_reached, details.resetsAt
  | { kind: "rate_limited"; message: string; retryAfterSeconds?: number } // 429 rate_limited
  | { kind: "in_progress"; retryAfterSeconds?: number } // 409 turn_in_progress
  | { kind: "idempotency_in_progress"; retryAfterSeconds?: number } // 409 idempotency_in_progress: read the chat, do not resend
  | { kind: "busy"; message: string; retryAfterSeconds?: number } // 503: show the API's sentence, Try again with the same key
  | { kind: "offline" } // no connection / navigator.onLine false
  | { kind: "rejected" } // 400, 409 idempotency_key_reuse: the same send gets the same answer
  | { kind: "failure"; retryAfterSeconds?: number }; // anything else (500, unknown)

function isOffline(): boolean {
  return typeof navigator !== "undefined" && navigator.onLine === false;
}

function stringDetail(error: YuvoyError, name: string): string | null {
  const v = error.details[name];
  return typeof v === "string" ? v : null;
}

/** The longest the Trigo chat holds Send or Try again for a `Retry-After`, in seconds. */
export const TRIGO_WAIT_MAX_SECONDS = 120;

/**
 * The answer's `Retry-After`, for the kinds that offer Try again or Send
 * again: the API sends `2` on `409 idempotency_in_progress`, and the seconds
 * until its limiter lets one more turn through on `429 rate_limited`
 * (yuvoy-api#598). The sheet waits that long. `429 daily_limit_reached`
 * carries none: its wait is `details.resetsAt`.
 * Nothing when there was none, so those kinds read as they always did.
 * A longer wait than `TRIGO_WAIT_MAX_SECONDS` is cut to it, so a wrong
 * header holds Send and Try again for two minutes at most. The error keeps
 * the value as sent.
 */
function waitOf(error: YuvoyError): { retryAfterSeconds?: number } {
  return error.retryAfterSeconds === undefined
    ? {}
    : {
        retryAfterSeconds: Math.min(
          error.retryAfterSeconds,
          TRIGO_WAIT_MAX_SECONDS,
        ),
      };
}

/**
 * Which state a Trigo failure puts the chat in. Branches on status and
 * `error.code` only (YuvoyError), never on the message text; the message is
 * carried only where the screen shows the API's own sentence.
 */
export function classifyTrigoError(error: unknown): TrigoFailure {
  if (isOffline()) return { kind: "offline" };
  if (error instanceof NetworkError) {
    /*
      A send that went quiet for `WRITE_STALL_MS` is not a lost connection:
      the turn may have been answered. "Try again" with the same key returns
      it if so, which is what the failure line offers.
    */
    return error.cause instanceof StalledError
      ? { kind: "failure" }
      : { kind: "offline" };
  }
  if (!(error instanceof YuvoyError)) return { kind: "failure" };
  const { status, code } = error;
  if (status === 400) return { kind: "rejected" };
  if (status === 401) return { kind: "signed_out" };
  if (status === 404) return { kind: "not_released", message: error.message };
  if (status === 403 && code === "adult_confirmation_required") {
    return { kind: "age" };
  }
  if (status === 409) {
    if (code === "consent_required") {
      return {
        kind: "consent",
        noticeVersion: stringDetail(error, "noticeVersion"),
      };
    }
    if (code === "turn_in_progress") {
      return { kind: "in_progress", ...waitOf(error) };
    }
    if (code === "idempotency_in_progress") {
      return { kind: "idempotency_in_progress", ...waitOf(error) };
    }
    if (code === "idempotency_key_reuse") return { kind: "rejected" };
    return { kind: "failure", ...waitOf(error) };
  }
  if (status === 429) {
    if (code === "daily_limit_reached") {
      return {
        kind: "limit",
        resetsAt: stringDetail(error, "resetsAt"),
        message: error.message,
      };
    }
    return { kind: "rate_limited", message: error.message, ...waitOf(error) };
  }
  if (status === 503) {
    return { kind: "busy", message: error.message, ...waitOf(error) };
  }
  return { kind: "failure", ...waitOf(error) };
}

/* ----------------------------------------------------------------- age */

export interface ConfirmAgeVars {
  birthYear: number;
  birthdayPassed?: boolean;
}

/**
 * `PUT /me/age` (confirmMyAge), for the age line Trigo shows on
 * `403 adult_confirmation_required`. The web has no age form of its own yet,
 * so the chat carries a small one. On a 200 the session and the account are
 * read again (the account's `ageConfirmed` turns true), and the screen sends
 * the turn again with its same key.
 *
 * An under-18 answer closes the account and ends its sessions, so
 * `403 under_age_sign_up` reads the session again too, and the screen falls
 * to signed out after showing the API's sentence.
 */
export function useConfirmAge(): UseMutationResult<
  void,
  unknown,
  ConfirmAgeVars
> {
  const qc = useQueryClient();
  return useMutation({
    retry: false,
    mutationFn: async ({ birthYear, birthdayPassed }: ConfirmAgeVars) => {
      const client = createProxyClient();
      const { error } = await client.PUT("/me/age", {
        body:
          birthdayPassed === undefined
            ? { birthYear }
            : { birthYear, birthdayPassed },
      });
      if (error) throw error;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.session() });
      void qc.invalidateQueries({ queryKey: qk.myAccount() });
    },
    onError: (error) => {
      if (
        isSignedOut(error) ||
        (error instanceof YuvoyError &&
          error.status === 403 &&
          error.code === "under_age_sign_up")
      ) {
        void qc.invalidateQueries({ queryKey: qk.session() });
      }
    },
  });
}

export type AgeFailure =
  | { kind: "need_birthday" } // 400 invalid_input with details.birthdayPassed: ask the question
  | { kind: "under_age"; message: string } // 403 under_age_sign_up: the account is closed
  | { kind: "locked"; message: string } // 409 age_locked: only the team can change it
  | { kind: "signed_out" } // 401
  | { kind: "failure" };

/** Which state a failed `PUT /me/age` puts the form in, by status and code only. */
export function classifyAgeError(error: unknown): AgeFailure {
  if (!(error instanceof YuvoyError)) return { kind: "failure" };
  const { status, code } = error;
  if (status === 401) return { kind: "signed_out" };
  if (
    status === 400 &&
    code === "invalid_input" &&
    "birthdayPassed" in error.details
  ) {
    return { kind: "need_birthday" };
  }
  if (status === 403 && code === "under_age_sign_up") {
    return { kind: "under_age", message: error.message };
  }
  if (status === 409 && code === "age_locked") {
    return { kind: "locked", message: error.message };
  }
  return { kind: "failure" };
}
