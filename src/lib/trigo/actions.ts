"use client";

import {
  useMutation,
  useQueryClient,
  type QueryClient,
  type UseMutationResult,
} from "@tanstack/react-query";
import { createProxyClient } from "@/lib/api/client";
import { StalledError } from "@/lib/api/deadline";
import { NetworkError, YuvoyError } from "@/lib/api/errors";
import { qk } from "@/lib/query/policy";
import type { components } from "@/lib/api/schema.gen";
import {
  mergeBySeq,
  readTrigoChatInFull,
  type TrigoChatData,
  type TrigoMessage,
} from "./api";
import { saveTrigoCheckout } from "./checkout-prefill";

/**
 * The confirm cards under a Trigo reply (yuvoy-app#223 part 2, the web half
 * of yuvoy-mobile#391): yes and no on a card, and what each failure means.
 *
 * Both calls are session only and go through `createProxyClient`. Neither is
 * retried by React Query: a repeat is the traveller's own tap. Confirm is
 * idempotent on the server (a second confirm returns the first answer while
 * it holds), and so is decline.
 *
 * The card's state is the server's. An answer writes the state it gave into
 * the chat's cache at once, so the card does not wait for the next read, and
 * then the chat is read again, which is the truth.
 */

export type TrigoActionCard = components["schemas"]["TrigoActionCard"];
export type TrigoActionConfirmation =
  components["schemas"]["TrigoActionConfirmation"];
type CardState = TrigoActionCard["state"];

export interface CardActionVars {
  actionId: string;
  kind: TrigoActionCard["kind"];
  /** The chat the card is in, so its cache is the one changed. */
  conversationId: string | null;
}

function onSignedOut(qc: QueryClient, error: unknown): void {
  if (error instanceof YuvoyError && error.status === 401) {
    void qc.invalidateQueries({ queryKey: qk.session() });
  }
}

function withCardState(
  messages: TrigoMessage[],
  actionId: string,
  state: CardState,
): TrigoMessage[] {
  return messages.map((m) =>
    m.actionCard?.actionId === actionId
      ? { ...m, actionCard: { ...m.actionCard, state } }
      : m,
  );
}

function setCardState(
  qc: QueryClient,
  conversationId: string | null,
  actionId: string,
  state: CardState,
  more: TrigoMessage[] = [],
): void {
  if (!conversationId) return;
  qc.setQueryData<TrigoChatData>(qk.trigoConversation(conversationId), (old) =>
    old
      ? {
          ...old,
          messages: mergeBySeq(
            withCardState(old.messages, actionId, state),
            more,
          ),
        }
      : old,
  );
}

/** In full, not `after`: the card's own message is an older one. */
function readChatAgain(qc: QueryClient, conversationId: string | null): void {
  if (conversationId) readTrigoChatInFull(qc, conversationId);
}

/**
 * `POST /trigo/actions/{id}/confirm` (confirmTrigoAction). On a 200:
 *
 *   - `next.checkout` with `state: confirmed`: the checkout is kept for
 *     `/e/{slug}/book` (`saveTrigoCheckout`); the screen opens it. With
 *     `state: used` the card was booked already (the server replays it with
 *     the same checkout): nothing is kept, and the chat's read again draws
 *     the card Booked.
 *   - `next.done`: the alert or draft exists, so the date alerts or trip
 *     drafts list (yuvoy-app#220) is read again.
 *   - `next.handoff` (R6-T2): the message joins the chat.
 *   - `next.change` (yuvoy-mobile#398): no web screen yet; the card shows
 *     only its state.
 *
 * A 409 `action_changed` or `action_expired` reads the chat again too: the
 * card on the server may have moved on.
 */
export function useConfirmTrigoAction(): UseMutationResult<
  TrigoActionConfirmation,
  unknown,
  CardActionVars
> {
  const qc = useQueryClient();
  return useMutation({
    retry: false,
    mutationFn: async ({ actionId }: CardActionVars) => {
      const client = createProxyClient();
      const { data, error } = await client.POST(
        "/trigo/actions/{id}/confirm",
        { params: { path: { id: actionId } } },
      );
      if (error) throw error;
      return data;
    },
    onSuccess: (result, vars) => {
      const next = result.next;
      const more = "handoff" in next ? [next.handoff] : [];
      setCardState(qc, vars.conversationId, vars.actionId, result.state, more);
      if ("checkout" in next && result.state === "confirmed") {
        saveTrigoCheckout(vars.actionId, next.checkout, Date.now());
      }
      if ("done" in next) {
        if (next.done.alertId || vars.kind === "date_alert") {
          void qc.invalidateQueries({ queryKey: qk.myDateAlerts() });
        }
        if (next.done.draftId || vars.kind === "trip_draft") {
          void qc.invalidateQueries({ queryKey: qk.myTripDrafts() });
        }
      }
      readChatAgain(qc, vars.conversationId);
    },
    onError: (error, vars) => {
      onSignedOut(qc, error);
      if (
        error instanceof YuvoyError &&
        (error.code === "action_changed" || error.code === "action_expired")
      ) {
        readChatAgain(qc, vars.conversationId);
      }
    },
  });
}

/**
 * `POST /trigo/actions/{id}/decline` (declineTrigoAction). The card reads
 * declined and the server's line ("No problem. Nothing has been booked or
 * changed.") joins the chat by its seq, as a turn's messages do. A 409
 * `action_expired` or `action_changed` means the card was confirmed, used or
 * replaced elsewhere: the chat is read again, and the card is drawn as the
 * server has it (a card confirmed in another tab still offers its checkout).
 */
export function useDeclineTrigoAction(): UseMutationResult<
  { message: TrigoMessage },
  unknown,
  CardActionVars
> {
  const qc = useQueryClient();
  return useMutation({
    retry: false,
    mutationFn: async ({ actionId }: CardActionVars) => {
      const client = createProxyClient();
      const { data, error } = await client.POST(
        "/trigo/actions/{id}/decline",
        { params: { path: { id: actionId } } },
      );
      if (error) throw error;
      return data;
    },
    onSuccess: (result, vars) => {
      setCardState(qc, vars.conversationId, vars.actionId, "declined", [
        result.message,
      ]);
      void qc.invalidateQueries({ queryKey: qk.trigoConversations() });
      readChatAgain(qc, vars.conversationId);
    },
    onError: (error, vars) => {
      onSignedOut(qc, error);
      if (
        error instanceof YuvoyError &&
        (error.code === "action_changed" || error.code === "action_expired")
      ) {
        readChatAgain(qc, vars.conversationId);
      }
    },
  });
}

/** Why a card's facts moved: `details.reason` of `409 action_changed`. */
export type ChangedReason =
  | "sold_out"
  | "price_moved"
  | "time_moved"
  | "not_bookable"
  | "booking_changed";

const REASONS: ReadonlySet<string> = new Set<ChangedReason>([
  "sold_out",
  "price_moved",
  "time_moved",
  "not_bookable",
  "booking_changed",
]);

export type CardFailure =
  | { kind: "changed"; reason: ChangedReason | null; message: string } // 409 action_changed, details.reason
  | { kind: "expired"; message: string } // 409 action_expired: expired, declined, replaced or its checkout lapsed
  | { kind: "alerts_full"; message: string } // 409 date_alerts_full: 50 alerts waiting
  | { kind: "not_found"; message: string } // 404: not released, or not this traveller's card
  | { kind: "signed_out" } // 401
  | { kind: "rate_limited"; message: string } // 429
  | { kind: "unavailable"; message: string } // 503: feature:trigo_actions engaged
  | { kind: "offline" } // no connection
  | { kind: "failure" }; // anything else

function isOffline(): boolean {
  return typeof navigator !== "undefined" && navigator.onLine === false;
}

/**
 * What a confirm or decline failure does to the card. Branches on the status
 * and `error.code` only (YuvoyError), never on the message text; the message
 * is carried only where the card shows the API's own sentence.
 */
export function classifyCardError(error: unknown): CardFailure {
  if (isOffline()) return { kind: "offline" };
  if (error instanceof NetworkError) {
    // A confirm that went quiet may have been answered: a tap again is safe.
    return error.cause instanceof StalledError
      ? { kind: "failure" }
      : { kind: "offline" };
  }
  if (!(error instanceof YuvoyError)) return { kind: "failure" };
  const { status, code } = error;
  if (status === 401) return { kind: "signed_out" };
  if (status === 404) return { kind: "not_found", message: error.message };
  if (status === 409) {
    if (code === "action_changed") {
      const reason = error.details.reason;
      return {
        kind: "changed",
        message: error.message,
        reason:
          typeof reason === "string" && REASONS.has(reason)
            ? (reason as ChangedReason)
            : null,
      };
    }
    if (code === "action_expired") {
      return { kind: "expired", message: error.message };
    }
    if (code === "date_alerts_full") {
      return { kind: "alerts_full", message: error.message };
    }
    return { kind: "failure" };
  }
  if (status === 429) return { kind: "rate_limited", message: error.message };
  if (status === 503) return { kind: "unavailable", message: error.message };
  return { kind: "failure" };
}
