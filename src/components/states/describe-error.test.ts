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

/*
  Codes that were in the contract's enum and not in `ERROR_CODES`, so
  `YuvoyError` narrowed them to `unknown_error` and every one of them read
  "Something went wrong ... trying again often fixes it" (yuvoy-app#53).

  `scripts/qa.mjs` check 17 is what stops the class coming back. These assert
  that each one now says something true, which the drift check cannot.
*/
describe("describeError — codes the client used to not recognise", () => {
  const GENERIC = /trying again often fixes it/;

  it("separates the two review refusals by their next step", () => {
    const notYet = describeError(err("not_reviewable_yet", 409));
    expect(notYet.title).toBe("This trip is not finished yet");
    expect(notYet.body).not.toMatch(GENERIC);
    expect(notYet.canRetry).toBe(false);

    const closed = describeError(err("review_window_closed", 409));
    expect(closed.title).toBe("Too late to review this one");
    expect(closed.body).toMatch(/30 days/);
    expect(closed.canRetry).toBe(false);

    // Different states, so they must not share a sentence.
    expect(notYet.title).not.toBe(closed.title);
  });

  it("keeps `unavailable` retryable, and does not read it as a deliberate stop", () => {
    const d = describeError(err("unavailable", 503));
    /*
      The contract is explicit that the request was not recorded and that
      trying later is the right move. It is the one 503 in the enum that is
      neither somebody's decision nor a dead end, so both the calm
      "we stopped this on purpose" treatment and a no-retry treatment would
      be wrong.
    */
    expect(d.canRetry).toBe(true);
    expect(d.deliberate).toBe(false);
    expect(d.body).not.toMatch(GENERIC);
    // It must not suggest the booking itself is gone.
    expect(d.body).toMatch(/nothing has happened to your booking/i);
  });

  it("recognises every one of them rather than narrowing to unknown_error", () => {
    for (const code of [
      "not_reviewable_yet",
      "already_reviewed",
      "review_window_closed",
      "unavailable",
    ]) {
      expect(
        new YuvoyError({ code, message: "raw", status: 409 }).code,
        code,
      ).toBe(code);
    }
  });
});

/*
  The two checkout refusals that mean "the calendar was out of date"
  (yuvoy-app#62 item 7, yuvoy-api#193). Both fell through to the default, so a
  traveller whose price had moved read "It is us, not you, and trying again
  often fixes it", and sending the same total again is refused identically.
*/
describe("describeError: the calendar was out of date", () => {
  const GENERIC = /trying again often fixes it/;

  it("says a moved price is a moved price, and that nothing was charged", () => {
    const d = describeError(err("price_moved", 409));
    expect(d.title).toBe("The price has changed");
    expect(d.body).not.toMatch(GENERIC);
    expect(d.body).toMatch(/nothing was charged/i);
    expect(d.canRetry).toBe(false);
    expect(d.requestId).toBe("01J");
  });

  it("says there is not room for the party, without guessing why", () => {
    /*
      The API sends this code for two different reasons: the seats went, or
      the party is larger than the trip takes. The sentence must be true of
      both, because checkout shows the API's own reason above the calendar.
    */
    const d = describeError(err("capacity_unavailable", 409, { remaining: 2 }));
    expect(d.title).toBe("Not enough room for that party");
    expect(d.body).not.toMatch(GENERIC);
    expect(d.body).not.toMatch(/somebody booked|while you were deciding/i);
    expect(d.body).toMatch(/nothing was charged/i);
    expect(d.canRetry).toBe(false);
  });
});

/*
  Booking by invitation (yuvoy-api#195). Declared in the contract before the
  API that returns them was deployed, so nothing in production sends them yet.
  Each still has to say something true the day it does, and none may offer a
  retry: the same code sent again is refused the same way.
*/
describe("describeError: booking by invitation", () => {
  const GENERIC = /trying again often fixes it/;
  const CASES: [string, number][] = [
    ["invite_required", 403],
    ["invite_code_unknown", 404],
    ["invite_code_used", 409],
    ["invite_code_expired", 410],
  ];

  it("gives each refusal its own sentence, and never a retry", () => {
    const titles = new Set<string>();
    for (const [code, status] of CASES) {
      expect(new YuvoyError({ code, message: "raw", status }).code, code).toBe(
        code,
      );
      const d = describeError(err(code, status));
      expect(d.body, code).not.toMatch(GENERIC);
      expect(d.canRetry, code).toBe(false);
      titles.add(d.title);
    }
    // Four next steps, so four sentences: "invalid code" for all of them is
    // the answer that turns into a support message.
    expect(titles.size).toBe(CASES.length);
  });

  it("tells somebody refused at checkout how to get in", () => {
    const d = describeError(err("invite_required", 403));
    expect(d.body).toMatch(/sign in/i);
    expect(d.body).toMatch(/code/i);
    // A refusal at the pay step must say that no money moved.
    expect(d.body).toMatch(/nothing was charged/i);
  });
});
