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
  "idempotency_key_malformed",
  "screening_required",
  "invalid_reason_code",
  "invalid_role",
  "method_not_allowed",
  "not_implemented",
] as const satisfies readonly ErrorCode[];

export function isClientBug(code: ErrorCode): boolean {
  return (CLIENT_BUGS as readonly string[]).includes(code);
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

/** A request that never reached the server. Distinct from an API refusal. */
export class NetworkError extends Error {
  readonly cause?: unknown;
  constructor(message = "The network did not answer.", cause?: unknown) {
    super(message);
    this.name = "NetworkError";
    this.cause = cause;
  }
}
