import { useEffect } from "react";

/**
 * Keeps the screen on while `on` and the page is in front, so a QR held up in
 * a queue is still there when the queue reaches the counter (yuvoy-app#218,
 * the web side of the app's keep-awake on the check-in code).
 *
 * The browser drops a screen wake lock by itself whenever the page is hidden,
 * so it is asked for again each time the page comes back. It is let go when
 * `on` turns false or the component goes. A browser without the Screen Wake
 * Lock API, or one that refuses (low battery, no user gesture yet, a page in
 * a frame), simply lets the screen sleep as before: nothing here throws.
 */
export function useWakeLock(on: boolean): void {
  useEffect(() => {
    if (!on) return;
    if (typeof navigator === "undefined" || !("wakeLock" in navigator)) return;

    let held: WakeLockSentinel | null = null;
    let asking = false;
    let gone = false;

    /*
      One request at a time. A tab hidden and shown again while the first
      request is still out would otherwise send a second, and the lock the
      first one brought back would be dropped from `held` and never let go.
    */
    const ask = async () => {
      if (gone || asking || document.visibilityState !== "visible") return;
      if (held && !held.released) return;
      asking = true;
      try {
        const lock = await navigator.wakeLock.request("screen");
        if (gone) {
          void lock.release().catch(() => {});
          return;
        }
        held = lock;
      } catch {
        // Refused: the screen sleeps as it would have without this.
      } finally {
        asking = false;
      }
    };

    const onVisibility = () => {
      if (document.visibilityState === "visible") void ask();
    };

    void ask();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      gone = true;
      document.removeEventListener("visibilitychange", onVisibility);
      if (held && !held.released) void held.release().catch(() => {});
      held = null;
    };
  }, [on]);
}
