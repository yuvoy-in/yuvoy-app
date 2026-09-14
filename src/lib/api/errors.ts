/**
 * The error taxonomy, and the one rule that governs it:
 *
 *   BRANCH ON `code`, NEVER ON `message`.
 *
 * Codes are an enum and change only by contract change. Messages are
 * traveller-facing copy and will be edited. A UI that switches on a message
 * breaks silently the first time somebody improves the wording.
 *
 * Full treatment table: docs/ERROR_MAP.md
 */

/** Every code the traveller API can return. Mirrors the contract's enum. */
export const ERROR_CODES = [
  // Transport and shape — these are client bugs, not product states.
  "invalid_input",
  "unauthorized",
  "not_found",
  "conflict",
  "rate_limited",
  "internal_error",
  "method_not_allowed",
  "not_implemented",
  /*
    413, from the global 64K body limit — yuvoy-app#20 §3.

    A client bug in practice, and it gets its own branch for one reason: the
    honest next step is NOT a retry. An identical body fails identically, so an
    automatic replay is a loop that costs a traveller their signal and gets
    them nowhere.
  */
  "payload_too_large",
  /*
    The server could not classify its own failure. Newly declared rather than
    newly emitted — it was always the fallback and was simply not in the enum,
    which is why no client can have a case for it and nothing breaks.
  */
  "unclassified_error",
  // Availability and capacity — each names a different next step.
  "capacity_unavailable",
  "request_quota_exhausted",
  "request_window_closed",
  "grant_ceiling_exceeded",
  "cutoff_passed",
  "stale_availability",
  // Deliberately stopped. 503, but NOT an outage.
  "booking_disabled",
  "operator_not_bookable",
  "payments_unavailable",
  "media_unavailable",
  /*
    A 503 that is NOT one of the four above, and must not be added to
    `DELIBERATE_STOPS`.

    Nobody decided this. The booking store that recovery, cancellation quotes
    and "my trips" read is not wired, so those endpoints cannot answer. The
    contract is explicit that the request was not recorded and that retrying
    later is the right move, which is exactly why it is a 503 and not an
    `internal_error`. Calm "somebody stopped this on purpose" copy with no
    retry would be a lie in both halves.

    The bare spelling is deliberate upstream: the three sibling surfaces name
    themselves (`admin_unavailable`, `operator_unavailable`,
    `media_unavailable`) and this one predates that convention. It is left as
    the handlers actually write it rather than renamed underneath a client.

    Found by the ERROR_CODES drift check in `scripts/qa.mjs` the first time it
    ran, having been in the contract and absent here for some time
    (yuvoy-app#53).
  */
  "unavailable",
  // Idempotency and checkout.
  "idempotency_key_malformed",
  "idempotency_key_reuse",
  "idempotency_in_progress",
  "reservation_not_payable",
  // Booking access.
  "token_expired",
  // Safety refusals — a different next step each.
  "screening_required",
  "screening_needs_a_doctor",
  "under_minimum_age",
  // Refunds and confirmation.
  "refund_requires_finance",
  "refund_quote_moved",
  "confirmation_required",
  "invalid_reason_code",
  "invalid_role",
  /*
    The listing's own questions, and the conversation with the business
    (yuvoy-app#46, #47).

    Without these three `YuvoyError.code` falls to `unknown_error` and
    `describeError` says "Something went wrong ... trying again often fixes
    it" over three refusals that each have a true, actionable sentence behind
    them and that trying again cannot fix.
  */
  "answers_required",
  "answers_closed",
  "messages_closed",
  /*
    The three codes that replaced `conflict` on `POST /bookings/review`
    (yuvoy-app#53). The API stopped returning `conflict` there on 2026-09-13
    and split it three ways.

    `conflict` stays in the enum above and stays handled: the split is a
    change in what the API RETURNS, not in what it may return, and a client
    that stops recognising the old code breaks against any deployment that
    has not shipped the split.

    Without these three, `YuvoyError.code` falls to `unknown_error` and
    `describeError` says "Something went wrong ... trying again often fixes
    it" with a retry button, over three states that are not failures and that
    trying again cannot change.
  */
  "not_reviewable_yet",
  "already_reviewed",
  "review_window_closed",
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

const CODE_SET: ReadonlySet<string> = new Set(ERROR_CODES);

export function isErrorCode(value: unknown): value is ErrorCode {
  return typeof value === "string" && CODE_SET.has(value);
}

/**
 * The three 503s that are somebody's decision, not a failure.
 *
 * A crash screen here tells the traveller Yuvoy is broken when in fact a
 * human stopped sales on purpose. These get calm, truthful copy and leave
 * browsing intact.
 */
export const DELIBERATE_STOPS = [
  "booking_disabled",
  "operator_not_bookable",
  "payments_unavailable",
  "media_unavailable",
] as const satisfies readonly ErrorCode[];

export function isDeliberateStop(code: ErrorCode): boolean {
  return (DELIBERATE_STOPS as readonly string[]).includes(code);
}

/**
 * Codes that mean OUR client did something wrong. They must never be rendered
 * as a product state — they go to Sentry and the traveller sees the generic
 * error shell. A `screening_required` on screen means the booking form let
 * somebody through without answering, which is a bug in the form.
 */
export const CLIENT_BUGS = [
  "invalid_input",
  "payload_too_large",
  "idempotency_key_malformed",
  "screening_required",
  "invalid_reason_code",
  "invalid_role",
  "method_not_allowed",
  "not_implemented",
  /*
    413, from the global 64K body limit — yuvoy-app#20 §3.

    A client bug in practice, and it gets its own branch for one reason: the
    honest next step is NOT a retry. An identical body fails identically, so an
    automatic replay is a loop that costs a traveller their signal and gets
    them nowhere.
  */
  "payload_too_large",
  /*
    The server could not classify its own failure. Newly declared rather than
    newly emitted — it was always the fallback and was simply not in the enum,
    which is why no client can have a case for it and nothing breaks.
  */
  "unclassified_error",
] as const satisfies readonly ErrorCode[];

export function isClientBug(code: ErrorCode): boolean {
  return (CLIENT_BUGS as readonly string[]).includes(code);
}

/**
 * Codes that END a checkout, where the only move left is picking a departure
 * again.
 *
 * These are not retryable and they are not errors the traveller can wait out.
 * The seat is gone: either the hold lapsed, or the operator stopped selling
 * between holding it and paying for it. Copy alone is not enough on a screen
 * whose only control is a Pay button — a traveller reading "pick a departure
 * again" with no way to get there is being told what to do and not how.
 *
 * `operator_not_bookable` on `POST /reservations/{id}/payment-order` is the
 * newer half (yuvoy-app#19 §3). The operator's standing is now re-checked when
 * a traveller RE-ENTERS checkout rather than only when they first take a seat,
 * which closes a real window: hold seats, operator switched off, traveller
 * pays anyway.
 *
 * `reservation_not_payable` is the older and far commoner half — a lapsed
 * hold, a released reservation, a request that was never accepted. The
 * contract folds them into one code deliberately, because "they differ to us
 * and not to the traveller, whose next step is the same in every case".
 */
export const CHECKOUT_DEAD_ENDS = [
  "operator_not_bookable",
  "reservation_not_payable",
] as const satisfies readonly ErrorCode[];

export function isCheckoutDeadEnd(code: string): boolean {
  return (CHECKOUT_DEAD_ENDS as readonly string[]).includes(code);
}

/** The `{ error: { ... } }` envelope every endpoint returns on failure. */
export interface ErrorEnvelope {
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
    requestId?: string;
  };
}

export function isErrorEnvelope(body: unknown): body is ErrorEnvelope {
  if (typeof body !== "object" || body === null) return false;
  const e = (body as { error?: unknown }).error;
  return (
    typeof e === "object" &&
    e !== null &&
    typeof (e as { code?: unknown }).code === "string"
  );
}

/**
 * A typed API failure.
 *
 * `requestId` is carried deliberately and shown on error screens, small and
 * grey — it is the difference between finding somebody's exact request in the
 * logs and guessing.
 */
export class YuvoyError extends Error {
  readonly code: ErrorCode | "unknown_error";
  readonly status: number;
  readonly details: Record<string, unknown>;
  readonly requestId?: string;

  constructor(init: {
    code: string;
    message: string;
    status: number;
    details?: Record<string, unknown>;
    requestId?: string;
  }) {
    super(init.message);
    this.name = "YuvoyError";
    this.code = isErrorCode(init.code) ? init.code : "unknown_error";
    this.status = init.status;
    this.details = init.details ?? {};
    this.requestId = init.requestId;
  }

  /** Seats left, when the failure was `capacity_unavailable`. */
  get remaining(): number | undefined {
    const v = this.details.remaining;
    return typeof v === "number" ? v : undefined;
  }

  /** When requests reopen, when the failure was `request_window_closed`. */
  get opensAt(): string | undefined {
    const v = this.details.opensAt;
    return typeof v === "string" ? v : undefined;
  }

  get isDeliberateStop(): boolean {
    return isErrorCode(this.code) && isDeliberateStop(this.code);
  }

  get isClientBug(): boolean {
    return isErrorCode(this.code) && isClientBug(this.code);
  }
}

/**
 * A 401 on a token-bearing call: the link is finished, whichever code says so.
 *
 * The contract answers `token_expired` for a link past its life and the
 * generic `unauthorized` for one it does not know — a revoked one, on
 * purpose, is indistinguishable from a made-up one. Both mean the same thing
 * to the person holding the link: it opens nothing, and only a fresh one will.
 */
export function isDeadToken(error: unknown): boolean {
  return (
    error instanceof YuvoyError &&
    (error.code === "token_expired" || error.status === 401)
  );
}

/** A request that never reached the server. Distinct from an API refusal. */
export class NetworkError extends Error {
  readonly cause?: unknown;
  constructor(message = "The network did not answer.", cause?: unknown) {
    super(message);
    this.name = "NetworkError";
    this.cause = cause;
  }
}
