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
  it("says when requests reopen, in the market's clock", () => {
    // 00:30Z is 06:00 IST.
    const d = describeError(
      err("request_window_closed", 409, { opensAt: "2026-08-22T00:30:00Z" }),
    );
    expect(d.body).toContain("from 06:00");
    expect(d.canRetry).toBe(false);
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
