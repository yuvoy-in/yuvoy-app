# Error map

Every code the traveller API can return, and what the screen does with it.

**The rule:** branch on `error.code`, never on `error.message`. Codes are an enum and change only
by contract change; messages are traveller-facing copy and will be edited. A UI that switches on a
message breaks silently the first time somebody improves the wording.

**Always show `requestId`.** Small and grey is fine. It is the difference between finding
somebody's exact request in the logs and guessing.

Implemented in `src/lib/api/errors.ts` and `src/components/states/index.tsx`.

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

| Code                      | Treatment                                                                                                                                |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `capacity_unavailable`    | "Those seats went while you were deciding." **`details.remaining` has what is left — offer it.**                                         |
| `request_quota_exhausted` | Too many open requests already. Explained as **not the traveller's fault**, no retry. Implemented in `describeError`.                    |
| `request_window_closed`   | **`details.opensAt` → "they take them from 06:00"** in market time, no retry. Implemented in `describeError`.                            |
| `grant_ceiling_exceeded`  | Rare, operator-side. Calm copy, no retry — re-check availability. Implemented.                                                           |
| `cutoff_passed`           | Booking closed for this departure. **Show the slot disabled, never hidden.** A race at `POST /reservations` renders calm copy, no retry. |
| `stale_availability`      | The count is too old to sell against. Re-verify; do not guess.                                                                           |

## Deliberately stopped — 503, but not an outage

These three are somebody's decision. **A crash screen here tells the traveller Yuvoy is broken
when in fact a human stopped sales on purpose.** Calm, truthful copy; browsing stays intact; and
**no retry button** — retrying just asks the decision again.

| Code                    | Treatment                                                                              |
| ----------------------- | -------------------------------------------------------------------------------------- |
| `booking_disabled`      | A kill switch is engaged. "We have stopped taking new bookings for a moment."          |
| `operator_not_bookable` | Operator paused — expired licence, safety review. "Everything else is still bookable." |
| `payments_unavailable`  | No processor configured. **You will see this today.** Nothing charged, no seat held.   |
| `media_unavailable`     | Video provider down. Degrade to poster; the rest of the page works.                    |

## Idempotency and checkout

| Code                        | Treatment                                                                                                                                                                        |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `idempotency_key_malformed` | Client bug. Regenerate correctly, log.                                                                                                                                           |
| `idempotency_key_reuse`     | **Client bug, and a serious one. Alert on any spike** — it means we could double-book.                                                                                           |
| `idempotency_in_progress`   | An identical request is still running. **"Still working on your last tap"** — retry keeps the same key. Implemented.                                                             |
| `reservation_not_payable`   | Expired, released, or an unaccepted request. Calm copy, no retry: pick a departure again.                                                                                        |
| `token_expired`             | **Get a new link** on every token surface (`FailurePanel` / `ErrorState` with `tokenBearing`); the Trips card shows "Link expired" and offers recovery. Never the generic retry. |

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
