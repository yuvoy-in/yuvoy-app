# Error map

Every code the traveller API can return, and what the screen does with it.

**The rule:** branch on `error.code`, never on `error.message`. Codes are an enum and change only
by contract change; messages are traveller-facing copy and will be edited. A UI that switches on a
message breaks silently the first time somebody improves the wording.

**Always show `requestId`.** Small and grey is fine. It is the difference between finding
somebody's exact request in the logs and guessing.

Implemented in `src/lib/api/errors.ts` and `src/components/states/index.tsx`.

**This table is not the enforcement point.** `scripts/qa.mjs` check 17 fails the build when a code
in the contract's `ErrorCode` enum is missing from `ERROR_CODES`, because that is the drift the
typechecker structurally cannot see: `YuvoyError` narrows an unrecognised code to `unknown_error`,
so the app compiles, the tests pass, and the traveller reads "Something went wrong" over a refusal
that retrying cannot fix. That shipped on `POST /bookings/review` (yuvoy-app#53), and the same
check found `unavailable` had been missing for longer.

## Transport and shape — client bugs, never product states

| Code                                     | HTTP      | Treatment                                                                                                                                                                                                                                                                                                                                                                                      |
| ---------------------------------------- | --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `invalid_input`                          | 400       | Log to Sentry, show the generic error shell. A bug in our request.                                                                                                                                                                                                                                                                                                                             |
| `unauthorized`                           | 401       | Context decides. On a **token-bearing** call (status, cancel, share, review, `/me/bookings`) the link is dead: `describeError(err, { tokenBearing: true })` → **Get a new link** (`/trips/recover`), no retry, and the device record is flagged so the Trips card says "Link expired". On the recovery / sign-in verify step it is a wrong code → "That code did not work. Ask for a new one." |
| `not_found`                              | 404       | No such thing, or not theirs.                                                                                                                                                                                                                                                                                                                                                                  |
| `conflict`                               | 409       | Generic. Prefer the specific codes below; if it arrives, refetch and re-show.                                                                                                                                                                                                                                                                                                                  |
| `rate_limited`                           | 429       | Back off and retry. Never a red error.                                                                                                                                                                                                                                                                                                                                                         |
| `internal_error`                         | 500       | Ours. Show the `requestId`.                                                                                                                                                                                                                                                                                                                                                                    |
| `method_not_allowed` · `not_implemented` | 405 / 501 | Shape errors. Client bugs.                                                                                                                                                                                                                                                                                                                                                                     |

## Availability and capacity — each names a different next step

| Code                      | Treatment                                                                                                                                                                                                                                                                                           |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `capacity_unavailable`    | "Not enough room for that party": the API sends it when the seats went AND when the party is larger than the trip takes, so the sentence names neither. **`details.remaining` has what is left: offer it.** Checkout refetches the dates and shows the API's sentence above the calendar. No retry. |
| `price_moved`             | `expectTotalPaise` no longer matches what the departure costs (yuvoy-api#193). "The price has changed": nothing held, nothing charged. Checkout refetches the dates, the bar shows the new total, and the next attempt is a new body under a new idempotency key. No retry of the old total.        |
| `request_quota_exhausted` | Too many open requests already. Explained as **not the traveller's fault**, no retry. Implemented in `describeError`.                                                                                                                                                                               |
| `request_window_closed`   | **`details.opensAt` → "they take them from 06:00"** in market time, no retry. Implemented in `describeError`.                                                                                                                                                                                       |
| `grant_ceiling_exceeded`  | Rare, operator-side. Calm copy, no retry: re-check availability. Implemented.                                                                                                                                                                                                                       |
| `cutoff_passed`           | Booking closed for this departure. **Show the slot disabled, never hidden.** A race at `POST /reservations` renders calm copy, no retry.                                                                                                                                                            |
| `stale_availability`      | The count is too old to sell against. Re-verify; do not guess.                                                                                                                                                                                                                                      |

## Deliberately stopped — 503, but not an outage

These four are somebody's decision. **A crash screen here tells the traveller Yuvoy is broken
when in fact a human stopped sales on purpose.** Calm, truthful copy; browsing stays intact; and
**no retry button** — retrying just asks the decision again.

`unavailable` is the 503 that is **not** one of these and must never be added to
`DELIBERATE_STOPS`. See below.

| Code                    | Treatment                                                                                                                                                                                                                  |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `booking_disabled`      | A kill switch is engaged. "We have stopped taking new bookings for a moment."                                                                                                                                              |
| `operator_not_bookable` | Operator paused — expired licence, safety review. "Everything else is still bookable." **In checkout it is a dead end**: the operator's standing is re-checked when a traveller re-enters, so the seat is gone. See below. |
| `payments_unavailable`  | No processor configured. **You will see this today.** Nothing charged, no seat held.                                                                                                                                       |
| `media_unavailable`     | Video provider down. Degrade to poster; the rest of the page works.                                                                                                                                                        |

## Idempotency and checkout

| Code                        | Treatment                                                                                                                                                                        |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `idempotency_key_malformed` | Client bug. Regenerate correctly, log.                                                                                                                                           |
| `idempotency_key_reuse`     | **Client bug, and a serious one. Alert on any spike** — it means we could double-book.                                                                                           |
| `idempotency_in_progress`   | An identical request is still running. **"Still working on your last tap"** — retry keeps the same key. Implemented.                                                             |
| `reservation_not_payable`   | Expired, released, or an unaccepted request. Calm copy, no retry: pick a departure again — **and the screen links there.** See below.                                            |
| `token_expired`             | **Get a new link** on every token surface (`FailurePanel` / `ErrorState` with `tokenBearing`); the Trips card shows "Link expired" and offers recovery. Never the generic retry. |

### The two checkout dead ends, and why they get a link

`CHECKOUT_DEAD_ENDS` in `src/lib/api/errors.ts` names `operator_not_bookable`
and `reservation_not_payable`. Both mean the same thing to the traveller — the
seat is gone, and the only move is picking a departure again — and both used to
render as a panel of text on a screen whose only control is a Pay button that
will fail again. The copy said "pick a departure again"; there was nothing to
tap that got them there, so the options were the browser's back button or
leaving.

`BookingScreen` now offers **See other dates**, straight to
`/e/{experience.slug}`, on those two codes and no others. The exclusion matters
as much as the inclusion: `payments_unavailable` is also a deliberate 503 and
says nothing about the hold — the seats are still held and the clock is still
running, so sending that traveller back to the dates would throw away a live
reservation. Tests pin both directions.

## Safety refusals — a different next step each

| Code                       | Treatment                                                                                                                                                                           |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `screening_required`       | We sent nothing to a listing that asks. **A client bug** — the form should have blocked.                                                                                            |
| `screening_needs_a_doctor` | **Nothing was booked and no money was taken.** "Talk to us first" — a conversation, not a failure. Somebody who has already paid is somebody who will argue to be let in the water. |
| `under_minimum_age`        | A participant's band is below the listing minimum. Checked against the **floor** of the band.                                                                                       |

## Refunds and confirmation

| Code                                   | Treatment                                                                          |
| -------------------------------------- | ---------------------------------------------------------------------------------- |
| `refund_requires_finance`              | Partial refund; a human decides. **Hide the self-service button for these tiers.** |
| `refund_quote_moved`                   | Re-quote and re-show before committing.                                            |
| `confirmation_required`                | Echo the value back to prove it was seen.                                          |
| `invalid_reason_code` · `invalid_role` | Client bugs.                                                                       |

## A 503 nobody chose

| Code          | Treatment                                                                                                                                                                                                                                                                           |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `unavailable` | The booking store behind recovery, cancellation quotes and "my trips" is not wired, so those endpoints cannot answer. **Keeps the retry**: the contract says the request was not recorded and trying later is the right move, which is why it is a 503 and not an `internal_error`. |

The bare spelling is deliberate upstream. The sibling surfaces name themselves
(`admin_unavailable`, `operator_unavailable`, `media_unavailable`); this one predates that
convention and is left as the handlers write it rather than renamed underneath a client.

The trap it sits next to: it is a 503, so it looks like the four above, and treating it as one
would tell a traveller somebody stopped their trip on purpose and offer them no way forward. It is
also not an `internal_error`, so the generic "it is us, not you" crash copy overstates it. The
sentence has to say the booking is untouched and the wait is short.

## Answering a listing's questions, and the conversation with the business

| Code               | Treatment                                                                                                                                                                   |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `answers_required` | The listing asks its own questions and at least one is unanswered. Checkout marks each named question and scrolls to it. No retry: the same body is refused identically.    |
| `answers_closed`   | The departure has left, or the booking is not going ahead. Nothing written was saved. No retry.                                                                             |
| `messages_closed`  | No more messages on this booking. `details.reason` says which of the three reasons it is, and the thread renders it in a sentence of its own. No retry: it does not reopen. |

## Booking by invitation

Declared by yuvoy-api#195. `invite_required` is the 403 `POST /reservations` answers while the
server's invite gate is on; the other three are the refusals of `POST /me/invite-codes/redeem`.
Each has its own next step, so each has its own sentence. None offers a retry: the same code is
refused the same way.

`invite_required` is the one code in this file that is **not** rendered through `describeError`.
It is not a failure to report, it is a step to take, so checkout replaces its failure panel with
the invite gate itself: sign in, then a code, then the submit button again, with every field
still holding what the traveller typed. That panel ships whatever `NEXT_PUBLIC_INVITE_ONLY` says,
because the API's gate and this app's are two switches and the API's can be turned on first.

| Code                  | Treatment                                                                                                |
| --------------------- | -------------------------------------------------------------------------------------------------------- |
| `invite_required`     | Booking needs a signed-in, admitted number. Sign in, then enter a code. Nothing held, nothing charged.   |
| `invite_code_unknown` | No such code, or one that was withdrawn (the two read alike on purpose). Check it, or ask for a new one. |
| `invite_code_used`    | One code admits one person, once. Ask for another.                                                       |
| `invite_code_expired` | Past its expiry. Ask for a new one.                                                                      |

## Reviewing a trip

`POST /bookings/review` answered `conflict` for all three of these until **2026-09-13**, when the
API split it. `conflict` stays in `ERROR_CODES` and stays handled: the code that arrives is decided
by the **deployed** API, not by the pinned document, and a deployment behind the split still
answers the old one.

| Code                   | Treatment                                                                                                                                                         |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `already_reviewed`     | **Not a failure.** A review exists and cannot be changed. `ReviewForm` renders the recorded state, with no error panel and no retry. `conflict` renders the same. |
| `not_reviewable_yet`   | The trip has not been marked completed. "Come back after you have been." No retry, and **the form is taken off the screen** rather than left with a live button.  |
| `review_window_closed` | More than 30 days have passed. Nothing to do. No retry, and the form is taken off the screen.                                                                     |

The reason the last two remove the form: #53 was a button that could never succeed. Leaving an
enabled "Leave this review" under "Too late to review this one" rebuilds the same trap with better
copy on top of it.

## Shape errors that are ours

| Code                 | Treatment                                                                                                                                                    |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `payload_too_large`  | 413, from the global 64K body limit. A client bug, and **the honest next step is not a retry**: an identical body fails identically, so a replay is a loop.  |
| `unclassified_error` | The server could not classify its own failure. Always the fallback; newly declared rather than newly emitted, which is why no client can have a case for it. |
