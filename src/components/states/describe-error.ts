"use client";

/*
  The error map, moved out of index.tsx so neither file runs past 500 lines.
  index.tsx re-exports all three, so every caller still imports them from
  "@/components/states".
*/
import { YuvoyError, NetworkError } from "@/lib/api/errors";
import { answersHoldContactDetails } from "@/lib/booking/answers";

/** Where a traveller goes when the link they hold no longer opens anything. */
export const RECOVER_PATH = "/trips/recover";

export interface DescribedError {
  title: string;
  body: string;
  requestId?: string;
  canRetry: boolean;
  deliberate: boolean;
  /**
   * The token this request carried is dead — expired, or replaced by a newer
   * link. The only way forward is a fresh link to the number that booked, so
   * the screen offers that instead of a retry that can never succeed.
   */
  recover?: boolean;
}

/**
 * Turns any thrown value into copy a traveller can act on.
 *
 * Three rules encoded here, each from the brief:
 *   - Branch on `code`, never on `message`.
 *   - A 503 is often DELIBERATE. `booking_disabled` and `operator_not_bookable`
 *     mean somebody stopped sales on purpose — calm and true, not a crash.
 *   - Always show `requestId`. Small and grey is fine; it is the difference
 *     between finding the request in the logs and guessing.
 *
 * `tokenBearing` says the request was authenticated by a status token. It
 * changes what a 401 means: on a token-bearing call it is the link dying
 * (the contract answers `token_expired` for a link past its life, and the
 * generic `unauthorized` for one it does not know — a revoked one, on
 * purpose, looks identical), and the way forward is recovery. On the
 * recovery flow itself a 401 is a wrong code, and the way forward is another
 * code. Same status, opposite next steps; the screen has to say which.
 */
export function describeError(
  error: unknown,
  context: { tokenBearing?: boolean } = {},
): DescribedError {
  if (error instanceof NetworkError) {
    return {
      title: "No connection",
      body: "We could not reach Yuvoy. This is usually a weak signal rather than you.",
      canRetry: true,
      deliberate: false,
    };
  }

  if (error instanceof YuvoyError) {
    const base = {
      requestId: error.requestId,
      deliberate: error.isDeliberateStop,
    };
    switch (error.code) {
      case "token_expired":
        return {
          ...base,
          title: "This link has expired",
          body: "Booking links stop working after a while, and a newer link replaces an older one. We can send a fresh one to the number you booked with. Nothing about the booking itself has changed.",
          canRetry: false,
          recover: true,
        };
      case "unauthorized":
        if (context.tokenBearing) {
          return {
            ...base,
            title: "This link no longer opens anything",
            body: "It may have expired, or a newer link may have replaced it. We can send a fresh one to the number you booked with.",
            canRetry: false,
            recover: true,
          };
        }
        return {
          ...base,
          title: "That code did not work",
          body: "It may be wrong, expired, or already used. Ask for a new one. We answer the same way whatever was wrong with it.",
          canRetry: false,
        };
      /*
        RETIRED, and kept only as a fallback — yuvoy-app#32, yuvoy-api#170.

        The API takes every request now, at any hour and however many are
        already waiting on a departure; `request_window_closed` and
        `request_quota_exhausted` "are no longer returned (since 2026-09-13)".
        They stay in the `Error.code` enum on purpose, so exhaustive handling
        in a deployed client still type-checks.

        The panel that rendered this on the listing is gone. These two entries
        are not: a pinned contract says what the API WILL send, and this map is
        the last thing between an unknown code and a traveller reading a raw
        token. The copy is trimmed to what is still true — nothing was sent,
        and nothing is held — with the "not at this hour" reasoning removed,
        because it is no longer the reason and would be a false explanation.
      */
      case "request_window_closed":
        return {
          ...base,
          title: "That request did not go through",
          body: "Nothing was sent and no seats are held. Try again, or pick another departure.",
          canRetry: true,
        };
      /*
        THE CALENDAR WAS OUT OF DATE - yuvoy-app#62 item 7, yuvoy-api#193.

        Both are checkout refusals about the availability the page was drawn
        from, not about the form. The screen above refetches the dates and puts
        the API's own sentence over the calendar; these are what the panel
        beside the button says. They used to fall through to the default, so a
        traveller whose price had just moved read "It is us, not you, and
        trying again often fixes it". Sending the same total again is refused
        the same way, which is why neither offers a retry: the next attempt is
        a new agreement at the new total, not a replay.
      */
      /*
        Worded for both of the API's reasons. It sends this code when the
        seats went while somebody was deciding AND when the party is larger
        than the trip takes ("that is a larger party than this experience
        takes"), so a sentence that named one cause would contradict the
        API's own sentence, which checkout shows above the calendar.
      */
      case "capacity_unavailable":
        return {
          ...base,
          title: "Not enough room for that party",
          body: "This departure cannot take that many people now. Nothing was held and nothing was charged. Try fewer people, or pick another departure above.",
          canRetry: false,
        };
      case "price_moved":
        return {
          ...base,
          title: "The price has changed",
          body: "This departure no longer costs what you were shown, so nothing was held and nothing was charged. The prices have been refreshed. Check the total below before you book again.",
          canRetry: false,
        };
      case "cutoff_passed":
        return {
          ...base,
          title: "Booking has closed for this departure",
          body: "It is too close to the departure to take a new booking. Nothing was sent. Another day is still open.",
          canRetry: false,
        };
      case "reservation_not_payable":
        return {
          ...base,
          title: "This one cannot be paid for any more",
          body: "The hold has ended, or the request was not accepted. Nothing was charged. Pick a departure again to start over.",
          canRetry: false,
        };
      // Retired with `request_window_closed` above, and kept for the same
      // reason: a code the API no longer sends is still a code it declares.
      case "request_quota_exhausted":
        return {
          ...base,
          title: "That request did not go through",
          body: "Nothing was sent and no seats are held. Try again, or pick another departure.",
          canRetry: true,
        };
      case "grant_ceiling_exceeded":
        return {
          ...base,
          title: "Those seats are no longer there",
          body: "The operator could not grant that many just now. Nothing was charged. Check the dates again, the count has moved.",
          canRetry: false,
        };
      case "idempotency_in_progress":
        return {
          ...base,
          title: "Still working on your last tap",
          body: "Your previous attempt is still being processed. Give it a moment. It finishes on its own, and trying again continues the same booking rather than starting a second one.",
          canRetry: true,
        };
      case "booking_disabled":
        return {
          ...base,
          title: "Booking is paused",
          body: "We have stopped taking new bookings for a moment while we check something. You can still look around, and it will be back shortly.",
          canRetry: false,
        };
      case "operator_not_bookable":
      // Its D-049 name, sent after the traveller cut-over: the same stop.
      case "host_not_bookable":
        return {
          ...base,
          title: "This operator is paused",
          body: "We pause an operator while we re-check a licence or a safety item. Everything else is still bookable.",
          canRetry: false,
        };
      case "payload_too_large":
        /*
          413 from the 64K body limit. `canRetry: false` is the load-bearing
          part: an identical body fails identically, so offering the button
          would be a loop that costs island signal and reaches nothing.
        */
        return {
          ...base,
          title: "That was too much to send",
          body: "Something in what you sent is larger than we can accept. Trying again with the same thing will not work. Shorten it, or send us a message and we will help.",
          canRetry: false,
        };
      case "payments_unavailable":
        return {
          ...base,
          title: "Payment is not available yet",
          body: "We cannot take a payment right now. Nothing has been charged and no seat has been held.",
          canRetry: false,
        };
      case "media_unavailable":
        return {
          ...base,
          title: "Video is unavailable",
          body: "The clips are not loading. Everything else on the page still works.",
          canRetry: true,
        };
      case "stale_availability":
        return {
          ...base,
          title: "We cannot confirm seats",
          body: "Nobody has checked this departure with the operator recently enough for us to sell against it. Try another day, or ask us.",
          canRetry: true,
        };
      case "rate_limited":
        return {
          ...base,
          title: "One moment",
          body: "That was a lot of requests at once. Give it a few seconds.",
          canRetry: true,
        };
      /*
        THE LISTING'S OWN QUESTIONS - yuvoy-app#46.

        `answers_required` reaches a screen that can do better than this panel:
        the checkout form marks each named question and scrolls to it. This
        copy is what is read BESIDE that, and what is read anywhere the form
        is not, so it says the true thing and never offers a retry - the same
        body sent again is refused identically.
      */
      case "answers_required":
        /*
          The same code when an answer holds a phone number, an email address
          or a link (yuvoy-api#282 item 5), refused rather than dropped. The
          questions were answered then, and "need an answer" would send the
          traveller looking for a blank that is not there. The form marks the
          answer with the API's own reason.
        */
        if (answersHoldContactDetails(error)) {
          return {
            ...base,
            title: "An answer has contact details in it",
            body: "Answers cannot include a phone number, an email address or a link. Change the marked answer and try again. Nothing was held and nothing was charged.",
            canRetry: false,
          };
        }
        return {
          ...base,
          title: "Some questions need an answer first",
          body: "This trip asks a few questions of its own, and at least one of them has to be answered before it can be booked. Nothing was held and nothing was charged.",
          canRetry: false,
        };
      case "answers_closed":
        return {
          ...base,
          title: "This booking is no longer taking answers",
          body: "Its departure has left, or the booking is no longer going ahead. Nothing you just wrote was saved. If it still matters, send it to us and we will pass it on.",
          canRetry: false,
        };
      /*
        THE CONVERSATION WITH THE BUSINESS - yuvoy-app#47.

        `messages_closed` reaches the thread, which renders the reason from
        `details.reason` in a sentence of its own. This is what is read
        anywhere that panel is not, and it never offers a retry: the
        conversation does not reopen.
      */
      case "messages_closed":
        return {
          ...base,
          title: "This conversation is closed",
          body: "No more messages can be sent on this booking. Everything already written can still be read. If something still needs sorting, send it to us and we will pass it on.",
          canRetry: false,
        };
      /*
        A 503 nobody chose. The booking store behind recovery, cancellation
        quotes and "my trips" is not wired, so those endpoints cannot answer.

        It keeps the retry, unlike the four deliberate stops, because the
        contract says the request was not recorded and that trying later is
        the right move. What changes from the default is the promise: this is
        temporary and it is not the traveller's booking that is wrong, so the
        copy must not imply their trip is gone.
      */
      case "unavailable":
        return {
          ...base,
          title: "We cannot reach your bookings",
          body: "This part of Yuvoy is not answering at the moment. Nothing has happened to your booking, and nothing you just did was recorded. Try again shortly.",
          canRetry: true,
        };
      /*
        REVIEWING A TRIP, the two of the three new codes that are not
        "already recorded" (yuvoy-app#53).

        `already_reviewed` is deliberately NOT here. It is a recorded state,
        not a failure, and `ReviewForm` renders it as the recorded review
        rather than as an error panel. It reaches this switch only from
        somewhere that has no such state to show, and the default is honest
        enough there.

        Neither of these offers a retry, and they are separated because the
        next step differs: one is "come back later", the other is "there is
        nothing to do".
      */
      case "not_reviewable_yet":
        return {
          ...base,
          title: "This trip is not finished yet",
          body: "A review can be left once the trip has run and the operator has marked it done. Come back after you have been.",
          canRetry: false,
        };
      case "review_window_closed":
        return {
          ...base,
          title: "Too late to review this one",
          body: "Reviews close 30 days after a trip. This one is past that, so it can no longer be reviewed.",
          canRetry: false,
        };
      case "not_found":
        return {
          ...base,
          title: "Not found",
          body: "This is not something we have, or it is no longer listed.",
          canRetry: false,
        };
      /*
        BOOKING BY INVITATION - yuvoy-api#195.

        `invite_required` is what checkout gets while the server's gate is on
        and the traveller is not signed in with an admitted number. The code
        screen is the real answer to it; this is what is read anywhere that
        screen is not. The other three are the code screen's own refusals, and
        each names the one thing that helps, because "invalid code" for all
        three is the sentence that turns into a support message.

        None offers a retry: the same code sent again is refused identically.
      */
      case "invite_required":
        return {
          ...base,
          title: "Yuvoy is by invitation",
          body: "Booking needs an invite code. Sign in with your number, then enter the code you were given. Nothing was held and nothing was charged.",
          canRetry: false,
        };
      /*
        Also what a code given for one number answers any other number, in
        any state (yuvoy-api#195, 10 Oct 2026): so the second thing to check
        is the number signed in, which the code screen shows above the field.
      */
      case "invite_code_unknown":
        return {
          ...base,
          title: "We do not recognise that code",
          body: "Check it against the one you were given. If it was given for a phone number, sign in with that number: it works for no other. If it still does not work, ask for a new one.",
          canRetry: false,
        };
      case "invite_code_used":
        return {
          ...base,
          title: "That code has already been used",
          body: "Each code lets one person in, once. Ask whoever gave it to you for another.",
          canRetry: false,
        };
      case "invite_code_expired":
        return {
          ...base,
          title: "That code has expired",
          body: "Ask whoever gave it to you for a new one.",
          canRetry: false,
        };
      /*
        CLOSING AN ACCOUNT (B9, D13). A 403 from signing in and from finding a
        booking, only after the code checked out: this number closed its
        account and the request to erase it is still open. The contract says
        to render the API's message, which tells the traveller to contact
        support if closing it was a mistake; the body here is only for a
        refusal that arrives without one. No retry: the same code is refused
        the same way until our staff finish or refuse the request.
      */
      case "account_deletion_pending":
        return {
          ...base,
          title: "This account is being closed",
          body:
            error.message.trim() ||
            "This number closed its Yuvoy account, so it cannot sign in. If that was a mistake, contact us.",
          canRetry: false,
        };
      /*
        A sign-in door switched off in `features.signIn` (yuvoy-api a2aec936).
        A decision, not an outage: the same request is refused the same way
        until the door opens, so there is no retry, and the API's sentence is
        shown when it sends one.
      */
      case "sign_in_unavailable":
        return {
          ...base,
          title: "Signing in is switched off",
          body:
            error.message.trim() ||
            "This way of signing in is switched off for now, so nothing was sent.",
          canRetry: false,
        };
      /*
        Tables paused (yuvoy-app#194): "paused, not broken". Not a deliberate
        stop: the table page offers Try again, and one read is all it costs.
        The table page draws its own paused state; this is for anywhere else
        the code lands.
      */
      case "tables_unavailable":
        return {
          ...base,
          title: "Tables are paused right now",
          body:
            error.message.trim() ||
            "Nothing is lost. Your requests and seats come back as they were when we open tables again.",
          canRetry: true,
        };
      /*
        Withdraw's 409 (yuvoy-app#194): the table has started, or it was
        cancelled. Asking again is refused the same way, so no retry.
      */
      case "table_closed":
        return {
          ...base,
          title: "This table is closed",
          body: error.message.trim() || "Requests for this table are closed.",
          canRetry: false,
        };
      default:
        return {
          ...base,
          title: "Something went wrong",
          body: "That did not work. It is us, not you, and trying again often fixes it.",
          canRetry: true,
        };
    }
  }

  return {
    title: "Something went wrong",
    body: "That did not work. Trying again often fixes it.",
    canRetry: true,
    deliberate: false,
  };
}
