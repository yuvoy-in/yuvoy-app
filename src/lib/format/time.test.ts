import { describe, it, expect } from "vitest";
import { formatAge, msUntil, formatCountdown, formatMarketTime } from "./time";

describe("formatMarketTime", () => {
  it("renders in the market's zone, not the device's", () => {
    // 01:30 UTC is 07:00 IST. A 7am dive shown as 1:30am to a phone still on
    // GMT is a missed boat, and that is a realistic case for somebody who
    // flew in yesterday.
    expect(formatMarketTime("2026-08-20T01:30:00Z", "Asia/Kolkata")).toBe(
      "07:00",
    );
  });
});

describe("msUntil", () => {
  const now = new Date("2026-08-19T10:00:00Z").getTime();

  it("counts down to the server's instant", () => {
    expect(msUntil("2026-08-19T10:10:00Z", 0, now)).toBe(600_000);
  });

  it("floors at zero rather than going negative", () => {
    expect(msUntil("2026-08-19T09:00:00Z", 0, now)).toBe(0);
  });

  it("corrects for a skewed device clock", () => {
    // A device five minutes fast would otherwise show a ten-minute hold as
    // five, and expire it early on the traveller.
    expect(msUntil("2026-08-19T10:10:00Z", -300_000, now)).toBe(900_000);
  });

  it("treats an unparseable instant as expired rather than infinite", () => {
    expect(msUntil("not-a-date", 0, now)).toBe(0);
  });
});

describe("formatCountdown", () => {
  it("pads seconds", () => {
    expect(formatCountdown(65_000)).toBe("1:05");
    expect(formatCountdown(600_000)).toBe("10:00");
    expect(formatCountdown(0)).toBe("0:00");
  });
});

describe("formatAge", () => {
  const now = new Date("2026-08-19T10:00:00Z");

  it("stays coarse", () => {
    expect(formatAge("2026-08-19T09:58:00Z", now)).toBe("2m ago");
    expect(formatAge("2026-08-19T07:00:00Z", now)).toBe("3h ago");
    expect(formatAge("2026-08-18T10:00:00Z", now)).toBe("yesterday");
  });

  it("does not render a future timestamp as a negative age", () => {
    expect(formatAge("2026-08-19T11:00:00Z", now)).toBe("just now");
  });
});
