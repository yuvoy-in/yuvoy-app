"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createApiClient } from "@/lib/api/client";
import { describeError, FailurePanel, Skeleton } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";
import { cn } from "@/lib/cn";
import { civilHere, dayMonth, clockTime } from "@/lib/format/date";
import {
  MESSAGE_MAX,
  closedBecause,
  describeSendRefusal,
} from "@/lib/booking/messages";
import type { components } from "@/lib/api/schema.gen";

type BookingMessage = components["schemas"]["BookingMessage"];
type BookingMessageThread = components["schemas"]["BookingMessageThread"];

/** How often the newest page is re-read while the tab is in front. */
const POLL_MS = 30_000;

/**
 * The conversation with the business running the trip - yuvoy-app#47.
 *
 * `operatorUpdates` above this is one-way and addressed to everybody on a
 * departure. This is two-way and belongs to this booking alone: "the token is
 * the booking", so a link opens its own conversation and no other.
 *
 * ## Only the newest page is polled
 *
 * The contract is explicit that new messages land on the first page and
 * nowhere else: "a message that arrives while somebody scrolls is after the
 * first page and never inside a later one, so fetch the first page again to
 * see new messages."
 *
 * So this is NOT an infinite query. React Query refetches every loaded page of
 * one on an interval, which for somebody five pages deep is five requests
 * every thirty seconds over island signal to learn something only the first
 * could tell them. The newest page is a plain polled query; older pages are
 * fetched once, on demand, and kept - they cannot change.
 *
 * ## Reading is not marking read
 *
 * "Fetching marks nothing read." The marker is moved deliberately, to the
 * newest message actually drawn, and only while the tab is in front - "so a
 * page left polling in a pocket does not clear `unreadCount`". Visibility is
 * the honest signal available here; it does not know whether the panel is
 * scrolled into view, which is a narrower promise than the contract's "was
 * shown" and is stated rather than pretended.
 */
export function MessageThread({
  token,
  operatorName,
  bookingState,
}: {
  token: string;
  /** Who the traveller is writing to, so the panel is not addressed to nobody. */
  operatorName?: string;
  /**
   * The booking's state, because it decides whether this conversation can be
   * written in at all. See the query key.
   */
  bookingState: string;
}) {
  const [older, setOlder] = useState<BookingMessage[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [draft, setDraft] = useState("");

  const thread = useQuery({
    /*
      THE BOOKING'S STATE IS PART OF THE KEY.

      `canWrite` and `closedReason` are answers about the booking, not about
      the conversation, so they move when the booking does. Without the state
      in the key, a traveller who has just paid reads "Messages open once the
      booking is made" under the words "You are going" for up to a poll
      interval, and one whose booking was cancelled keeps a composer that the
      next send will refuse.

      A state change is a once-per-booking event, so this costs one extra
      fetch at exactly the moment the answer changed.
    */
    queryKey: ["getBookingMessages", token, bookingState],
    queryFn: async ({ signal }) => {
      const client = createApiClient();
      const { data, error } = await client.GET("/bookings/messages", {
        headers: { Authorization: `Bearer ${token}` },
        signal,
      });
      if (error) throw error;
      return data as BookingMessageThread;
    },
    /*
      Paused when the tab is not in front, which is React Query's default for
      an interval, and refetched the moment it comes back. The same shape the
      booking poller uses, and for the same reason: somebody in WhatsApp for
      two minutes should not burn four requests, and should see the truth the
      instant they return.
    */
    refetchInterval: POLL_MS,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    staleTime: 0,
    retry: false,
  });

  const loadOlder = useMutation({
    retry: false,
    mutationFn: async (from: string) => {
      const client = createApiClient();
      const { data, error } = await client.GET("/bookings/messages", {
        headers: { Authorization: `Bearer ${token}` },
        params: { query: { cursor: from } },
      });
      if (error) throw error;
      return data as BookingMessageThread;
    },
    onSuccess: (page) => {
      // Prepended, because a later page is older than everything already held.
      setOlder((prev) => [...page.messages, ...prev]);
      setCursor(page.nextCursor ?? null);
    },
  });

  const send = useMutation({
    retry: false,
    mutationFn: async (text: string) => {
      const client = createApiClient();
      const { data, error } = await client.POST("/bookings/messages", {
        headers: { Authorization: `Bearer ${token}` },
        body: { text },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: async () => {
      setDraft("");
      /*
        Refetched rather than appended from the 201.

        The re-render genuinely shows more than the answer does: anything the
        business wrote while this message was being typed lands on the same
        page, and `canWrite` and `writableUntil` can have moved. Appending the
        one message would show a thread that is a message short and a state
        that is stale.
      */
      await thread.refetch();
    },
  });

  const page = thread.data;
  /*
    Oldest at the top, which is how a conversation reads. Each page is
    oldest-first within itself and each later page is older than the one before
    it, so the pages already held are in reverse chronological order as blocks.
  */
  const messages = page ? [...older, ...page.messages] : older;
  const newest = messages.at(-1);

  /*
    WAS IT ACTUALLY ON SCREEN - yuvoy-app#47 §3.

    "Mark only what was on screen, so a page left polling in a pocket does not
    clear `unreadCount`." A visibility check alone does not say that. This
    panel sits at the foot of a long booking page, under the reference, the
    meeting point, the operator's notes and the questions, so on arrival it is
    almost always BELOW THE FOLD - and marking on page load would clear the
    unread count for messages the traveller has not scrolled to yet.

    So the list itself is observed, and the tab's visibility is read beside it
    for the pocket case, which intersection does not cover: a backgrounded tab
    keeps whatever intersection it had when it went away.
  */
  const listRef = useRef<HTMLOListElement | null>(null);
  const [onScreen, setOnScreen] = useState(false);
  const hasMessages = messages.length > 0;

  useEffect(() => {
    const element = listRef.current;
    if (!element) return;
    const observer = new IntersectionObserver(
      // A callback, not the effect body: this is an external system reporting
      // a change, which is exactly what an effect is for.
      (entries) => setOnScreen(entries.some((e) => e.isIntersecting)),
      { threshold: 0.1 },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [hasMessages]);

  const tabVisible = useTabVisible();
  const queryClient = useQueryClient();

  const markRead = useMutation({
    retry: false,
    mutationFn: async (upTo: string) => {
      const client = createApiClient();
      const { data, error } = await client.POST("/bookings/messages/read", {
        headers: { Authorization: `Bearer ${token}` },
        body: { upTo },
      });
      if (error) throw error;
      return data;
    },
    /*
      THE TRIPS LIST COUNTS FROM THIS SAME MARKER (yuvoy-api#207).

      Each `/me/bookings` row carries `unreadCount`, read off the marker this
      call just moved, and so does the dot on the Trips destination. Without
      this a traveller reads the reply, goes back to Trips and is told there
      is "1 new message" they have just read, for as long as that list stays
      cached.

      Invalidated rather than patched. The rows are keyed by reference and
      reservation, this screen is keyed by a token the list never sees (each
      row's link is minted per response), so matching the row here would be a
      guess. The list re-reads the server, which is the only thing that knows.
      A guest with no session has no such list and this touches nothing.

      Not awaited. A returned promise would hold this mutation pending until
      the list had refetched, and the badge on this panel reads the receipt:
      it would go on saying "2 new" over messages already marked, for as long
      as somebody else's request took.
    */
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["listMyBookings"] });
    },
  });

  /*
    The marker moves to what is on screen, and never backwards - the server
    refuses to move it back anyway, so a duplicate is harmless rather than
    wrong. Gated on visibility, and on there being something unread: a mark
    that fires on every poll is a request per thirty seconds saying nothing.
  */
  /*
    What was last asked to be marked, read off the mutation rather than kept
    beside it. `variables` is the argument of the last `mutate`, so it IS "the
    message we have already marked" with nothing to keep in sync - and it
    avoids a `setState` in the effect body, which cascades a second render on
    every poll and is what `react-hooks/set-state-in-effect` refuses.
  */
  const mark = markRead.mutate;
  const markedUpTo = markRead.variables ?? null;

  useEffect(() => {
    if (!page || !newest) return;
    if (page.unreadCount === 0) return;
    // Already marked this one. The server refuses to move a marker back, so a
    // repeat would be harmless, but it would also be a request saying nothing.
    if (markedUpTo === newest.id) return;
    // "Mark only what was on screen." Both halves: the panel is in view AND
    // the tab is in front. See `onScreen` for why one of them is not enough.
    if (!onScreen || !tabVisible) return;
    mark(newest.id);
  }, [page, newest, markedUpTo, mark, onScreen, tabVisible]);

  /*
    The badge reads the RECEIPT while the mark still covers the newest message
    on screen, and the poll's own count otherwise.

    `POST /bookings/messages/read` answers "what is still unread", which is
    the truth a beat before the next poll knows it. Without this the badge
    would go on saying "2 new" over messages the traveller is looking at for
    up to thirty seconds. A newer message resets it: `newest.id` moves, the
    mark no longer covers it, and the server's count is the fresher answer
    again.
  */
  const markCoversNewest = newest != null && markedUpTo === newest.id;
  const unreadCount =
    markCoversNewest && markRead.data
      ? markRead.data.unreadCount
      : (page?.unreadCount ?? 0);

  const refusal = send.error ? describeSendRefusal(send.error) : null;
  const otherFailure =
    send.error && !refusal
      ? describeError(send.error, { tokenBearing: true })
      : null;
  const canWrite = page?.canWrite ?? false;
  const over = draft.length > MESSAGE_MAX;

  return (
    <Panel className="mt-8">
      <section aria-labelledby="booking-messages">
        <div className="flex items-baseline justify-between gap-3">
          <h2 id="booking-messages" className="label text-forest/75">
            {operatorName ? `You and ${operatorName}` : "You and the operator"}
          </h2>
          {unreadCount > 0 ? (
            <span className="text-terra-deep text-xs font-bold">
              {unreadCount} new
            </span>
          ) : null}
        </div>

        {thread.isPending ? (
          <Skeleton className="mt-4 h-24 w-full" />
        ) : thread.isError ? (
          /*
            QUIET, AND NEVER THE DEAD-LINK PANEL.

            `FailurePanel` with `tokenBearing` turns a 401 into "This link no
            longer opens anything" and an offer of a fresh one. That is right
            for the cancel sheet, which a traveller opened on purpose. It is
            wrong here: this panel renders on EVERY booking page, so a
            conversation that failed to load would put an alarm about the link
            directly under a booking the same link just opened. Two statements
            on one screen, one of them false.

            `GET /bookings/status` is the authority on whether the link works,
            and it is polling. If the token really has died, the whole screen
            becomes the dead-link screen a beat later, from the call that
            actually knows. Until then this says the small true thing and
            offers the only useful action.
          */
          <div className="mt-4">
            <p className="text-forest/70 text-sm">
              We could not load your messages just now. Everything else on this
              page is up to date.
            </p>
            <Button
              variant="outline"
              size="sm"
              className="mt-3"
              disabled={thread.isFetching}
              onClick={() => void thread.refetch()}
            >
              {thread.isFetching ? "Trying…" : "Try again"}
            </Button>
          </div>
        ) : (
          <>
            {/*
              "See earlier" before the messages, because that is where the
              earlier ones will appear. `complete` is told by the server: true
              when the conversation begins on this page.
            */}
            {!page!.complete && (cursor ?? page!.nextCursor) ? (
              <Button
                variant="outline"
                size="sm"
                className="mt-4"
                disabled={loadOlder.isPending}
                onClick={() => loadOlder.mutate((cursor ?? page!.nextCursor)!)}
              >
                {loadOlder.isPending ? "Loading…" : "See earlier messages"}
              </Button>
            ) : null}

            {loadOlder.error ? (
              <p className="text-forest/70 mt-3 text-sm">
                We could not load the earlier messages. Try that again in a
                moment.
              </p>
            ) : null}

            {messages.length === 0 ? (
              <p className="text-forest/70 mt-4 text-sm">
                {canWrite
                  ? "Nothing here yet. Anything you write reaches the people running this trip."
                  : closedBecause(page!.closedReason)}
              </p>
            ) : (
              <ol
                ref={listRef}
                role="log"
                aria-live="polite"
                className="mt-4 space-y-4"
              >
                {messages.map((message) => (
                  <Message key={message.id} message={message} />
                ))}
              </ol>
            )}

            {canWrite ? (
              <form
                className="mt-5"
                onSubmit={(e) => {
                  e.preventDefault();
                  const text = draft.trim();
                  if (!text || over || send.isPending) return;
                  send.mutate(text);
                }}
              >
                <label htmlFor="message-text" className="sr-only">
                  Write to the operator
                </label>
                <textarea
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
                    className={cn(
                      "text-xs",
                      over ? "text-terra-deep" : "text-forest/70",
                    )}
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
                  <p role="alert" className="text-terra-deep mt-3 text-sm">
                    {refusal}
                  </p>
                ) : null}
                {otherFailure ? (
                  <FailurePanel failure={otherFailure} className="mt-3" />
                ) : null}
              </form>
            ) : messages.length > 0 ? (
              <p className="text-forest/70 border-paper-line mt-5 border-t pt-4 text-sm">
                {closedBecause(page!.closedReason)}
              </p>
            ) : null}
          </>
        )}
      </section>
    </Panel>
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
function useTabVisible(): boolean {
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

function Message({ message }: { message: BookingMessage }) {
  const mine = message.from === "traveller";
  return (
    <li className={cn("flex flex-col", mine ? "items-end" : "items-start")}>
      <div
        className={cn(
          "rounded-card max-w-[85%] px-4 py-3",
          mine ? "bg-forest text-paper" : "bg-paper-deep text-forest",
        )}
      >
        <p
          className={cn(
            "text-xs font-bold",
            mine ? "text-paper/70" : "text-forest/70",
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
          <p className="mt-1 text-sm whitespace-pre-line">{message.text}</p>
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
        className="text-forest/70 mt-1 text-[10px]"
      >
        {formatSent(message.sentAt)}
      </time>
    </li>
  );
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
