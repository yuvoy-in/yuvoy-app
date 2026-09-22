import type { components } from "@/lib/api/schema.gen";
import { api } from "@/lib/api/client";
import { NetworkError, YuvoyError } from "@/lib/api/errors";
import { clockOffsetMs } from "@/lib/booking/clock";
import { consentSnapshot } from "./consent";

/**
 * Reel views and watch time, for a ranking the API will build later
 * (yuvoy-app#96, yuvoy-api#214).
 *
 * ## The owner's ruling, which is the whole shape of this file
 *
 *   - **Only with analytics consent.** Nothing is recorded, queued or sent
 *     unless the traveller said yes on the consent prompt, and withdrawing it
 *     stops everything at once: what is queued is dropped, what is in flight is
 *     aborted, and a view that was running is never sent.
 *   - **Anonymously.** The API records a view against the traveller when it
 *     carries a session, and this app never sends one: the call goes straight
 *     to the API with the plain client, never through `/api/v1` (which would
 *     attach the session cookie) and never with an `Authorization` header. The
 *     API stores no device id, cookie or IP address with a view either, and
 *     there is no field for one.
 *   - **Never persisted.** The queue lives in memory. A view that could not be
 *     sent before the page went away is lost, which is the right side to fail
 *     on for data nobody asked to have kept.
 *
 * ## One event per reel shown
 *
 * A view begins when a reel is the one on screen and ends when it stops being
 * (another reel, the page hidden, the strip gone). It carries an `eventId`
 * minted once for that view, the reel's `media.id`, the listing it was shown
 * with, how long the clip actually PLAYED (across loops, capped at the API's
 * ten minutes), whether it played to its end at least once, and when the view
 * started, on the server's clock.
 *
 * A view shorter than `MIN_VIEW_MS` is not one: a reel a thumb flicks past,
 * or the first card a grid opened on a later one momentarily reports, was
 * never watched, and counting it would feed a ranking noise.
 *
 * ## Batching and retries, as the API asks
 *
 * Sent when `SEND_AT` views are waiting, and whenever the reels are left: the
 * strip unmounting, the page hiding, the page going away (then with
 * `keepalive`, so the request outlives the page). One to fifty per call. A
 * network failure or a 5xx retries the SAME batch with the same `eventId`s,
 * with backoff ("repeats are stored once"). A 202 settles every event in the
 * batch: stored, or named in `droppedEvents` and not to be sent again. A 429
 * pauses all sending. Anything older than 24 hours is dropped before it is
 * sent, because the API would drop it.
 */

export type ReelViewEvent = components["schemas"]["ReelViewEvent"];

/** Send once this many views are waiting. The API suggests "every 20 or so". */
export const SEND_AT = 20;
/** The API's own ceiling for one call. */
export const MAX_PER_CALL = 50;
/** `watchedMs` is refused above ten minutes, "ten loops of the longest reel". */
export const MAX_WATCHED_MS = 600_000;
/** `viewedAt` is refused more than 24 hours behind the server's clock. */
export const MAX_EVENT_AGE_MS = 24 * 60 * 60_000;
/** Shorter than this on screen, and it was not a view. */
export const MIN_VIEW_MS = 300;

/** What one call to `POST /reel-views` came to. */
export type SendOutcome =
  /** 202: every event is settled, stored or dropped by index. */
  | { kind: "accepted"; dropped: number[] }
  /** Network failure or 5xx: send the same batch again, later. */
  | { kind: "retry" }
  /** 429: slow down, then send the same batch again. */
  | { kind: "slow-down" }
  /** 400 or anything unexpected: the same batch would fail the same way. */
  | { kind: "refused" };

export interface ReelViewDeps {
  send(
    events: ReelViewEvent[],
    options: { keepalive: boolean; signal: AbortSignal },
  ): Promise<SendOutcome>;
  /** The SERVER's now, in epoch milliseconds. */
  now(): number;
  uuid(): string;
  /** Whether analytics consent is granted, right now. */
  consented(): boolean;
  setTimer(run: () => void, ms: number): unknown;
  clearTimer(handle: unknown): void;
  random(): number;
  /** How many waiting views trigger a send. `SEND_AT` unless a test says. */
  sendAt?: number;
}

/** The view of one reel, while it is on screen. */
export interface ReelView {
  /** The clip played this many more milliseconds. */
  played(ms: number): void;
  /** The clip reached its end. */
  completed(): void;
  /** It left the screen. Idempotent. */
  end(): void;
}

/** A view that records nothing, for when there is no consent. */
const INERT_VIEW: ReelView = {
  played() {},
  completed() {},
  end() {},
};

interface Batch {
  events: ReelViewEvent[];
  attempts: number;
  inFlight: AbortController | null;
  timer: unknown;
}

/** `2026-09-21T10:00:00Z`: RFC 3339 with an offset, and no milliseconds. */
export function rfc3339(ms: number): string {
  return new Date(ms).toISOString().replace(/\.\d{3}Z$/, "Z");
}

/** Wait before retrying a batch that failed `attempts` times: 2s doubling to 5 minutes, jittered. */
export function retryDelayMs(attempts: number, random: () => number): number {
  const base = Math.min(2_000 * 2 ** Math.max(0, attempts - 1), 5 * 60_000);
  return Math.round(base * (0.5 + random() * 0.5));
}

/** Wait after the `n`th 429 in a row: a minute doubling to ten. */
export function slowDownMs(n: number): number {
  return Math.min(60_000 * 2 ** Math.max(0, n - 1), 10 * 60_000);
}

export function createReelViewCollector(deps: ReelViewDeps) {
  /** Ended views, waiting to be batched. */
  let waiting: ReelViewEvent[] = [];
  /** Batches cut from `waiting`, each sent until it is settled. */
  const outbox: Batch[] = [];
  /** No sending before this instant, after a 429. */
  let pausedUntil = 0;
  let slowDowns = 0;
  /**
   * Bumped by `withdraw`. A view begun before a withdrawal belongs to a
   * generation that no longer exists, so it can never be queued, even if
   * consent is granted again before it ends.
   */
  let generation = 0;

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

    // "Drop anything older than a day rather than sending it."
    batch.events = batch.events.filter(
      (event) => now - Date.parse(event.viewedAt) <= MAX_EVENT_AGE_MS,
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
          Every event is settled: stored, or named in `droppedEvents`, which
          "should not be retried". So the whole batch goes, and a dropped
          event can never come back in a later one.
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

  /** Consent is gone: drop everything, abort what is in flight, record nothing. */
  function withdraw(): void {
    generation += 1;
    waiting = [];
    for (const batch of outbox.splice(0)) {
      batch.inFlight?.abort();
      if (batch.timer !== null) deps.clearTimer(batch.timer);
      batch.timer = null;
    }
    pausedUntil = 0;
    slowDowns = 0;
  }

  /**
   * A reel came on screen. Answers a view that records nothing when there is
   * no consent, so a caller never has to ask.
   */
  function beginView(reel: {
    reelId: string;
    experienceId?: string;
  }): ReelView {
    if (!deps.consented() || !reel.reelId) return INERT_VIEW;

    const startedAt = deps.now();
    const eventId = deps.uuid();
    const born = generation;
    let watchedMs = 0;
    let completed = false;
    let ended = false;

    return {
      played(ms) {
        if (ended || !Number.isFinite(ms) || ms <= 0) return;
        watchedMs = Math.min(MAX_WATCHED_MS, watchedMs + ms);
      },
      completed() {
        if (!ended) completed = true;
      },
      end() {
        if (ended) return;
        ended = true;
        if (born !== generation || !deps.consented()) return;
        if (deps.now() - startedAt < MIN_VIEW_MS) return;

        waiting.push({
          eventId,
          reelId: reel.reelId,
          ...(reel.experienceId ? { experienceId: reel.experienceId } : {}),
          watchedMs: Math.round(watchedMs),
          completed,
          viewedAt: rfc3339(startedAt),
        });
        if (waiting.length >= (deps.sendAt ?? SEND_AT)) flush();
      },
    };
  }

  return {
    beginView,
    flush,
    withdraw,
    /** For tests: what is queued and what is being sent. */
    inspect: () => ({
      waiting: [...waiting],
      batches: outbox.map((batch) => [...batch.events]),
    }),
  };
}

export type ReelViewCollector = ReturnType<typeof createReelViewCollector>;

/* ------------------------------------------------------------ the wire -- */

/**
 * One call to `POST /reel-views`, straight to the API.
 *
 * The plain client: its base is the API itself, not this app's `/api/v1`
 * proxy, and it sets no `Authorization` header, so the call carries no
 * session and the views are anonymous by construction. `keepalive` lets the
 * request outlive a page that is being hidden or closed.
 */
export async function sendReelViews(
  events: ReelViewEvent[],
  options: { keepalive: boolean; signal: AbortSignal },
): Promise<SendOutcome> {
  try {
    const { data } = await api.POST("/reel-views", {
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
    return { kind: "refused" };
  }
}

/** A version 4 UUID, from `crypto.randomUUID` where it exists. */
export function uuidV4(): string {
  const c = globalThis.crypto;
  if (typeof c?.randomUUID === "function") return c.randomUUID();
  /*
    `randomUUID` exists only in a secure context. A phone reaching a dev
    server over plain http on the LAN has `getRandomValues` and not it, and
    an `eventId` that is not a UUID is dropped by the API one event at a time.
  */
  const bytes = new Uint8Array(16);
  if (typeof c?.getRandomValues === "function") c.getRandomValues(bytes);
  else for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, "0"));
  return `${hex.slice(0, 4).join("")}-${hex.slice(4, 6).join("")}-${hex
    .slice(6, 8)
    .join("")}-${hex.slice(8, 10).join("")}-${hex.slice(10, 16).join("")}`;
}

let shared: ReelViewCollector | null = null;

/** The one collector for this tab, made on first use in the browser. */
export function reelViewCollector(): ReelViewCollector {
  shared ??= createReelViewCollector({
    send: sendReelViews,
    now: () => Date.now() + clockOffsetMs(),
    uuid: uuidV4,
    consented: () => consentSnapshot() === "granted",
    setTimer: (run, ms) => setTimeout(run, ms),
    clearTimer: (handle) =>
      clearTimeout(handle as ReturnType<typeof setTimeout>),
    random: Math.random,
  });
  return shared;
}

/** Test-only: forget the shared collector. */
export function __resetReelViewCollector(): void {
  shared?.withdraw();
  shared = null;
}
