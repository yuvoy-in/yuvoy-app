import { describe, it, expect, afterEach, vi } from "vitest";
import { __resetClockOffset, clockOffsetMs, recordServerDate } from "./clock";

afterEach(() => {
  __resetClockOffset();
  vi.useRealTimers();
});

describe("the clock offset", () => {
  it("is measured from the server's Date header", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-22T01:00:00Z"));
    // The phone is ten minutes fast: the server says ten minutes earlier.
    recordServerDate("Sat, 22 Aug 2026 00:50:00 GMT");
    expect(clockOffsetMs()).toBe(-10 * 60_000);
  });

  it("ignores a missing or unparseable header", () => {
    recordServerDate(null);
    recordServerDate("not a date");
    expect(clockOffsetMs()).toBe(0);
  });

  it("takes the latest reading", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-22T01:00:00Z"));
    recordServerDate("Sat, 22 Aug 2026 00:50:00 GMT");
    recordServerDate("Sat, 22 Aug 2026 01:00:00 GMT");
    expect(clockOffsetMs()).toBe(0);
  });
});
