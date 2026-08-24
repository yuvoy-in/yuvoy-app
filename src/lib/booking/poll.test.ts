import { describe, it, expect } from "vitest";
import { pollIntervalMs, shouldKeepPolling, POLL_CEILING_MS } from "./poll";

describe("pollIntervalMs", () => {
  it("backs off rather than hammering", () => {
    const mid = () => 0.5; // no jitter
    expect(pollIntervalMs(0, mid)).toBe(2000);
    expect(pollIntervalMs(1, mid)).toBe(3000);
    expect(pollIntervalMs(2, mid)).toBe(5000);
  });

  it("caps rather than growing without bound", () => {
    const mid = () => 0.5;
    expect(pollIntervalMs(99, mid)).toBeLessThanOrEqual(15_000);
  });

  it("jitters, so a ferry regaining signal is not a stampede", () => {
    const low = pollIntervalMs(0, () => 0);
    const high = pollIntervalMs(0, () => 1);
    expect(low).toBeLessThan(high);
    expect(low).toBeGreaterThanOrEqual(1600);
    expect(high).toBeLessThanOrEqual(2400);
  });
});

describe("shouldKeepPolling", () => {
  it("stops the moment the server says final", () => {
    // Branch on `final`, never on a hard-coded list of terminal states.
    expect(shouldKeepPolling({ final: true }, 0)).toBe(false);
  });

  it("keeps going while the outcome is unsettled", () => {
    expect(shouldKeepPolling({ final: false }, 10_000)).toBe(true);
  });

  it("gives up at the ceiling and hands over to a human", () => {
    // A traveller who has been debited and is watching a spinner assumes the
    // worst. Better to stop and offer a person.
    expect(shouldKeepPolling({ final: false }, POLL_CEILING_MS + 1)).toBe(
      false,
    );
  });

  it("polls before the first response has arrived", () => {
    expect(shouldKeepPolling(undefined, 0)).toBe(true);
  });
});
