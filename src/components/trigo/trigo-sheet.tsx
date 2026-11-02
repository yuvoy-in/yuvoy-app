"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Sheet, SheetPresence } from "@/components/ui/sheet";
import { Button, ButtonLink } from "@/components/ui/button";
import { LoadingState, Skeleton } from "@/components/states";
import { EVENTS } from "@/lib/analytics/events";
import { sessionQuery, useTravellerSession } from "@/lib/auth/use-traveller";
import { captureEvent } from "@/lib/observability/report";
import { qk } from "@/lib/query/policy";
import { useRelease } from "@/lib/site/use-release";
import {
  classifyTrigoError,
  useMarkTrigoRead,
  useSendTrigoTurn,
  useTrigoChat,
  useTrigoConsent,
  useTrigoConversations,
  useWithdrawTrigoConsent,
  type TrigoFailure,
  type TrigoTurnResult,
} from "@/lib/trigo/api";
import {
  clearDraft,
  freshTurnKey,
  readDraft,
  writeDraft,
  type TrigoDraft,
} from "@/lib/trigo/keys";
import {
  NOT_RELEASED_LINE,
  TALK_TO_A_PERSON,
  TRIGO_TITLE,
  TURN_OFF,
} from "@/lib/trigo/words";
import { AgePanel } from "./age-panel";
import {
  Failed,
  SignedOut,
  StatusLine,
  cardsIn,
  chipsFor,
  latencyBucket,
  lastReplySeq,
  lengthBucket,
  useOnline,
} from "./chat-parts";
import { Composer } from "./composer";
import { ConsentPanel } from "./consent-panel";
import { LimitPanel } from "./limit-panel";
import { HELP_PATH, MessageList } from "./message-list";
import type { TrigoRequest } from "./trigo-provider";
import { LOADING_CHAT, SAVE_FAILED, STARTERS_LABEL } from "./ui-words";

/**
 * The "Ask Trigo" sheet (yuvoy-app#223, R5-T5; behaviour from
 * yuvoy-mobile#356). Loaded by `TrigoProvider` on the first open only.
 *
 * Each opening is fresh state: `SheetPresence` unmounts the chat once the
 * sheet has left. What must outlive that, the unsent text and its key, is in
 * sessionStorage (`@/lib/trigo/keys`).
 *
 * Every branch reads a failure's `kind` from `classifyTrigoError`, which reads
 * the status and `error.code`, never the message text.
 */
export function TrigoSheet({
  open,
  request,
  destinationKey,
  onClose,
  onConversation,
}: {
  open: boolean;
  request: TrigoRequest | null;
  destinationKey: string | null;
  onClose: () => void;
  /** The first answer names the chat: the provider writes it into the address. */
  onConversation: (id: string) => void;
}) {
  return (
    <SheetPresence open={open}>
      <ChatSheet
        open={open}
        request={request}
        destinationKey={destinationKey}
        onClose={onClose}
        onConversation={onConversation}
      />
    </SheetPresence>
  );
}

/* ---------------------------------------------------------------- sheet -- */

function ChatSheet({
  open,
  request,
  destinationKey,
  onClose,
  onConversation,
}: {
  open: boolean;
  request: TrigoRequest | null;
  destinationKey: string | null;
  onClose: () => void;
  onConversation: (id: string) => void;
}) {
  const qc = useQueryClient();
  const { signedIn } = useTravellerSession();
  const release = useRelease("trigo");
  const online = useOnline();
  const enabled = signedIn === true && release.open;

  const consent = useTrigoConsent(enabled);
  const [consentAgain, setConsentAgain] = useState(false);
  const accepted = consent.data?.accepted === true && !consentAgain;

  // What this opening was asked for, kept while the address moves on to the chat's id.
  const [start] = useState(request);
  const aboutCardId = start?.aboutCardId ?? null;
  const [chosenId, setChosenId] = useState(start?.conversationId ?? null);
  const [gone, setGone] = useState<string | null>(null);

  const list = useTrigoConversations(enabled && accepted && !chosenId);
  const listedId = list.data?.find((c) => c.state === "open")?.id ?? null;
  const pickedId = chosenId ?? listedId;
  const conversationId = pickedId && pickedId !== gone ? pickedId : null;
  const chat = useTrigoChat(conversationId, enabled && accepted);

  // A 404 on the id: drop it and start from the list (or a new chat).
  if (chat.notFound && conversationId && conversationId !== gone) {
    setGone(conversationId);
    if (conversationId === chosenId) setChosenId(null);
  }

  const turn = useSendTrigoTurn();
  const withdraw = useWithdrawTrigoConsent();
  const { mutate: markRead } = useMarkTrigoRead(conversationId);

  const [text, setText] = useState(() => readDraft()?.text ?? "");
  const [failure, setFailure] = useState<TrigoFailure | null>(null);
  /** The turn the age answer is for, sent again with the same key once saved. */
  const [ageTurn, setAgeTurn] = useState<TrigoDraft | null>(null);
  /** The last answer, for Try again on a timed-out reply. */
  const [last, setLast] = useState<{
    outcome: TrigoTurnResult["outcome"];
    text: string;
    seq: number | null;
  } | null>(null);
  const sent = useRef<TrigoDraft | null>(null);
  const field = useRef<HTMLTextAreaElement | null>(null);

  // Back online: the offline line goes, and the kept text can be sent. Only
  // on the change, so a send that failed while the browser still said online
  // keeps its line.
  const [wasOnline, setWasOnline] = useState(online);
  if (online !== wasOnline) {
    setWasOnline(online);
    if (online && failure?.kind === "offline") setFailure(null);
  }

  const atLimit = chat.remainingToday === 0 || failure?.kind === "limit";
  const sendOff = !online || atLimit;

  const send = (draft: TrigoDraft) => {
    if (!online) {
      setFailure({ kind: "offline" });
      return;
    }
    sent.current = draft;
    setFailure(null);
    const turnIndex =
      chat.messages.filter((m) => m.role === "traveller").length + 1;
    captureEvent(EVENTS.trigoMessageSent, {
      lengthBucket: lengthBucket(draft.text.length),
      turnIndex,
    });
    turn.mutate(
      {
        key: draft.key,
        text: draft.text,
        conversationId: conversationId ?? undefined,
        destinationKey: destinationKey ?? undefined,
        aboutCardId: aboutCardId ?? undefined,
      },
      {
        onSuccess: (result, _vars, start) => {
          // The hook cleared the stored draft for this key.
          setText("");
          setLast({
            outcome: result.outcome,
            text: draft.text,
            seq: lastReplySeq(result.messages),
          });
          if (result.conversationId !== conversationId) {
            setChosenId(result.conversationId);
            onConversation(result.conversationId);
          }
          captureEvent(EVENTS.trigoReplyShown, {
            outcome: result.outcome,
            cards: cardsIn(result.messages),
            latencyBucket: latencyBucket(Date.now() - start.startedAt),
          });
          if (result.remainingToday === 0) {
            captureEvent(EVENTS.trigoLimitReached);
          }
        },
        onError: (error) => failed(classifyTrigoError(error), draft),
        onSettled: () => field.current?.focus(),
      },
    );
  };

  const failed = (next: TrigoFailure, draft: TrigoDraft) => {
    switch (next.kind) {
      case "signed_out":
        void qc.invalidateQueries({ queryKey: sessionQuery.queryKey });
        break;
      case "consent":
        // The notice changed or was withdrawn elsewhere: show it again.
        setConsentAgain(true);
        void qc.invalidateQueries({ queryKey: qk.trigoConsent() });
        return;
      case "age":
        setAgeTurn(draft);
        break;
      case "limit":
        captureEvent(EVENTS.trigoLimitReached);
        break;
      case "in_progress":
      case "idempotency_in_progress":
        // Read the chat for the answer that is coming; never send again.
        if (conversationId) {
          void qc.invalidateQueries({
            queryKey: qk.trigoConversation(conversationId),
          });
        }
        break;
    }
    setFailure(next);
  };

  /** Try again after a failure: the same text and the same key. */
  const retrySame = () => {
    const draft = sent.current ?? readDraft();
    if (draft) send(draft);
  };

  /** Try again on a timed-out reply: the same text and a new key. */
  const retryFresh = () => {
    if (!last) return;
    clearDraft();
    const draft = writeDraft(last.text) ?? {
      text: last.text,
      key: freshTurnKey(),
    };
    setText(draft.text);
    send(draft);
  };

  const sendChip = (chip: string) => {
    const draft = writeDraft(chip) ?? { text: chip, key: freshTurnKey() };
    setText(chip);
    send(draft);
  };

  // Read up to the newest message on screen, once per new message.
  const newest = chat.messages.at(-1)?.seq ?? 0;
  const marked = useRef(0);
  useEffect(() => {
    if (!open || !conversationId || newest <= marked.current) return;
    if (document.visibilityState === "hidden") return;
    marked.current = newest;
    markRead(newest);
  }, [open, conversationId, newest, markRead]);

  /* ------------------------------------------------------------ views -- */

  let body: ReactNode;
  let footer: ReactNode = undefined;
  let chatView = false;

  const loading = (
    <LoadingState label={LOADING_CHAT}>
      <Skeleton className="h-16 w-3/4" />
      <Skeleton className="mt-3 h-10 w-1/2" />
    </LoadingState>
  );

  const consentFailure = consent.error
    ? classifyTrigoError(consent.error)
    : null;

  if (signedIn === undefined || (signedIn && release.pending)) {
    body = loading;
  } else if (
    signedIn === false ||
    failure?.kind === "signed_out" ||
    (consent.isLoadingError && consentFailure?.kind === "signed_out")
  ) {
    body = <SignedOut />;
  } else if (
    !release.open ||
    failure?.kind === "not_released" ||
    (consent.isLoadingError && consentFailure?.kind === "not_released")
  ) {
    body = <p className="text-forest text-body text-pretty">{NOT_RELEASED_LINE}</p>;
  } else if (consent.isPending) {
    body = loading;
  } else if (consent.isLoadingError) {
    body = <Failed onRetry={() => void consent.refetch()} />;
  } else if (consent.data && (!consent.data.accepted || consentAgain)) {
    body = (
      <ConsentPanel
        consent={consent.data}
        onAccepted={() => setConsentAgain(false)}
      />
    );
  } else if (failure?.kind === "age") {
    body = (
      <AgePanel
        onDone={() => {
          setFailure(null);
          const draft = ageTurn;
          setAgeTurn(null);
          if (draft) send(draft);
        }}
      />
    );
  } else if (
    (conversationId && chat.isPending) ||
    (!chosenId && list.isPending)
  ) {
    body = loading;
  } else if (list.isLoadingError && !chosenId) {
    body = <Failed onRetry={() => void list.refetch()} />;
  } else if (chat.error && !chat.notFound && chat.messages.length === 0) {
    body = (
      <Failed
        onRetry={() =>
          conversationId &&
          void qc.invalidateQueries({
            queryKey: qk.trigoConversation(conversationId),
          })
        }
      />
    );
  } else {
    chatView = true;
    const chips = chipsFor(aboutCardId, destinationKey);
    body = (
      <div className="flex flex-col gap-4">
        <div className="flex justify-end">
          <Button
            variant="ghost"
            size="sm"
            pending={withdraw.isPending}
            pendingLabel={TURN_OFF}
            onClick={() =>
              withdraw.mutate(undefined, {
                onSuccess: () => {
                  captureEvent(EVENTS.trigoConsent, { accepted: false });
                  void qc.invalidateQueries({ queryKey: qk.trigoConsent() });
                },
              })
            }
          >
            {TURN_OFF}
          </Button>
        </div>
        {withdraw.error ? (
          <p role="alert" className="text-terra-deep text-body text-pretty">
            {SAVE_FAILED}
          </p>
        ) : null}
        <MessageList
          messages={chat.messages}
          typing={turn.isPending}
          retrySeq={last?.outcome === "timed_out" ? last.seq : null}
          onRetry={retryFresh}
        />
        {chat.messages.length === 0 && !turn.isPending ? (
          <ul aria-label={STARTERS_LABEL} className="flex flex-wrap gap-2">
            {chips.map((chip) => (
              <li key={chip}>
                {chip === TALK_TO_A_PERSON ? (
                  <ButtonLink href={HELP_PATH} variant="outline" size="sm">
                    {chip}
                  </ButtonLink>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={sendOff}
                    onClick={() => sendChip(chip)}
                  >
                    {chip}
                  </Button>
                )}
              </li>
            ))}
          </ul>
        ) : null}
        <StatusLine
          failure={failure}
          online={online}
          onRetry={retrySame}
          busy={turn.isPending}
        />
        {atLimit ? (
          <LimitPanel
            resetsAt={
              (failure?.kind === "limit" ? failure.resetsAt : null) ??
              chat.resetsAt
            }
          />
        ) : null}
      </div>
    );
    footer = (
      <Composer
        value={text}
        onChange={setText}
        onSend={send}
        sendOff={sendOff}
        busy={turn.isPending}
        remaining={chat.remainingToday}
        fieldRef={field}
      />
    );
  }

  // Focus goes to the composer once the chat is on screen, and stays there.
  useEffect(() => {
    if (chatView && open) field.current?.focus();
  }, [chatView, open]);

  return (
    <Sheet open={open} onClose={onClose} title={TRIGO_TITLE} footer={footer}>
      {body}
    </Sheet>
  );
}
