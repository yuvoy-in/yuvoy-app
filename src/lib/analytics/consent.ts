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
 * The words the prompt asks with now, as a number (yuvoy-app#181).
 *
 * 1 asked "May we count how this app gets used?", and a yes to it counts reel
 * views. 2 is the phone app's question, word for word ("Can we count what you
 * watch and open?", yuvoy-mobile#338), which names opens, saves and shares, and
 * only a yes to 2 sends what is done with a card (`outcomesConsented`).
 *
 * An answer keeps the version it was given to, in the same value, so the two
 * can never be read apart: `granted:2`. A bare `granted` or `denied` was given
 * before there were versions, to 1. A yes at 1 is asked once more with 2's
 * words, and keeps counting reel views until it is answered; a no is never
 * asked again.
 */
export const CONSENT_VERSION = 2;

/** An answer, and the version of the words it was given to (0 with none). */
export interface ConsentAnswer {
  consent: Consent;
  version: number;
}

const UNANSWERED: ConsentAnswer = { consent: "unset", version: 0 };

function parseAnswer(raw: string | null): ConsentAnswer {
  if (raw === "granted" || raw === "denied")
    return { consent: raw, version: 1 };
  const match = /^(granted|denied):([1-9]\d{0,2})$/.exec(raw ?? "");
  if (!match) return UNANSWERED;
  return {
    consent: match[1] as Exclude<Consent, "unset">,
    version: Number(match[2]),
  };
}

/**
 * sessionStorage, not localStorage: an eslint rule bans the latter, and a
 * choice that lasts the visit is the right scope for a traveller who is here
 * for three days.
 */
export function readConsentAnswer(): ConsentAnswer {
  try {
    return parseAnswer(sessionStorage.getItem(KEY));
  } catch {
    // Private browsing. Treat as undecided and ask — never as granted.
    return UNANSWERED;
  }
}

export function readConsent(): Consent {
  return readConsentAnswer().consent;
}

/** Kept with the version of the words it answers, which are today's. */
export function writeConsent(value: Exclude<Consent, "unset">): void {
  try {
    sessionStorage.setItem(KEY, `${value}:${CONSENT_VERSION}`);
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
let cached: ConsentAnswer | null = null;

function answer(): ConsentAnswer {
  cached ??= readConsentAnswer();
  return cached;
}

/** The answer, whatever words it was given to: reel views go with any yes. */
export function consentSnapshot(): Consent {
  return answer().consent;
}

/**
 * Whether what is done with a card may be counted: a yes given to the words
 * that name it (`CONSENT_VERSION` 2 or later). See `lib/analytics/outcomes.ts`.
 */
export function outcomesConsented(): boolean {
  const { consent, version } = answer();
  return consent === "granted" && version >= 2;
}

/**
 * What the prompt has to do: ask, ask once more (a yes given to older words),
 * or nothing. A string, so `useSyncExternalStore` compares it by value.
 */
export type ConsentAsk = "ask" | "ask-again" | "none";

export function consentAskSnapshot(): ConsentAsk {
  const { consent, version } = answer();
  if (consent === "unset") return "ask";
  if (consent === "granted" && version < CONSENT_VERSION) return "ask-again";
  return "none";
}

/** What a screen can know of the prompt: `unknown` before it is in a browser. */
export type ConsentAskRead = ConsentAsk | "unknown";

/** The server cannot read this browser's answer, so it asks nothing. */
export function consentAskServerSnapshot(): ConsentAskRead {
  return "unknown";
}

/** What a screen can know of the choice: `unknown` before it is in a browser. */
export type ConsentRead = Consent | "unknown";

/**
 * The server knows nothing about a browser's sessionStorage, and says so.
 *
 * It used to answer "unset", which is a claim about this browser: the banner
 * was in every server-rendered page, so a traveller who had already chosen saw
 * it on every hard load until the page hydrated (stability audit, 6 Oct 2026).
 * `unknown` asks nothing; the browser's own answer arrives with hydration.
 */
export function consentServerSnapshot(): ConsentRead {
  return "unknown";
}

export function setConsent(value: Exclude<Consent, "unset">): void {
  writeConsent(value);
  cached = { consent: value, version: CONSENT_VERSION };
  emit();
}

/** Test-only: forget the answer read, as a new page load would. */
export function __forgetConsentRead(): void {
  cached = null;
}
