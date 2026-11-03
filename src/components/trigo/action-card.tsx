"use client";

import { useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import Link from "@/components/ui/link";
import { YuvoyError } from "@/lib/api/errors";
import { myAccountQuery } from "@/lib/auth/use-my-account";
import { cn } from "@/lib/cn";
import { releaseOpen, releaseStage } from "@/lib/site/app-config";
import { appConfigQuery, useRelease } from "@/lib/site/use-release";
import {
  classifyCardError,
  useConfirmTrigoAction,
  useDeclineTrigoAction,
  type CardFailure,
  type TrigoActionCard,
} from "@/lib/trigo/actions";
import { trigoCheckoutHref } from "@/lib/trigo/checkout-prefill";
import {
  CARD_CHECKING,
  CARD_EXPIRED_LINE,
  DATE_ALERT_DONE,
  GO_TO_CHECKOUT,
  SIGNED_OUT_LINE,
  TRIP_DRAFT_DONE,
  TRY_AGAIN_SOON,
  bookedLine,
} from "@/lib/trigo/words";
import { useRetryHold } from "./chat-parts";
import {
  CARD_ACTIONS_CLOSED,
  CARD_DECLINED,
  CARD_FAILURE,
  CARD_LABEL,
  CARD_NOT_ON_WEB,
  CARD_OFFLINE,
  CARD_SUPERSEDED,
} from "./ui-words";

/** Where a signed-in traveller's bookings are, by reference. */
export const TRIPS_PATH = "/trips";

/** The most lines a card has in the contract (`lines`, max 8). */
const MAX_LINES = 8;

/** Kinds with a web screen today. Move and add people are yuvoy-mobile#398. */
const CONFIRMABLE = new Set<TrigoActionCard["kind"]>([
  "book",
  "date_alert",
  "trip_draft",
]);

/** A failure after which the card can do nothing more. */
function ends(failure: CardFailure | null): boolean {
  return (
    failure?.kind === "changed" ||
    failure?.kind === "expired" ||
    failure?.kind === "not_found" ||
    failure?.kind === "signed_out"
  );
}

/** A failure's line: the API's own sentence wherever it sends one. */
function failureLine(failure: CardFailure): string {
  switch (failure.kind) {
    case "signed_out":
      return SIGNED_OUT_LINE;
    case "changed":
    case "expired":
    case "alerts_full":
    case "not_found":
    case "rate_limited":
    case "unavailable":
      return failure.message;
    case "offline":
      return CARD_OFFLINE;
    case "failure":
      return CARD_FAILURE;
  }
}

/** A confirm answered 404 `not_found`, which a closed release answers too. */
function notThere(error: unknown): boolean {
  return (
    error instanceof YuvoyError &&
    error.status === 404 &&
    error.code === "not_found"
  );
}

/**
 * Whether `releases.trigoActions` is open to this traveller, read again past
 * the cache: app-config, and `GET /me` when the stage goes by cohort. The
 * observers drawing `useRelease` get the same answers.
 */
async function actionsOpenNow(qc: QueryClient): Promise<boolean> {
  const config = await qc.fetchQuery({ ...appConfigQuery, staleTime: 0 });
  const stage = releaseStage(config, "trigoActions");
  if (stage !== "early" && stage !== "staff") return releaseOpen(stage, null);
  const account = await qc.fetchQuery({ ...myAccountQuery, staleTime: 0 });
  return releaseOpen(stage, account.cohort ?? null);
}

/** The card's own line for its state, when it has one. */
function stateLine(card: TrigoActionCard): string | null {
  switch (card.state) {
    case "expired":
      return CARD_EXPIRED_LINE;
    case "declined":
      return CARD_DECLINED;
    case "superseded":
      return CARD_SUPERSEDED;
    case "used":
      if (card.kind === "date_alert") return DATE_ALERT_DONE;
      if (card.kind === "trip_draft") return TRIP_DRAFT_DONE;
      return null; // A book card's line is its booking link, below.
    case "proposed":
    case "confirmed":
      return null;
  }
}

/**
 * One Trigo confirm card under a reply (yuvoy-app#223 part 2,
 * yuvoy-mobile#391), drawn as the server sends it: its heading, its lines,
 * `confirmLabel` and `declineLabel`. Only the state lines are ours.
 *
 *   - proposed: both buttons. While a confirm is out both are off and the
 *     card says it is checking.
 *   - confirmed (a book card): Go to checkout, which confirms again and
 *     opens the same checkout.
 *   - used: the booking's reference (opening Trips), or the done line of a
 *     date alert or trip draft.
 *   - declined, expired, superseded: no buttons, and a superseded card is
 *     faded.
 *
 * Confirm and Go to checkout wait for `releases.trigoActions`. The server
 * proposes cards only while it is open, but a card made before it closed would
 * answer a confirm 404: while it is closed the card keeps its heading and
 * lines, offers only Not now and says it can't be used right now. Decline is
 * not behind the release in the API, so Not now always stays.
 *
 * The release is cached for a minute, so a confirm can still meet that 404.
 * The card then reads the release again before it says anything: closed, it
 * is drawn closed as above; still open, the 404 ends it as "not there".
 *
 * A failure is drawn by kind (`classifyCardError`): on a confirm, changed
 * and expired show the API's sentence and end the card, so does a 404, a 429
 * shows the sentence and leaves the card as it was, a 503 or anything else
 * leaves the buttons so a tap is the retry. When that answer sends
 * `Retry-After` (the traveller's limiter on a 429 does), the buttons stay off
 * for it with "You can try again in a moment." beside them, as the chat's
 * Try again does (`useRetryHold`). On a decline, changed and expired
 * end nothing: the card moved on elsewhere (it may be confirmed in another
 * tab), so the chat is read again and the card is drawn as the server has it.
 */
export function ActionCard({
  card,
  conversationId,
}: {
  card: TrigoActionCard;
  conversationId: string | null;
}) {
  const router = useRouter();
  const qc = useQueryClient();
  const actions = useRelease("trigoActions");
  const confirm = useConfirmTrigoAction();
  const decline = useDeclineTrigoAction();
  const [failure, setFailure] = useState<CardFailure | null>(null);
  // A confirm's 404 sends the card to read the release again.
  const [recheck, setRecheck] = useState<"reading" | "closed" | null>(null);
  const busyRef = useRef(false);
  const headingId = useId();
  const soonId = useId();
  const held = useRetryHold(failure);

  const reading = recheck === "reading";
  const pending = confirm.isPending || decline.isPending || reading;
  const off = pending || held;
  const soon = held ? soonId : undefined;
  const over = ends(failure);
  const book = card.kind === "book";
  const canConfirm = CONFIRMABLE.has(card.kind);

  function run(which: "confirm" | "decline") {
    // Two taps before React draws the first as pending: the second is dropped.
    if (busyRef.current) return;
    busyRef.current = true;
    setFailure(null);
    const vars = { actionId: card.actionId, kind: card.kind, conversationId };
    const settled = {
      onError: (error: unknown) => setFailure(classifyCardError(error)),
      onSettled: () => {
        busyRef.current = false;
      },
    };
    if (which === "decline") {
      decline.mutate(vars, {
        ...settled,
        onError: (error: unknown) => {
          const failed = classifyCardError(error);
          // The re-read draws the card: an ending line here would hide it.
          if (failed.kind !== "changed" && failed.kind !== "expired") {
            setFailure(failed);
          }
        },
      });
      return;
    }
    confirm.mutate(vars, {
      ...settled,
      onError: (error: unknown) => {
        const failed = classifyCardError(error);
        if (!notThere(error)) {
          setFailure(failed);
          return;
        }
        setRecheck("reading");
        void actionsOpenNow(qc).then(
          (open) => {
            setRecheck(open ? null : "closed");
            if (open) setFailure(failed);
          },
          // Not read: the card ends as the 404 says.
          () => {
            setRecheck(null);
            setFailure(failed);
          },
        );
      },
      onSuccess: (result) => {
        // A used card is booked already: it shows Booked, never a checkout.
        if ("checkout" in result.next && result.state === "confirmed") {
          router.push(trigoCheckoutHref(result.next.checkout, card.actionId));
        }
      },
    });
  }

  const proposed = card.state === "proposed" && !over;
  const reopen = card.state === "confirmed" && book && !over;
  // Closed when the release says so, or when a confirm's 404 found it closed.
  const open = actions.open && recheck !== "closed";
  // No confirm while the release is still being read, and no line until known.
  const known = recheck === "closed" || !actions.pending;
  const shut = (proposed || reopen) && !open && known;
  const line = over ? null : stateLine(card);
  const reference = card.bookingReference ?? null;

  return (
    <div
      role="group"
      aria-labelledby={headingId}
      data-testid="trigo-action-card"
      data-state={card.state}
      className={cn(
        "border-paper-line bg-paper-deep rounded-card text-forest flex w-full max-w-[85%] flex-col gap-3 border px-4 py-3",
        card.state === "superseded" && "opacity-60",
      )}
    >
      <p id={headingId} className="label">
        <span className="sr-only">{CARD_LABEL}:</span> {card.heading}
      </p>
      {card.lines.length > 0 ? (
        <ul className="flex flex-col gap-1">
          {card.lines.slice(0, MAX_LINES).map((text, i) => (
            <li key={i} className="text-body text-pretty">
              {text}
            </li>
          ))}
        </ul>
      ) : null}

      {line ? <p className="text-body text-pretty">{line}</p> : null}
      {card.state === "used" && book && reference && !over ? (
        <p className="text-body text-pretty">
          <Link href={TRIPS_PATH} className="underline">
            {bookedLine(reference)}
          </Link>
        </p>
      ) : null}
      {proposed && !canConfirm && !shut ? (
        <p className="text-body text-pretty">{CARD_NOT_ON_WEB}</p>
      ) : null}
      {shut ? (
        <p className="text-body text-pretty">{CARD_ACTIONS_CLOSED}</p>
      ) : null}

      {confirm.isPending || reading ? (
        <p role="status" className="text-forest/70 text-body text-pretty">
          {CARD_CHECKING}
        </p>
      ) : failure ? (
        <p role="alert" className="text-body text-pretty">
          {failureLine(failure)}
        </p>
      ) : null}

      {held && (proposed || (reopen && open)) ? (
        <p id={soonId} className="text-forest/75 label">
          {TRY_AGAIN_SOON}
        </p>
      ) : null}

      {proposed ? (
        <div className="flex flex-wrap gap-2">
          {canConfirm && open ? (
            <Button
              size="sm"
              disabled={off}
              aria-describedby={soon}
              onClick={() => run("confirm")}
            >
              {card.confirmLabel}
            </Button>
          ) : null}
          <Button
            variant="outline"
            size="sm"
            disabled={off}
            aria-describedby={soon}
            onClick={() => run("decline")}
          >
            {card.declineLabel}
          </Button>
        </div>
      ) : null}
      {reopen && open ? (
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            disabled={off}
            aria-describedby={soon}
            onClick={() => run("confirm")}
          >
            {GO_TO_CHECKOUT}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
