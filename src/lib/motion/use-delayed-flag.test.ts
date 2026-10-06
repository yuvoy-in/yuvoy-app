import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useDelayedFlag } from "./use-delayed-flag";

/**
 * A wait is shown only once it has lasted 300ms, and once shown it stays at
 * least 300ms (T11 A, approved 4 Oct 2026). Both halves are about flashes: a
 * placeholder for a quick answer, and one that blinks away as it appears.
 */

beforeEach(() => {
  vi.useFakeTimers({
    toFake: ["setTimeout", "clearTimeout", "performance"],
  });
});
afterEach(() => vi.useRealTimers());

function flag(initial: boolean) {
  return renderHook(({ active }) => useDelayedFlag(active), {
    initialProps: { active: initial },
  });
}

const wait = (ms: number) =>
  act(() => {
    vi.advanceTimersByTime(ms);
  });

describe("useDelayedFlag", () => {
  it("shows nothing for a wait shorter than 300ms", () => {
    const { result, rerender } = flag(true);
    wait(299);
    expect(result.current).toBe(false);
    rerender({ active: false });
    wait(1000);
    expect(result.current).toBe(false);
  });

  it("shows a wait once it has lasted 300ms", () => {
    const { result } = flag(true);
    wait(300);
    expect(result.current).toBe(true);
  });

  it("keeps it shown for at least 300ms, however soon the answer lands", () => {
    const { result, rerender } = flag(true);
    wait(300);
    wait(50);
    rerender({ active: false });
    wait(249);
    expect(result.current).toBe(true);
    wait(1);
    expect(result.current).toBe(false);
  });

  it("hides at once when it has already been shown long enough", () => {
    const { result, rerender } = flag(true);
    wait(1000);
    rerender({ active: false });
    wait(0);
    expect(result.current).toBe(false);
  });

  it("stays shown when the wait resumes before it is hidden", () => {
    const { result, rerender } = flag(true);
    wait(300);
    rerender({ active: false });
    wait(100);
    rerender({ active: true });
    wait(1000);
    expect(result.current).toBe(true);
  });

  it("is never shown on the first render", () => {
    const { result } = flag(true);
    expect(result.current).toBe(false);
  });

  it("starts shown for a wait that was already on screen, and gives way at once", () => {
    /*
      The Search tab's route fallback draws the grid's skeleton; the screen
      that replaces it used to hold its own back 300ms, so the skeleton
      blanked and faded in again (6 Oct 2026).
    */
    const { result, rerender } = renderHook(
      ({ active }) => useDelayedFlag(active, { initial: true }),
      { initialProps: { active: true } },
    );
    expect(result.current).toBe(true);
    rerender({ active: false });
    wait(0);
    expect(result.current).toBe(false);
  });
});
