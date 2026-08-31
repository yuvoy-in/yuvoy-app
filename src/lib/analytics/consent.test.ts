import { describe, it, expect, beforeEach } from "vitest";
import {
  readConsent,
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
    expect(consentServerSnapshot()).toBe("unset");
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
