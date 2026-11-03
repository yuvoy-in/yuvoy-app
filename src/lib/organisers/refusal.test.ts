import { describe, expect, it } from "vitest";
import { NetworkError, YuvoyError } from "@/lib/api/errors";
import {
  isOrganiserField,
  organiserRefusal,
  organiserRefusalLine,
} from "./refusal";
import { ORGANISER_WORDS as W } from "./words";

function refused(
  status: number,
  code: string,
  message = "",
  details?: Record<string, unknown>,
) {
  return new YuvoyError({ status, code, message, details });
}

describe("organiserRefusal", () => {
  it("puts each field's sentence under its field", () => {
    const r = organiserRefusal(
      refused(400, "invalid_input", "Check the fields marked and try again.", {
        name: "Give the name people know you by, 2 to 120 characters.",
        "links.1": "Give a link that starts with https://.",
        somethingElse: "not a field here",
      }),
    );
    expect(r).toEqual({
      kind: "fields",
      fields: {
        name: "Give the name people know you by, 2 to 120 characters.",
        "links.1": "Give a link that starts with https://.",
      },
      message: "Check the fields marked and try again.",
    });
  });

  it("uses the one field's sentence when the answer had no line", () => {
    const r = organiserRefusal(
      refused(400, "invalid_input", "", {
        priceFromRupees: "A free event has no price.",
      }),
    );
    expect(r).toMatchObject({
      kind: "fields",
      message: "A free event has no price.",
    });
  });

  it("puts an unknown helper email under the email field", () => {
    const sentence =
      "Nobody has signed in to Yuvoy with that email yet. Ask them to sign in once with it first.";
    expect(
      organiserRefusal(
        refused(400, "no_account_with_that_email", sentence, {
          email: sentence,
        }),
      ),
    ).toEqual({
      kind: "fields",
      fields: { email: sentence },
      message: sentence,
    });
  });

  it("reads a 400 with no details as the contract line", () => {
    expect(organiserRefusal(refused(400, "invalid_input"))).toEqual({
      kind: "other",
      message: W.badBody,
    });
  });

  it("knows the numbers' on, and no group key", () => {
    expect(isOrganiserField("on")).toBe(true);
    expect(isOrganiserField("links.2")).toBe(true);
    expect(isOrganiserField("clubId")).toBe(false);
  });

  it("reads the sign-in, age, member and owner refusals", () => {
    expect(organiserRefusal(refused(401, "unauthorized", "x"))).toEqual({
      kind: "signedOut",
    });
    expect(
      organiserRefusal(refused(403, "adult_confirmation_required")),
    ).toEqual({ kind: "age", message: W.adultsOnly });
    expect(organiserRefusal(refused(403, "not_a_member"))).toEqual({
      kind: "notMember",
      message: W.notMember,
    });
    expect(organiserRefusal(refused(403, "not_owner", "Owners only."))).toEqual(
      { kind: "notOwner", message: "Owners only." },
    );
  });

  it("reads a 404 as not found, with the API's sentence", () => {
    expect(
      organiserRefusal(
        refused(404, "not_found", "We could not find that event."),
      ),
    ).toEqual({ kind: "notFound", message: "We could not find that event." });
    expect(organiserRefusal(refused(404, "not_found"))).toEqual({
      kind: "notFound",
      message: W.notFound,
    });
  });

  it("reads the 409s", () => {
    expect(organiserRefusal(refused(409, "organiser_email_required"))).toEqual({
      kind: "emailRequired",
      message: W.needEmail,
    });
    expect(organiserRefusal(refused(409, "event_has_ended", "Ended."))).toEqual(
      {
        kind: "ended",
        message: "Ended.",
      },
    );
    expect(
      organiserRefusal(refused(409, "conflict", "", { state: "pending" })),
    ).toEqual({
      kind: "conflict",
      state: "pending",
      message: W.helpersAfterCheck,
    });
    expect(
      organiserRefusal(refused(409, "conflict", "", { state: "suspended" })),
    ).toMatchObject({ message: W.suspended });
    expect(organiserRefusal(refused(409, "conflict"))).toEqual({
      kind: "conflict",
      state: null,
      message: W.notNow,
    });
  });

  it("reads a 429 as a limit with the API's sentence", () => {
    const line =
      "This organiser has posted or changed 20 events today. You can post more tomorrow.";
    expect(organiserRefusal(refused(429, "rate_limited", line))).toEqual({
      kind: "limit",
      message: line,
      retryAfterSec: null,
    });
    expect(organiserRefusal(refused(429, "rate_limited"))).toMatchObject({
      message: W.slowDown,
    });
  });

  it("reads the pause, and any other 5xx as a fault", () => {
    expect(organiserRefusal(refused(503, "organisers_paused"))).toEqual({
      kind: "paused",
      message: W.paused,
    });
    expect(organiserRefusal(refused(503, "service_unavailable", "x"))).toEqual({
      kind: "other",
      message: null,
    });
    expect(organiserRefusal(refused(500, "internal_error", "x"))).toEqual({
      kind: "other",
      message: null,
    });
  });

  it("reads no answer as network, and anything else as other", () => {
    expect(organiserRefusal(new NetworkError())).toEqual({ kind: "network" });
    expect(organiserRefusal(new Error("boom"))).toEqual({
      kind: "other",
      message: null,
    });
  });
});

describe("organiserRefusalLine", () => {
  it("says one line for any refusal", () => {
    expect(organiserRefusalLine({ kind: "signedOut" })).toBe(W.signIn);
    expect(organiserRefusalLine({ kind: "network" })).toBe(W.notNow);
    expect(organiserRefusalLine({ kind: "other", message: null })).toBe(
      W.notNow,
    );
    expect(organiserRefusalLine({ kind: "paused", message: W.paused })).toBe(
      W.paused,
    );
  });
});
