import { describe, it, expect } from "vitest";
import { COUNTDOWN_WITHIN_MS, holdDisplay } from "./hold-deadline";

/**
 * A hold's deadline, drawn as a countdown or as a time with its day
 * (yuvoy-app#97).
 *
 * The instants are chosen in UTC and read in the market's zone, Asia/Kolkata
 * (UTC+05:30), which is the whole point: 02:30Z on the 22nd is 08:00 on the
 * 22nd in the Andamans, and 18:45Z on the 21st is already 00:15 on the 22nd.
 */
const IST = "Asia/Kolkata";
/** 21 Sep 2026, 14:00 in the market (08:30Z). A Monday. */
const NOW = Date.parse("2026-09-21T08:30:00Z");

describe("the countdown, for a hold that is close", () => {
  it("keeps the ten-minute checkout hold a ticking count", () => {
    const display = holdDisplay("2026-09-21T08:40:00Z", IST, NOW);
    expect(display).toEqual({ kind: "countdown", msLeft: 600_000 });
  });

  it("keeps an hour exactly as a countdown, and no more", () => {
    const hour = new Date(NOW + COUNTDOWN_WITHIN_MS).toISOString();
    expect(holdDisplay(hour, IST, NOW).kind).toBe("countdown");
    const past = new Date(NOW + COUNTDOWN_WITHIN_MS + 60_000).toISOString();
    expect(holdDisplay(past, IST, NOW).kind).toBe("deadline");
  });

  it("draws a lapsed hold as 0:00, which is what the run-out copy hangs off", () => {
    expect(holdDisplay("2026-09-21T08:00:00Z", IST, NOW)).toEqual({
      kind: "countdown",
      msLeft: 0,
    });
  });
});

describe("a time with its day, for a hold that is not", () => {
  it("says the twelve-hour hold from an accepted request the way the API does", () => {
    // 02:30Z on the 22nd: 08:00 on Tuesday in the market.
    expect(holdDisplay("2026-09-22T02:30:00Z", IST, NOW)).toEqual({
      kind: "deadline",
      msLeft: Date.parse("2026-09-22T02:30:00Z") - NOW,
      when: "08:00 on Tue 22 Sep",
    });
  });

  it("says today, with the time, for a long hold that ends today", () => {
    // 12:00Z is 17:30 the same day in the market, three and a half hours on.
    const display = holdDisplay("2026-09-21T12:00:00Z", IST, NOW);
    expect(display.kind).toBe("deadline");
    expect(display.kind === "deadline" && display.when).toBe("17:30 today");
  });

  it("names the day for a short hold that crosses midnight in the market", () => {
    /*
      Forty-five minutes, but tomorrow. "Not today" wins over "within the
      hour": a clock face would not say which 00:15.
    */
    const lateNow = Date.parse("2026-09-21T18:00:00Z"); // 23:30 IST
    const display = holdDisplay("2026-09-21T18:45:00Z", IST, lateNow);
    expect(display.kind === "deadline" && display.when).toBe(
      "00:15 on Tue 22 Sep",
    );
  });

  it("decides 'today' in the MARKET's calendar, not the device's", () => {
    /*
      18:00Z on the 21st is still the 21st in London and already 23:30 on the
      21st here, while 19:00Z is the 22nd here. Asked in UTC this would call
      the second one "today".
    */
    const now = Date.parse("2026-09-21T17:00:00Z"); // 22:30 IST
    const display = holdDisplay("2026-09-21T19:00:00Z", IST, now);
    expect(display.kind === "deadline" && display.when).toBe(
      "00:30 on Tue 22 Sep",
    );
  });

  it("spells September the same on every runtime", () => {
    const display = holdDisplay("2026-09-22T02:30:00Z", IST, NOW);
    expect(display.kind === "deadline" && display.when).not.toContain("Sept");
  });
});

describe("what it cannot read", () => {
  it("keeps the countdown for a zone this runtime does not know", () => {
    // It cannot say a day it cannot compute, so it draws what it drew before.
    expect(holdDisplay("2026-09-22T02:30:00Z", "Mars/Olympus", NOW).kind).toBe(
      "countdown",
    );
  });

  it("treats an unreadable deadline as run out rather than as forever", () => {
    expect(holdDisplay("not a date", IST, NOW)).toEqual({
      kind: "countdown",
      msLeft: 0,
    });
  });
});
