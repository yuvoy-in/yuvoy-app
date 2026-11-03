import { describe, it, expect, afterEach, vi } from "vitest";
import { NetworkError, YuvoyError } from "@/lib/api/errors";
import { StalledError } from "@/lib/api/deadline";
import { classifyCardError } from "./actions";
import { TRIGO_WAIT_MAX_SECONDS } from "./api";

/**
 * What each failure of the card's yes and no means (yuvoy-app#223 part 2),
 * read by status and code only, and which ones carry the API's Retry-After.
 * The hooks' effects on the cache are in actions.test.tsx.
 */

afterEach(() => {
  vi.restoreAllMocks();
});

function apiError(
  status: number,
  code: string,
  message = "A sentence from the API.",
  details?: Record<string, unknown>,
) {
  return new YuvoyError({ status, code, message, details });
}

/** A refusal that sent `Retry-After`. */
function waited(
  status: number,
  code: string,
  retryAfterSeconds: number,
  details?: Record<string, unknown>,
) {
  return new YuvoyError({
    status,
    code,
    message: "Wait.",
    details,
    retryAfterSeconds,
  });
}

describe("classifyCardError", () => {
  it("reads each refusal by status and code, with the API's sentence", () => {
    expect(
      classifyCardError(
        apiError(409, "action_changed", "Changed.", { reason: "sold_out" }),
      ),
    ).toEqual({ kind: "changed", reason: "sold_out", message: "Changed." });
    for (const reason of [
      "price_moved",
      "time_moved",
      "not_bookable",
      "booking_changed",
    ]) {
      expect(
        classifyCardError(apiError(409, "action_changed", "x", { reason })),
      ).toEqual({ kind: "changed", reason, message: "x" });
    }
    expect(
      classifyCardError(
        apiError(409, "action_changed", "x", { reason: "new_reason" }),
      ),
    ).toEqual({ kind: "changed", reason: null, message: "x" });
    expect(
      classifyCardError(apiError(409, "action_expired", "Expired.")),
    ).toEqual({ kind: "expired", message: "Expired." });
    expect(
      classifyCardError(apiError(409, "date_alerts_full", "Fifty.")),
    ).toEqual({ kind: "alerts_full", message: "Fifty." });
    expect(classifyCardError(apiError(404, "not_found", "No card."))).toEqual({
      kind: "not_found",
      message: "No card.",
    });
    expect(classifyCardError(apiError(401, "unauthorized"))).toEqual({
      kind: "signed_out",
    });
    expect(classifyCardError(apiError(429, "rate_limited", "Slow."))).toEqual({
      kind: "rate_limited",
      message: "Slow.",
    });
    expect(classifyCardError(apiError(503, "unavailable", "Off."))).toEqual({
      kind: "unavailable",
      message: "Off.",
    });
  });

  it("reads anything else as a general failure", () => {
    expect(classifyCardError(apiError(409, "conflict"))).toEqual({
      kind: "failure",
    });
    expect(classifyCardError(apiError(500, "internal"))).toEqual({
      kind: "failure",
    });
    expect(classifyCardError(new Error("boom"))).toEqual({ kind: "failure" });
  });

  it("never reads the message text", () => {
    expect(
      classifyCardError(apiError(409, "conflict", "action_expired")),
    ).toEqual({ kind: "failure" });
  });

  it("carries Retry-After where a tap again follows, cut to two minutes", () => {
    expect(classifyCardError(waited(429, "rate_limited", 7))).toEqual({
      kind: "rate_limited",
      message: "Wait.",
      retryAfterSeconds: 7,
    });
    expect(classifyCardError(waited(503, "unavailable", 30))).toEqual({
      kind: "unavailable",
      message: "Wait.",
      retryAfterSeconds: 30,
    });
    expect(
      classifyCardError(waited(409, "idempotency_in_progress", 2)),
    ).toEqual({ kind: "failure", retryAfterSeconds: 2 });
    expect(classifyCardError(waited(500, "internal", 5))).toEqual({
      kind: "failure",
      retryAfterSeconds: 5,
    });
    expect(classifyCardError(waited(429, "rate_limited", 3600))).toEqual({
      kind: "rate_limited",
      message: "Wait.",
      retryAfterSeconds: TRIGO_WAIT_MAX_SECONDS,
    });
  });

  it.each([
    [
      "signed_out",
      () => waited(401, "unauthorized", 9),
      { kind: "signed_out" },
    ],
    [
      "not_found",
      () => waited(404, "not_found", 9),
      { kind: "not_found", message: "Wait." },
    ],
    [
      "changed",
      () => waited(409, "action_changed", 9, { reason: "sold_out" }),
      { kind: "changed", reason: "sold_out", message: "Wait." },
    ],
    [
      "expired",
      () => waited(409, "action_expired", 9),
      { kind: "expired", message: "Wait." },
    ],
    [
      "alerts_full",
      () => waited(409, "date_alerts_full", 9),
      { kind: "alerts_full", message: "Wait." },
    ],
    [
      "offline",
      () => {
        vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
        return waited(503, "unavailable", 9);
      },
      { kind: "offline" },
    ],
  ])("%s carries no wait, whatever Retry-After says", (_, error, expected) => {
    expect(classifyCardError(error())).toEqual(expected);
  });

  it("reads no connection as offline, and a stalled call as a failure", () => {
    expect(classifyCardError(new NetworkError())).toEqual({ kind: "offline" });
    expect(
      classifyCardError(new NetworkError(undefined, new StalledError(30_000))),
    ).toEqual({ kind: "failure" });
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    expect(classifyCardError(apiError(503, "unavailable"))).toEqual({
      kind: "offline",
    });
  });
});
