import { describe, it, expect, beforeEach } from "vitest";
import {
  CONSENT_VERSION,
  __forgetConsentRead,
  consentAskServerSnapshot,
  consentAskSnapshot,
  outcomesConsented,
  readConsent,
  readConsentAnswer,
  setConsent,
  consentSnapshot,
  consentServerSnapshot,
  subscribeConsent,
} from "./consent";

beforeEach(() => sessionStorage.clear());

describe("analytics consent", () => {
  it("starts undecided, never granted", () => {
    // The failure mode that matters: defaulting to granted would load a
    // tracker for somebody who was never asked.
    expect(readConsent()).toBe("unset");
    // Not "unset": the server cannot know, and must not draw the banner.
    expect(consentServerSnapshot()).toBe("unknown");
  });

  it("treats an unreadable store as undecided, not as consent", () => {
    const original = sessionStorage.getItem;
    // Private browsing throws on access.
    sessionStorage.getItem = () => {
      throw new Error("blocked");
    };
    expect(readConsent()).toBe("unset");
    sessionStorage.getItem = original;
  });

  it("notifies subscribers so one choice updates every reader", () => {
    let calls = 0;
    const stop = subscribeConsent(() => (calls += 1));
    setConsent("granted");
    expect(calls).toBe(1);
    expect(consentSnapshot()).toBe("granted");
    stop();
  });

  it("returns a stable snapshot, so useSyncExternalStore cannot spin", () => {
    setConsent("denied");
    // A snapshot that allocated a fresh value each call would loop forever.
    expect(consentSnapshot()).toBe(consentSnapshot());
    expect(consentSnapshot()).toBe("denied");
  });
});

/**
 * Which words an answer was given to (yuvoy-app#181). A yes to the older
 * question counts reel views and is asked once more; only a yes to the words
 * that name opens, saves and shares counts what is done with a card.
 */
describe("the version of the words", () => {
  const stored = (value: string | null) => {
    if (value === null) sessionStorage.removeItem("yuvoy.consent.analytics");
    else sessionStorage.setItem("yuvoy.consent.analytics", value);
    __forgetConsentRead();
  };

  it("keeps the version with the answer, in one value", () => {
    setConsent("granted");
    expect(sessionStorage.getItem("yuvoy.consent.analytics")).toBe(
      `granted:${CONSENT_VERSION}`,
    );
    expect(readConsentAnswer()).toEqual({
      consent: "granted",
      version: CONSENT_VERSION,
    });
  });

  it("reads an answer from before versions as one given to the first words", () => {
    stored("granted");
    expect(readConsentAnswer()).toEqual({ consent: "granted", version: 1 });
    // Reel views go with any yes; what is done with a card does not.
    expect(consentSnapshot()).toBe("granted");
    expect(outcomesConsented()).toBe(false);
  });

  it("asks a yes to older words once more, and never asks a no again", () => {
    stored(null);
    expect(consentAskSnapshot()).toBe("ask");
    stored("granted");
    expect(consentAskSnapshot()).toBe("ask-again");
    stored("denied");
    expect(consentAskSnapshot()).toBe("none");
    stored("denied:2");
    expect(consentAskSnapshot()).toBe("none");
    stored("granted:2");
    expect(consentAskSnapshot()).toBe("none");
    expect(outcomesConsented()).toBe(true);
    // The server cannot know, and asks nothing.
    expect(consentAskServerSnapshot()).toBe("unknown");
  });

  it("reads anything it does not recognise as undecided, never as a yes", () => {
    for (const odd of [
      "granted:",
      "granted:0",
      "granted:x",
      "GRANTED",
      "yes",
    ]) {
      stored(odd);
      expect(readConsentAnswer(), odd).toEqual({
        consent: "unset",
        version: 0,
      });
      expect(outcomesConsented(), odd).toBe(false);
    }
  });
});
