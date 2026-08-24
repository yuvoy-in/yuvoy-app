/**
 * Polling `GET /v1/bookings/status` until the outcome settles.
 *
 * Payment confirmation arrives from the provider TO US, never to the browser.
 * The browser's only honest move is to ask us and say what is true — which
 * makes this the recovery path for the riskiest moment in the product: a UPI
 * app took the screen for two minutes and handed it back with no idea what
 * happened.
 */

/** Backoff: 2s, 3s, 5s, 8s, 13s, capped, with jitter. */
const SCHEDULE_MS = [2_000, 3_000, 5_000, 8_000, 13_000];
const MAX_INTERVAL_MS = 15_000;

/**
 * A hard ceiling, after which we stop and hand over to a human.
 *
 * Spinning forever is the failure this exists to prevent: a traveller who has
 * been debited and is watching a spinner will assume the worst and book again
 * somewhere else.
 */
export const POLL_CEILING_MS = 5 * 60_000;

export function pollIntervalMs(attempt: number, random = Math.random): number {
  const base = SCHEDULE_MS[Math.min(attempt, SCHEDULE_MS.length - 1)];
  const capped = Math.min(base, MAX_INTERVAL_MS);
  // ±20% jitter. A whole ferry regains signal at once; un-jittered polling
  // turns that into a synchronised stampede on the same endpoint.
  return Math.round(capped * (0.8 + random() * 0.4));
}

/**
 * States a traveller can still be moved out of by something we are waiting on.
 *
 * Deliberately derived from `final`, not from this list — the list exists only
 * for copy decisions. Branching on a hard-coded set of terminal states is how
 * a client keeps polling forever the first time the server adds one.
 */
export const IN_FLIGHT_STATES = [
  "holding",
  "awaiting_operator",
  "verifying",
] as const;

/** Whether to keep polling. `final` is told by the server; trust it. */
export function shouldKeepPolling(
  status: { final: boolean } | undefined,
  elapsedMs: number,
): boolean {
  if (!status) return elapsedMs < POLL_CEILING_MS;
  if (status.final) return false;
  return elapsedMs < POLL_CEILING_MS;
}
