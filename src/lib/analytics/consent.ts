/**
 * Analytics consent.
 *
 * Two things make this simpler than the usual banner:
 *
 *   - Nothing loads before consent. PostHog is dynamically imported inside the
 *     grant path, so a visitor who never accepts never downloads it, which is
 *     the honest reading of "opt-in" and also saves ~50 KB on a 0.5 Mbps
 *     connection.
 *   - The QR arrival path has no banner at all, because POST /v1/scans stores
 *     nothing identifying — no cookie, no device id, no IP. That is the whole
 *     reason there is no consent wall between a traveller and a QR code on a
 *     jetty, and adding an identifier here would defeat it.
 */

const KEY = "yuvoy.consent.analytics";

export type Consent = "granted" | "denied" | "unset";

/**
 * sessionStorage, not localStorage: an eslint rule bans the latter, and a
 * choice that lasts the visit is the right scope for a traveller who is here
 * for three days.
 */
export function readConsent(): Consent {
  try {
    const v = sessionStorage.getItem(KEY);
    return v === "granted" || v === "denied" ? v : "unset";
  } catch {
    // Private browsing. Treat as undecided and ask — never as granted.
    return "unset";
  }
}

export function writeConsent(value: Exclude<Consent, "unset">): void {
  try {
    sessionStorage.setItem(KEY, value);
  } catch {
    // Non-fatal: the session simply stays undecided.
  }
}

/* ------------------------------------------------------------------ react */

const listeners = new Set<() => void>();

/** Notifies subscribers so a choice made in one place updates everywhere. */
function emit(): void {
  for (const l of listeners) l();
}

export function subscribeConsent(onChange: () => void): () => void {
  listeners.add(onChange);
  return () => listeners.delete(onChange);
}

/**
 * Cached so `useSyncExternalStore` gets a stable snapshot.
 *
 * Reading sessionStorage on every render would return a new value identity
 * each time and spin React forever, which is the trap this pattern exists to
 * avoid.
 */
let cached: Consent | null = null;

export function consentSnapshot(): Consent {
  cached ??= readConsent();
  return cached;
}

/** The server knows nothing about a browser's sessionStorage. */
export function consentServerSnapshot(): Consent {
  return "unset";
}

export function setConsent(value: Exclude<Consent, "unset">): void {
  writeConsent(value);
  cached = value;
  emit();
}
