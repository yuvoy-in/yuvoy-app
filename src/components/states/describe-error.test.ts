import { describe, it, expect } from "vitest";
import { describeError } from "./index";
import { YuvoyError } from "@/lib/api/errors";

const err = (code: string, status: number, details?: Record<string, unknown>) =>
  new YuvoyError({ code, message: "raw", status, details, requestId: "01J" });

describe("describeError — a dead link", () => {
  it("offers recovery for token_expired, and never a retry", () => {
    const d = describeError(err("token_expired", 401));
    expect(d.recover).toBe(true);
    expect(d.canRetry).toBe(false);
    expect(d.title).toBe("This link has expired");
  });

  it("reads a 401 on a token-bearing call as a dead link", () => {
    // A revoked link and an unknown one are indistinguishable on purpose.
    const d = describeError(err("unauthorized", 401), { tokenBearing: true });
    expect(d.recover).toBe(true);
    expect(d.canRetry).toBe(false);
  });

  it("reads a 401 on the code step as a wrong code — the opposite next step", () => {
    const d = describeError(err("unauthorized", 401));
    expect(d.recover).toBeUndefined();
    expect(d.title).toBe("That code did not work");
  });
});

describe("describeError — the refusals that name a next step", () => {
  it("still names a next step for the two retired refusals", () => {
    /*
      `request_window_closed` and `request_quota_exhausted` are no longer
      returned: since yuvoy-api#170 the API takes every request, at any hour
      and however many are already waiting. Both are kept in `Error.code` on
      purpose, so exhaustive handling in a deployed client still type-checks.

      This used to assert the reopening hour, in the market's clock, off
      `opensAt`. That copy is gone rather than left to be rendered wrongly: a
      pinned contract says what the API WILL send, so the branches stay — but
      what they say has to be true if they ever fire, and "they are not taking
      them at this hour" is now a false explanation.
    */
    for (const code of ["request_window_closed", "request_quota_exhausted"]) {
      const d = describeError(
        err(code, 409, { opensAt: "2026-08-22T00:30:00Z" }),
      );
      expect(d.title, code).toBe("That request did not go through");
      // No claim about an hour, and none about the operator's queue.
      expect(d.body, code).not.toMatch(/hour|morning|06:00|too many/i);
      // Retryable now, because the reason it was refused no longer exists.
      expect(d.canRetry, code).toBe(true);
    }
  });

  it("does not offer a retry that cannot succeed", () => {
    expect(describeError(err("cutoff_passed", 409)).canRetry).toBe(false);
    expect(describeError(err("reservation_not_payable", 409)).canRetry).toBe(
      false,
    );
  });

  it("keeps the request id on every branch", () => {
    expect(describeError(err("token_expired", 401)).requestId).toBe("01J");
    expect(describeError(err("cutoff_passed", 409)).requestId).toBe("01J");
  });
});
