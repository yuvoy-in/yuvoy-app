import { describe, it, expect } from "vitest";
import {
  YuvoyError,
  isErrorCode,
  isDeliberateStop,
  isClientBug,
  isErrorEnvelope,
  parseRetryAfter,
} from "./errors";

describe("error classification", () => {
  it("treats the three 503s as deliberate, not as outages", () => {
    // An app that shows a crash screen for booking_disabled tells the
    // traveller Yuvoy is broken when a human stopped sales on purpose.
    expect(isDeliberateStop("booking_disabled")).toBe(true);
    expect(isDeliberateStop("operator_not_bookable")).toBe(true);
    // Its D-049 name, which the API sends after the traveller cut-over.
    expect(isDeliberateStop("host_not_bookable")).toBe(true);
    expect(isDeliberateStop("payments_unavailable")).toBe(true);
    expect(isDeliberateStop("capacity_unavailable")).toBe(false);
  });

  it("classifies screening_required as our bug, not a product state", () => {
    // If the traveller sees this, the booking form let them through without
    // answering — which is a defect in the form, not something to render.
    expect(isClientBug("screening_required")).toBe(true);
    // But a declared condition IS a product state, and a conversation.
    expect(isClientBug("screening_needs_a_doctor")).toBe(false);
  });

  it("keeps an unknown code from crashing the branch", () => {
    const e = new YuvoyError({
      code: "some_new_code",
      message: "x",
      status: 409,
    });
    expect(e.code).toBe("unknown_error");
    expect(isErrorCode("some_new_code")).toBe(false);
  });
});

describe("YuvoyError details", () => {
  it("exposes remaining so capacity_unavailable can offer what is left", () => {
    const e = new YuvoyError({
      code: "capacity_unavailable",
      message: "Those seats went while you were deciding.",
      status: 409,
      details: { remaining: 2 },
      requestId: "01J9F2",
    });
    expect(e.remaining).toBe(2);
    expect(e.requestId).toBe("01J9F2");
  });

  it("exposes opensAt so request_window_closed can say 'ask from 6am'", () => {
    const e = new YuvoyError({
      code: "request_window_closed",
      message: "Outside operator hours.",
      status: 409,
      details: { opensAt: "2026-08-20T00:30:00Z" },
    });
    expect(e.opensAt).toBe("2026-08-20T00:30:00Z");
  });

  it("returns undefined rather than a wrong type when details are absent", () => {
    const e = new YuvoyError({ code: "conflict", message: "x", status: 409 });
    expect(e.remaining).toBeUndefined();
    expect(e.opensAt).toBeUndefined();
  });
});

describe("isErrorEnvelope", () => {
  it("accepts the contract's envelope", () => {
    expect(
      isErrorEnvelope({ error: { code: "not_found", message: "x" } }),
    ).toBe(true);
  });

  it("rejects anything else", () => {
    expect(isErrorEnvelope(null)).toBe(false);
    expect(isErrorEnvelope({ message: "x" })).toBe(false);
    expect(isErrorEnvelope({ error: {} })).toBe(false);
  });
});

describe("parseRetryAfter", () => {
  it("reads whole seconds, as the API sends them", () => {
    expect(parseRetryAfter("2")).toBe(2);
    expect(parseRetryAfter(" 3 ")).toBe(3);
    expect(parseRetryAfter("60")).toBe(60);
  });

  it("keeps a long wait as the API sent it", () => {
    expect(parseRetryAfter("3600")).toBe(3600);
    expect(parseRetryAfter("40000")).toBe(40000);
  });

  it("ignores a number too large to hold exactly", () => {
    expect(parseRetryAfter("99999999999999999999999")).toBeUndefined();
  });

  it("ignores a missing, empty, zero or malformed value", () => {
    expect(parseRetryAfter(null)).toBeUndefined();
    expect(parseRetryAfter(undefined)).toBeUndefined();
    expect(parseRetryAfter("")).toBeUndefined();
    expect(parseRetryAfter("0")).toBeUndefined();
    expect(parseRetryAfter("-5")).toBeUndefined();
    expect(parseRetryAfter("2.5")).toBeUndefined();
    expect(parseRetryAfter("soon")).toBeUndefined();
    expect(parseRetryAfter("Wed, 21 Oct 2026 07:28:00 GMT")).toBeUndefined();
  });

  it("is carried on the error when given, and absent otherwise", () => {
    const busy = new YuvoyError({
      code: "idempotency_in_progress",
      message: "x",
      status: 409,
      retryAfterSeconds: 2,
    });
    expect(busy.retryAfterSeconds).toBe(2);
    const e = new YuvoyError({ code: "conflict", message: "x", status: 409 });
    expect(e.retryAfterSeconds).toBeUndefined();
  });
});
