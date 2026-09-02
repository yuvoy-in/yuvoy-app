/**
 * How far this device's clock is from the server's.
 *
 * Countdowns derive from the server's `expiresAt`. Subtracting the device's
 * `Date.now()` from it assumes the two clocks agree, and on a phone that is
 * ten minutes fast a real ten-minute hold reads "The hold has run out" the
 * moment it starts; on a slow one it shows minutes that do not exist. The
 * server enforces the deadline either way — this is about the screen telling
 * the truth about it.
 *
 * Every response carries a `Date` header. The API client records the offset
 * from each one; `msUntil` takes it. Second precision, which is plenty for a
 * mm:ss countdown, and the latest reading wins — a phone's clock can be
 * corrected mid-session.
 */

let offsetMs = 0;

/** Called by the API client on every response. Ignores an absent or unparseable header. */
export function recordServerDate(header: string | null): void {
  if (!header) return;
  const serverMs = Date.parse(header);
  if (!Number.isFinite(serverMs)) return;
  offsetMs = serverMs - Date.now();
}

/** Add to `Date.now()` to get the server's idea of now. */
export function clockOffsetMs(): number {
  return offsetMs;
}

/** Test-only. */
export function __resetClockOffset(): void {
  offsetMs = 0;
}
