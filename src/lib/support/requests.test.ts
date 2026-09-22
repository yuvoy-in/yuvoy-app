import { describe, it, expect } from "vitest";
import { NetworkError, YuvoyError } from "@/lib/api/errors";
import {
  describeLookupFailure,
  isBeingHandled,
  isMissingReadSide,
  messageExcerpt,
  requestDay,
  requestWhen,
  supportStatusWords,
} from "./requests";

const refusal = (status: number, code = "not_found") =>
  new YuvoyError({ code, message: "raw", status });

/**
 * What a help request says about itself (yuvoy-api#196).
 *
 * The API models four states and stores no staff replies, so the only honest
 * things to say are where a request is, what it said, and when. These pin the
 * words, because the words are the feature.
 */
describe("a request's status, in words", () => {
  it("says each of the API's four states the way a traveller would", () => {
    expect(supportStatusWords("open")).toBe("Received");
    expect(supportStatusWords("in_progress")).toBe("Someone is on it");
    expect(supportStatusWords("resolved")).toBe("Resolved");
    // The API chose `closed` over its internal `dismissed` so it would not
    // read as a rejection. The word keeps that choice.
    expect(supportStatusWords("closed")).toBe("Closed");
  });

  it("says nothing for a state it has never heard of, rather than guess", () => {
    /*
      "Received" would claim nobody has picked it up and "Resolved" would claim
      it was dealt with. The raw token is worse than both.
    */
    expect(supportStatusWords("waiting_on_traveller")).toBeNull();
    expect(supportStatusWords(undefined)).toBeNull();
    expect(supportStatusWords("toString")).toBeNull();
  });

  it("knows which state means a person has it in hand", () => {
    expect(isBeingHandled("in_progress")).toBe(true);
    expect(isBeingHandled("open")).toBe(false);
    expect(isBeingHandled("resolved")).toBe(false);
  });
});

describe("the traveller's own words, as a line", () => {
  it("keeps a short message whole, with its whitespace collapsed", () => {
    expect(messageExcerpt("  Where do we\n\nmeet?  ")).toBe(
      "Where do we meet?",
    );
  });

  it("cuts a long one at a word, and says it was cut", () => {
    const long =
      "The operator has not confirmed my dive yet and the departure is tomorrow morning, so I would like to know whether I should still go to the jetty.";
    const excerpt = messageExcerpt(long, 60);
    expect(excerpt.endsWith("…")).toBe(true);
    expect(excerpt.length).toBeLessThanOrEqual(61);
    // Never mid-word.
    expect(long.startsWith(excerpt.slice(0, -1))).toBe(true);
    expect(long[excerpt.length - 1]).toBe(" ");
  });

  it("answers an empty string for nothing it can read", () => {
    expect(messageExcerpt(undefined)).toBe("");
    expect(messageExcerpt(42)).toBe("");
  });
});

describe("when, in the market's calendar", () => {
  it("names the day in the market's zone, not the reader's", () => {
    // 20:00 UTC on the 21st is 01:30 on the 22nd in the Andamans.
    expect(requestDay("2026-09-21T20:00:00Z")).toBe("22 Sep");
    // And September is "Sep" on every runtime, never node's "Sept".
    expect(requestDay("2026-09-05T06:00:00Z")).toBe("5 Sep");
  });

  it("says when it was sent, and when it last moved only if that was another day", () => {
    expect(
      requestWhen({
        createdAt: "2026-09-21T04:00:00Z",
        updatedAt: "2026-09-21T09:00:00Z",
      }),
    ).toBe("Sent 21 Sep");
    expect(
      requestWhen({
        createdAt: "2026-09-21T04:00:00Z",
        updatedAt: "2026-09-23T09:00:00Z",
      }),
    ).toBe("Sent 21 Sep · updated 23 Sep");
  });

  it("draws nothing rather than Invalid Date", () => {
    expect(requestDay("yesterday")).toBeNull();
    expect(
      requestWhen({
        createdAt: "not a date",
        updatedAt: "2026-09-21T04:00:00Z",
      }),
    ).toBeNull();
  });
});

describe("an API that predates the read side", () => {
  it("is a 405 on the list, or a 404 for the path", () => {
    // Before yuvoy-api#209 was deployed, only the write existed.
    expect(isMissingReadSide(refusal(405, "method_not_allowed"))).toBe(true);
    expect(isMissingReadSide(refusal(404))).toBe(true);
  });

  it("is not a refusal about the traveller, or a network that did not answer", () => {
    expect(isMissingReadSide(refusal(401, "unauthorized"))).toBe(false);
    expect(isMissingReadSide(refusal(429, "rate_limited"))).toBe(false);
    expect(isMissingReadSide(refusal(500, "internal_error"))).toBe(false);
    expect(isMissingReadSide(new NetworkError())).toBe(false);
  });
});

describe("a status check that did not work", () => {
  it("offers a way back in when the session ended, and nothing else", () => {
    const failure = describeLookupFailure(
      refusal(401, "unauthorized"),
      "session",
    );
    expect(failure.signIn).toBe(true);
    expect(failure.canRetry).toBe(false);
  });

  it("does not offer sign-in for a dead booking link, which sign-in cannot fix", () => {
    const failure = describeLookupFailure(
      refusal(401, "unauthorized"),
      "token",
    );
    expect(failure.signIn).toBeFalsy();
    expect(failure.body).toBe("This booking link cannot open it any more.");
  });

  it("keeps the reference and the WhatsApp line in view when it cannot look up at all", () => {
    for (const error of [refusal(404), refusal(405, "method_not_allowed")]) {
      const failure = describeLookupFailure(error, "session");
      expect(failure.body).toBe(
        "We cannot look this one up here. Keep the reference: the reply comes on WhatsApp.",
      );
      // The same answer again would be the same refusal.
      expect(failure.canRetry).toBe(false);
    }
  });

  it("asks for a moment on 429, and blames the signal on a dropped request", () => {
    expect(
      describeLookupFailure(refusal(429, "rate_limited"), "token").canRetry,
    ).toBe(true);
    const offline = describeLookupFailure(new NetworkError(), "session");
    expect(offline.canRetry).toBe(true);
    expect(offline.body).toMatch(/island signal/);
  });

  it("never reads as though the request itself failed", () => {
    for (const error of [
      new NetworkError(),
      refusal(401, "unauthorized"),
      refusal(404),
      refusal(429, "rate_limited"),
      refusal(503, "unavailable"),
    ]) {
      const { body } = describeLookupFailure(error, "session");
      expect(body).not.toMatch(/not sent|did not send|lost/i);
    }
  });
});
