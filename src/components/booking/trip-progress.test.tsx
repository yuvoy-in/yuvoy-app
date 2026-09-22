import { describe, it, expect, vi, afterEach } from "vitest";
import { act, render, screen, cleanup } from "@testing-library/react";
import { HoldCountdown } from "./trip-progress";

/**
 * The hold panel hands over from a time to a count (yuvoy-app#97).
 *
 * A twelve-hour hold is drawn as "Pay by ...", and it must not stay that way
 * into its last hour: that is when a traveller needs the minutes. The panel
 * re-reads the clock every thirty seconds while it shows a time, which is what
 * makes the handover happen without a reload.
 */
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("HoldCountdown", () => {
  it("turns into a countdown once a long hold is within its last hour", () => {
    vi.useFakeTimers();
    // 14:00 in the market; the hold ends at 15:01, sixty-one minutes on.
    vi.setSystemTime(new Date("2026-09-21T08:30:00Z"));
    render(<HoldCountdown expiresAt="2026-09-21T09:31:00Z" />);

    const timer = screen.getByRole("timer");
    expect(timer).toHaveTextContent("Pay by");
    expect(timer).toHaveTextContent("15:01 today");

    // A minute and a half later there are fifty-nine and a half minutes left.
    act(() => {
      vi.advanceTimersByTime(90_000);
    });
    expect(timer).toHaveTextContent("Time left to pay");
    expect(timer).toHaveTextContent("59:30");
  });

  it("reads the day in the zone it is given", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-21T08:30:00Z"));
    // 02:30Z on the 22nd is 08:00 in Kolkata and 22:30 on the 21st in New York.
    render(
      <HoldCountdown
        expiresAt="2026-09-22T02:30:00Z"
        timezone="America/New_York"
      />,
    );
    expect(screen.getByRole("timer")).toHaveTextContent("22:30 today");
  });
});
