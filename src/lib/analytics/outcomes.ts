import type { components } from "@/lib/api/schema.gen";
import { api } from "@/lib/api/client";
import { NetworkError, YuvoyError } from "@/lib/api/errors";
import { clockOffsetMs } from "@/lib/booking/clock";
import { outcomesConsented, subscribeConsent } from "./consent";
import {
  MAX_EVENT_AGE_MS,
  MAX_PER_CALL,
  SEND_AT,
  retryDelayMs,
  rfc3339,
  slowDownMs,
  uuidV4,
  type SendOutcome,
} from "./reel-views";

/**
 * What people do with a card, for learning what to show first
 * (yuvoy-app#181, R0-T5; the API's R0-T4, `POST /outcomes`).
 *
 * Five things are counted: a card shown, opened, saved, shared, or its link
 * followed out of the app. The rules are reel views' (`reel-views.ts`), word
 * for word, and the same as the phone app's (yuvoy-mobile#338):
 *
 *   - **Only with analytics consent, given to the words that name these**
 *     (`outcomesConsented`: a yes at consent version 2). A yes given to the
 *     older words still counts reel views, and is asked once more. Nothing is
 *     recorded, queued or sent without it, and withdrawing it drops what is
 *     queued and aborts what is in flight.
 *   - **Anonymously.** The plain client, straight to the API: never through
 *     `/api/v1`, which would attach the session cookie, and never with an
 *     `Authorization` header. An event has no device id, account, text,
 *     query or place: the server takes the place from the card.
 *   - **Never persisted.** The queue lives in memory, and an event that could
 *     not go before the page went away is lost.
 *   - **Batched as the API asks**: at `SEND_AT` waiting, and whenever the page
 *     is hidden or left (then with `keepalive`); one to fifty a call; a network
 *     failure or a 5xx sends the same batch with the same ids again, with
 *     backoff ("the same id again is stored once"); a 429 pauses all sending;
 *     a 400 or a 404 is refused and dropped; a 202 settles every event in the
 *     batch, stored or dropped by index; an event over 24 hours old is dropped
 *     before it goes.
 *   - **`shown` once per card and surface per page load.** A reel scrolled
 *     back to is the same card seen again, not a second showing.
 */

export type OutcomeEvent = components["schemas"]["OutcomeEvent"];
export type OutcomeSurface = components["schemas"]["OutcomeSurface"];

/** What the web sends in R0. `problem_reported` waits for R2's found items. */
export type OutcomeKind = "shown" | "opened" | "saved" | "shared" | "link_out";

/** What a screen records: the rest is the collector's. */
export interface Outcome {
  kind: OutcomeKind;
  /** An experience in R0; R2's found items are `event`. */
  subjectType?: "experience";
  /** The experience's id. */
  subjectId: string;
  surface: OutcomeSurface;
  /** Its place in the list it was shown in, from 0. */
  position?: number;
}

/** The API refuses a position past this. */
export const MAX_POSITION = 999;

const KINDS: ReadonlySet<string> = new Set<OutcomeKind>([
  "shown",
  "opened",
  "saved",
  "shared",
  "link_out",
]);

const SURFACES: ReadonlySet<string> = new Set<OutcomeSurface>([
  "feed",
  "search",
  "listing",
  "saved",
  "business",
  "shared_link",
]);

export interface OutcomeDeps {
  send(
    events: OutcomeEvent[],
    options: { keepalive: boolean; signal: AbortSignal },
  ): Promise<SendOutcome>;
  /** The SERVER's now, in epoch milliseconds. */
  now(): number;
  uuid(): string;
  /** Whether consent to these words is granted, right now. */
  consented(): boolean;
  setTimer(run: () => void, ms: number): unknown;
  clearTimer(handle: unknown): void;
  random(): number;
  /** How many waiting events trigger a send. `SEND_AT` unless a test says. */
  sendAt?: number;
}

interface Batch {
  events: OutcomeEvent[];
  attempts: number;
  inFlight: AbortController | null;
  timer: unknown;
}

/** A position the API takes, or none: a bad one would cost the whole event. */
function positionOf(position: number | undefined): number | undefined {
  return Number.isInteger(position) &&
    (position as number) >= 0 &&
    (position as number) <= MAX_POSITION
    ? position
    : undefined;
}

export function createOutcomeCollector(deps: OutcomeDeps) {
  /** Recorded events, waiting to be batched. */
  let waiting: OutcomeEvent[] = [];
  /** Batches cut from `waiting`, each sent until it is settled. */
  const outbox: Batch[] = [];
  /** No sending before this instant, after a 429. */
  let pausedUntil = 0;
  let slowDowns = 0;
  /** The cards already counted as shown, as `surface subjectId`. */
  let shown = new Set<string>();

  const settle = (batch: Batch) => {
    const at = outbox.indexOf(batch);
    if (at >= 0) outbox.splice(at, 1);
    if (batch.timer !== null) deps.clearTimer(batch.timer);
    batch.timer = null;
  };

  const later = (batch: Batch, ms: number) => {
    if (batch.timer !== null) deps.clearTimer(batch.timer);
    batch.timer = deps.setTimer(() => {
      batch.timer = null;
      void send(batch, false);
    }, ms);
  };

  async function send(batch: Batch, keepalive: boolean): Promise<void> {
    if (!deps.consented()) {
      withdraw();
      return;
    }
    if (batch.inFlight || !outbox.includes(batch)) return;

    const now = deps.now();
    if (now < pausedUntil) {
      later(batch, pausedUntil - now);
      return;
    }

    // The API drops an event over a day old, so it is not sent.
    batch.events = batch.events.filter(
      (event) => now - Date.parse(event.occurredAt) <= MAX_EVENT_AGE_MS,
    );
    if (batch.events.length === 0) {
      settle(batch);
      return;
    }

    const controller = new AbortController();
    batch.inFlight = controller;
    let outcome: SendOutcome;
    try {
      outcome = await deps.send(batch.events, {
        keepalive,
        signal: controller.signal,
      });
    } catch {
      outcome = { kind: "refused" };
    }
    batch.inFlight = null;
    // Withdrawn while it was in the air: nothing more happens to it.
    if (controller.signal.aborted || !outbox.includes(batch)) return;

    switch (outcome.kind) {
      case "accepted":
        /*
          Stored, or dropped by index and "not to be retried": the whole batch
          is settled, and a dropped event never comes back in a later one.
        */
        slowDowns = 0;
        settle(batch);
        return;
      case "refused":
        settle(batch);
        return;
      case "retry":
        batch.attempts += 1;
        later(batch, retryDelayMs(batch.attempts, deps.random));
        return;
      case "slow-down":
        slowDowns += 1;
        pausedUntil = deps.now() + slowDownMs(slowDowns);
        later(batch, pausedUntil - deps.now());
        return;
    }
  }

  /** Cut what is waiting into batches of at most fifty and send every batch. */
  function flush(options: { keepalive?: boolean } = {}): void {
    if (!deps.consented()) {
      withdraw();
      return;
    }
    while (waiting.length > 0) {
      outbox.push({
        events: waiting.splice(0, MAX_PER_CALL),
        attempts: 0,
        inFlight: null,
        timer: null,
      });
    }
    for (const batch of [...outbox]) {
      // A batch waiting out a backoff keeps waiting, unless the page is going
      // away: then this is its last chance, and `keepalive` is what gives it one.
      if (batch.timer !== null && !options.keepalive) continue;
      if (batch.timer !== null) {
        deps.clearTimer(batch.timer);
        batch.timer = null;
      }
      void send(batch, Boolean(options.keepalive));
    }
  }

  /**
   * Consent is gone: drop everything, abort what is in flight, record
   * nothing. The cards counted as shown are forgotten with the queue they
   * were in, so a yes given again counts what is seen from then on.
   */
  function withdraw(): void {
    waiting = [];
    shown = new Set();
    for (const batch of outbox.splice(0)) {
      batch.inFlight?.abort();
      if (batch.timer !== null) deps.clearTimer(batch.timer);
      batch.timer = null;
    }
    pausedUntil = 0;
    slowDowns = 0;
  }

  /** Something happened to a card. Never throws, and records nothing without consent. */
  function record(outcome: Outcome): void {
    try {
      if (!deps.consented()) return;
      if (!KINDS.has(outcome.kind) || !SURFACES.has(outcome.surface)) return;
      if (typeof outcome.subjectId !== "string" || !outcome.subjectId.trim()) {
        return;
      }
      if (outcome.kind === "shown") {
        const card = `${outcome.surface} ${outcome.subjectId}`;
        if (shown.has(card)) return;
        shown.add(card);
      }

      const position = positionOf(outcome.position);
      waiting.push({
        eventId: deps.uuid(),
        kind: outcome.kind,
        subjectType: "experience",
        subjectId: outcome.subjectId,
        surface: outcome.surface,
        ...(position === undefined ? {} : { position }),
        occurredAt: rfc3339(deps.now()),
      });
      if (waiting.length >= (deps.sendAt ?? SEND_AT)) flush();
    } catch {
      // Counting must never break a screen.
    }
  }

  return {
    record,
    flush,
    withdraw,
    /** For tests: what is queued and what is being sent. */
    inspect: () => ({
      waiting: [...waiting],
      batches: outbox.map((batch) => [...batch.events]),
    }),
  };
}

export type OutcomeCollector = ReturnType<typeof createOutcomeCollector>;

/* ------------------------------------------------------------ the wire -- */

/**
 * One call to `POST /outcomes`, straight to the API.
 *
 * The plain client: its base is the API itself, not this app's `/api/v1`
 * proxy, and it sets no `Authorization` header, so the call carries no
 * session and the events are anonymous by construction. `keepalive` lets the
 * request outlive a page that is being hidden or closed.
 */
export async function sendOutcomes(
  events: OutcomeEvent[],
  options: { keepalive: boolean; signal: AbortSignal },
): Promise<SendOutcome> {
  try {
    const { data } = await api.POST("/outcomes", {
      body: { events },
      keepalive: options.keepalive,
      signal: options.signal,
    });
    return {
      kind: "accepted",
      dropped: (data?.droppedEvents ?? []).map((drop) => drop.index),
    };
  } catch (error) {
    if (error instanceof NetworkError) return { kind: "retry" };
    if (error instanceof YuvoyError) {
      if (error.status === 429) return { kind: "slow-down" };
      if (error.status >= 500) return { kind: "retry" };
    }
    // A 400, a 404 (an API without outcomes), a 413: the same batch would
    // fail the same way.
    return { kind: "refused" };
  }
}

let shared: OutcomeCollector | null = null;
/** Takes down what `outcomeCollector` set up, for a test. */
let teardown: (() => void) | null = null;

/**
 * The one collector for this tab, made on first use in the browser.
 *
 * Made with the two things every page needs and no screen owns, since a card
 * is opened on a listing and its link followed out from one, far from any
 * strip of reels: what is waiting goes whenever the page is hidden or left,
 * with `keepalive`, and a withdrawal drops it the moment it happens rather
 * than at the next send.
 */
export function outcomeCollector(): OutcomeCollector {
  if (shared) return shared;
  const collector = createOutcomeCollector({
    send: sendOutcomes,
    now: () => Date.now() + clockOffsetMs(),
    uuid: uuidV4,
    consented: outcomesConsented,
    setTimer: (run, ms) => setTimeout(run, ms),
    clearTimer: (handle) =>
      clearTimeout(handle as ReturnType<typeof setTimeout>),
    random: Math.random,
  });
  shared = collector;

  if (typeof window !== "undefined") {
    const leave = () => collector.flush({ keepalive: true });
    const onVisibility = () => {
      if (document.visibilityState === "hidden") leave();
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", leave);
    const stopConsent = subscribeConsent(() => {
      if (!outcomesConsented()) collector.withdraw();
    });
    teardown = () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", leave);
      stopConsent();
    };
  }
  return collector;
}

/**
 * Something happened to a card. Records nothing without consent, and never
 * throws: a screen calls this and moves on.
 */
export function recordOutcome(outcome: Outcome): void {
  try {
    outcomeCollector().record(outcome);
  } catch {
    // Counting must never break a screen.
  }
}

/** Test-only: forget the shared collector. */
export function __resetOutcomeCollector(): void {
  shared?.withdraw();
  shared = null;
  teardown?.();
  teardown = null;
}
