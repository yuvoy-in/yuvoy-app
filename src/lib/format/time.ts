/**
 * Time, and the rule that makes it dangerous.
 *
 * Every slot carries `marketTimezone` (an IANA zone) plus `localDate` and
 * `localStartTime` ALREADY FORMATTED for the market. Use those.
 *
 * A 7am dive rendered as 1:30am to somebody whose phone is still on another
 * timezone is a missed boat, and that is a completely realistic scenario for a
 * traveller who flew in yesterday. `toLocaleTimeString` on a slot is banned by
 * an eslint rule; this module is the sanctioned alternative.
 */

/** Formats an instant in the market's zone. For countdowns and "last checked". */
export function formatMarketTime(
  iso: string,
  timeZone: string,
  opts?: Intl.DateTimeFormatOptions,
): string {
  return new Intl.DateTimeFormat("en-IN", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    ...opts,
  }).format(new Date(iso));
}

/**
 * "2h ago", "just now" — for `asOf` on a stale availability notice.
 * Deliberately coarse: a freshness stamp that ticks by the second invites the
 * reader to watch it rather than to act on it.
 */
export function formatAge(iso: string, now: Date = new Date()): string {
  const ms = now.getTime() - new Date(iso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return "just now";
  const mins = Math.floor(ms / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return days === 1 ? "yesterday" : `${days}d ago`;
}

/**
 * Milliseconds until an instant, floored at zero.
 *
 * Countdowns derive from the server's `expiresAt` and a measured clock offset,
 * never from local time alone — a device with a skewed clock would otherwise
 * show a hold as already expired, or as having minutes it does not have.
 */
export function msUntil(
  iso: string,
  clockOffsetMs = 0,
  now = Date.now(),
): number {
  const target = new Date(iso).getTime();
  if (!Number.isFinite(target)) return 0;
  return Math.max(0, target - (now + clockOffsetMs));
}

/** mm:ss for a hold countdown. */
export function formatCountdown(ms: number): string {
  const total = Math.ceil(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}
