import { describe, it, expect, vi, afterEach } from "vitest";
import { act, cleanup, renderHook } from "@testing-library/react";
import { useWakeLock } from "./use-wake-lock";

/**
 * The screen stays on while the check-in code shows (yuvoy-app#218). The
 * browser drops the lock whenever the page is hidden, so it is asked for
 * again on the way back; a browser without it, or one that refuses, is not
 * an error.
 */

type Sentinel = { released: boolean; release: () => Promise<void> };

function stubWakeLock(request: () => Promise<Sentinel>) {
  Object.defineProperty(navigator, "wakeLock", {
    configurable: true,
    value: { request: vi.fn(request) },
  });
  return (
    navigator as unknown as { wakeLock: { request: ReturnType<typeof vi.fn> } }
  ).wakeLock.request;
}

function sentinel(): Sentinel {
  const s: Sentinel = {
    released: false,
    release: vi.fn(async () => {
      s.released = true;
    }),
  };
  return s;
}

function setVisibility(state: "visible" | "hidden") {
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    get: () => state,
  });
  document.dispatchEvent(new Event("visibilitychange"));
}

afterEach(() => {
  cleanup();
  delete (navigator as unknown as { wakeLock?: unknown }).wakeLock;
  setVisibility("visible");
});

describe("useWakeLock", () => {
  it("holds the screen on while on, and lets go when it goes", async () => {
    const lock = sentinel();
    const request = stubWakeLock(async () => lock);
    const { unmount } = renderHook(() => useWakeLock(true));
    await act(async () => {});
    expect(request).toHaveBeenCalledWith("screen");
    unmount();
    expect(lock.release).toHaveBeenCalled();
  });

  it("asks nothing while off", async () => {
    const request = stubWakeLock(async () => sentinel());
    renderHook(() => useWakeLock(false));
    await act(async () => {});
    expect(request).not.toHaveBeenCalled();
  });

  it("asks again when the page comes back to the front", async () => {
    let lock = sentinel();
    const request = stubWakeLock(async () => (lock = sentinel()));
    renderHook(() => useWakeLock(true));
    await act(async () => {});
    expect(request).toHaveBeenCalledTimes(1);
    // The browser releases it when the page is hidden.
    lock.released = true;
    await act(async () => setVisibility("hidden"));
    expect(request).toHaveBeenCalledTimes(1);
    await act(async () => setVisibility("visible"));
    expect(request).toHaveBeenCalledTimes(2);
  });

  it("sends one request at a time, so no lock is left held", async () => {
    const lock = sentinel();
    let grant: (s: Sentinel) => void = () => {};
    const request = stubWakeLock(
      () => new Promise<Sentinel>((resolve) => (grant = resolve)),
    );
    const { unmount } = renderHook(() => useWakeLock(true));
    // Hidden and shown again while the first request is still out.
    await act(async () => setVisibility("hidden"));
    await act(async () => setVisibility("visible"));
    expect(request).toHaveBeenCalledTimes(1);
    await act(async () => grant(lock));
    unmount();
    expect(lock.release).toHaveBeenCalled();
  });

  it("is quiet where the browser refuses or lacks it", async () => {
    stubWakeLock(async () => {
      throw new DOMException("no", "NotAllowedError");
    });
    const { unmount } = renderHook(() => useWakeLock(true));
    await act(async () => {});
    unmount();
    delete (navigator as unknown as { wakeLock?: unknown }).wakeLock;
    expect(() => renderHook(() => useWakeLock(true))).not.toThrow();
  });
});
