import { describe, it, expect, vi, afterEach } from "vitest";
import {
  MAX_POSITION,
  __resetOutcomeCollector,
  createOutcomeCollector,
  outcomeCollector,
  recordOutcome,
  sendOutcomes,
  type Outcome,
  type OutcomeEvent,
} from "./outcomes";
import {
  MAX_EVENT_AGE_MS,
  MAX_PER_CALL,
  SEND_AT,
  type SendOutcome,
} from "./reel-views";
import { __forgetConsentRead, setConsent } from "./consent";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8099/v1";

/**
 * What people do with a card (yuvoy-app#181, R0-T5): the rules reel views
 * keep, applied to `POST /outcomes`. A collector with every outside thing in
 * the test's hands: the server's clock, consent, the timers and the wire.
 */
function harness(
  answer: (
    events: OutcomeEvent[],
  ) => Promise<SendOutcome> | SendOutcome = () => ({
    kind: "accepted",
    dropped: [],
  }),
  options: { sendAt?: number } = {},
) {
  const state = {
    now: Date.parse("2026-10-21T10:00:00Z"),
    consent: true,
    ids: 0,
    timers: [] as { at: number; run: () => void; live: boolean }[],
  };
  const sends: {
    events: OutcomeEvent[];
    keepalive: boolean;
    signal: AbortSignal;
  }[] = [];

  const collector = createOutcomeCollector({
    send: async (events, options) => {
      sends.push({ events: [...events], ...options });
      return answer(events);
    },
    now: () => state.now,
    uuid: () =>
      `00000000-0000-4000-8000-${String(++state.ids).padStart(12, "0")}`,
    consented: () => state.consent,
    setTimer: (run, ms) => {
      const timer = { at: state.now + ms, run, live: true };
      state.timers.push(timer);
      return timer;
    },
    clearTimer: (handle) => {
      (handle as { live: boolean }).live = false;
    },
    random: () => 1,
    sendAt: options.sendAt,
  });

  /** Moves the server's clock on, running any timer that falls due. */
  const advance = async (ms: number) => {
    state.now += ms;
    for (const timer of [...state.timers]) {
      if (timer.live && timer.at <= state.now) {
        timer.live = false;
        timer.run();
      }
    }
    await settle();
  };

  /** `n` cards opened on the feed, one after another. */
  const open = (n: number, from = 0) => {
    for (let i = from; i < from + n; i++) {
      collector.record({
        kind: "opened",
        subjectId: `exp_${i}`,
        surface: "feed",
        position: i,
      });
    }
  };

  return { state, sends, collector, advance, open };
}

/** Lets the collector's promises run. */
const settle = () => new Promise((r) => setTimeout(r, 0));

afterEach(() => {
  vi.unstubAllGlobals();
  __resetOutcomeCollector();
});

describe("outcomes", () => {
  it("records nothing without consent", async () => {
    const h = harness();
    h.state.consent = false;
    h.open(SEND_AT + 5);
    h.collector.flush({ keepalive: true });
    await settle();

    // Not even held in memory.
    expect(h.collector.inspect()).toEqual({ waiting: [], batches: [] });
    expect(h.sends).toEqual([]);
  });

  it("drops what is queued when consent is withdrawn", async () => {
    let release!: (outcome: SendOutcome) => void;
    const h = harness(
      () => new Promise<SendOutcome>((resolve) => (release = resolve)),
    );
    h.open(3);
    h.collector.flush();
    await settle();
    // One batch in the air, and more waiting behind it.
    h.open(2, 3);
    expect(h.sends).toHaveLength(1);

    h.state.consent = false;
    h.collector.withdraw();
    expect(h.sends[0].signal.aborted).toBe(true);
    expect(h.collector.inspect()).toEqual({ waiting: [], batches: [] });

    // The answer that lands after the withdrawal changes nothing.
    release({ kind: "retry" });
    await h.advance(10 * 60_000);
    expect(h.sends).toHaveLength(1);
  });

  it("sends at 20 and never more than 50", async () => {
    const h = harness();
    h.open(SEND_AT - 1);
    expect(h.sends).toHaveLength(0);
    h.open(1, SEND_AT - 1);
    await settle();
    expect(h.sends).toHaveLength(1);
    expect(h.sends[0].events).toHaveLength(SEND_AT);

    // However many are waiting, no call carries more than the API's ceiling.
    const big = harness(undefined, { sendAt: 1_000 });
    big.open(MAX_PER_CALL * 2 + 7);
    big.collector.flush();
    await settle();
    expect(big.sends.map((s) => s.events.length)).toEqual([
      MAX_PER_CALL,
      MAX_PER_CALL,
      7,
    ]);
  });

  it("sends the same batch again after a 5xx", async () => {
    const answers: SendOutcome[] = [
      { kind: "retry" },
      { kind: "accepted", dropped: [] },
    ];
    const h = harness(() => answers.shift()!);
    h.open(2);
    h.collector.flush();
    await settle();
    expect(h.sends).toHaveLength(1);

    // Backed off, then the SAME events, ids and all: "stored once".
    await h.advance(60_000);
    expect(h.sends).toHaveLength(2);
    expect(h.sends[1].events).toEqual(h.sends[0].events);
    expect(h.collector.inspect().batches).toEqual([]);
  });

  it("pauses after a 429", async () => {
    const answers: SendOutcome[] = [
      { kind: "slow-down" },
      { kind: "accepted", dropped: [] },
      { kind: "accepted", dropped: [] },
    ];
    const h = harness(() => answers.shift()!);
    h.open(1);
    h.collector.flush();
    await settle();

    // A second batch inside the pause waits with the first.
    h.open(1, 1);
    h.collector.flush();
    await settle();
    expect(h.sends).toHaveLength(1);

    await h.advance(59_000);
    expect(h.sends).toHaveLength(1);
    await h.advance(1_000);
    expect(h.sends).toHaveLength(3);
    expect(h.sends[1].events).toEqual(h.sends[0].events);
  });

  it("sends shown once per card and surface", async () => {
    const h = harness();
    const shown = (subjectId: string, surface: Outcome["surface"]) =>
      h.collector.record({ kind: "shown", subjectId, surface, position: 0 });

    shown("exp_a", "feed");
    shown("exp_a", "feed"); // scrolled back to
    shown("exp_a", "search"); // the same card on another screen
    shown("exp_b", "feed");
    // An open is not a showing, and is counted every time.
    h.collector.record({ kind: "opened", subjectId: "exp_a", surface: "feed" });
    h.collector.record({ kind: "opened", subjectId: "exp_a", surface: "feed" });

    expect(
      h.collector
        .inspect()
        .waiting.map((e) => `${e.kind} ${e.surface} ${e.subjectId}`),
    ).toEqual([
      "shown feed exp_a",
      "shown search exp_a",
      "shown feed exp_b",
      "opened feed exp_a",
      "opened feed exp_a",
    ]);

    // A withdrawal forgets them with the queue, so a new yes counts afresh.
    h.collector.withdraw();
    shown("exp_a", "feed");
    expect(h.collector.inspect().waiting).toHaveLength(1);
  });

  it("never sends an Authorization header", async () => {
    const requests: Request[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        requests.push(new Request(input, init));
        return new Response(
          JSON.stringify({ accepted: 1, dropped: 0, droppedEvents: [] }),
          { status: 202, headers: { "Content-Type": "application/json" } },
        );
      }),
    );
    const event: OutcomeEvent = {
      eventId: "00000000-0000-4000-8000-000000000001",
      kind: "opened",
      subjectType: "experience",
      subjectId: "exp_try_dive",
      surface: "listing",
      occurredAt: "2026-10-21T10:00:00Z",
    };

    expect(
      await sendOutcomes([event], {
        keepalive: true,
        signal: new AbortController().signal,
      }),
    ).toEqual({ kind: "accepted", dropped: [] });

    const [request] = requests;
    // The API itself, never this app's proxy, which would attach the session.
    expect(request.url).toBe(`${BASE}/outcomes`);
    expect(request.url).not.toContain("/api/v1");
    expect(request.headers.get("authorization")).toBeNull();
    expect(request.credentials).not.toBe("include");
    expect(request.keepalive).toBe(true);
    // Nothing but the event: no device, account, text or place.
    expect(await request.json()).toEqual({ events: [event] });
  });
});

describe("what comes back", () => {
  it("drops a batch the API refuses, a 400 or a 404, rather than looping on it", async () => {
    const h = harness(() => ({ kind: "refused" }));
    h.open(2);
    h.collector.flush();
    await settle();
    await h.advance(60 * 60_000);
    expect(h.sends).toHaveLength(1);
    expect(h.collector.inspect().batches).toEqual([]);

    const answer = (status: number, code: string) =>
      new Response(JSON.stringify({ error: { code, message: "x" } }), {
        status,
        headers: { "Content-Type": "application/json" },
      });
    const send = () =>
      sendOutcomes([], {
        keepalive: false,
        signal: new AbortController().signal,
      });
    for (const [status, code, kind] of [
      [400, "invalid_input", "refused"],
      [404, "not_found", "refused"],
      [413, "payload_too_large", "refused"],
      [429, "rate_limited", "slow-down"],
      [503, "unavailable", "retry"],
    ] as const) {
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => answer(status, code)),
      );
      expect(await send(), String(status)).toEqual({ kind });
    }
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("Failed to fetch");
      }),
    );
    expect(await send()).toEqual({ kind: "retry" });
  });

  it("drops what is older than a day before sending it", async () => {
    const h = harness(() => ({ kind: "retry" }));
    h.open(1);
    h.collector.flush();
    await settle();
    expect(h.sends).toHaveLength(1);

    // Still failing a day later: the API would drop it, so it is not sent.
    h.state.now += MAX_EVENT_AGE_MS + 1;
    h.collector.flush({ keepalive: true });
    await settle();
    expect(h.sends).toHaveLength(1);
    expect(h.collector.inspect().batches).toEqual([]);
  });
});

describe("what is recorded", () => {
  it("says what happened, to which card, where, and when, on the server's clock", () => {
    const h = harness();
    h.collector.record({
      kind: "link_out",
      subjectId: "exp_try_dive",
      surface: "listing",
    });
    expect(h.collector.inspect().waiting).toEqual([
      {
        eventId: "00000000-0000-4000-8000-000000000001",
        kind: "link_out",
        subjectType: "experience",
        subjectId: "exp_try_dive",
        surface: "listing",
        occurredAt: "2026-10-21T10:00:00Z",
      },
    ]);
  });

  it("leaves out a position the API would refuse, rather than lose the event", () => {
    const h = harness();
    for (const position of [-1, 1.5, MAX_POSITION + 1, Number.NaN]) {
      h.collector.record({
        kind: "shown",
        subjectId: `exp_${position}`,
        surface: "feed",
        position,
      });
    }
    h.collector.record({
      kind: "shown",
      subjectId: "exp_last",
      surface: "feed",
      position: MAX_POSITION,
    });
    expect(h.collector.inspect().waiting.map((e) => e.position)).toEqual([
      undefined,
      undefined,
      undefined,
      undefined,
      MAX_POSITION,
    ]);
  });

  it("never throws, and records nothing it cannot name", () => {
    const h = harness();
    const odd = [
      { kind: "went", subjectId: "exp_a", surface: "feed" },
      { kind: "opened", subjectId: "exp_a", surface: "record" },
      { kind: "opened", subjectId: "  ", surface: "feed" },
      { kind: "opened", subjectId: undefined, surface: "feed" },
      null,
    ] as unknown as Outcome[];
    for (const outcome of odd) {
      expect(() => h.collector.record(outcome)).not.toThrow();
    }
    expect(h.collector.inspect().waiting).toEqual([]);
    expect(() => recordOutcome(null as unknown as Outcome)).not.toThrow();
  });
});

describe("the tab's collector", () => {
  it("counts only with a yes to the words that name it", () => {
    // A yes given to the older words counts reel views, never this.
    sessionStorage.setItem("yuvoy.consent.analytics", "granted");
    __forgetConsentRead();
    recordOutcome({ kind: "opened", subjectId: "exp_a", surface: "listing" });
    expect(outcomeCollector().inspect().waiting).toEqual([]);

    setConsent("granted");
    recordOutcome({ kind: "opened", subjectId: "exp_a", surface: "listing" });
    expect(outcomeCollector().inspect().waiting).toHaveLength(1);

    // And a no drops it at once, not at the next send.
    setConsent("denied");
    expect(outcomeCollector().inspect().waiting).toEqual([]);
  });

  it("sends what is waiting as the page is hidden, with keepalive", async () => {
    const bodies: unknown[] = [];
    const keepalive: boolean[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const request = new Request(input, init);
        keepalive.push(request.keepalive);
        bodies.push(await request.json());
        return new Response(
          JSON.stringify({ accepted: 1, dropped: 0, droppedEvents: [] }),
          { status: 202, headers: { "Content-Type": "application/json" } },
        );
      }),
    );
    setConsent("granted");
    recordOutcome({ kind: "opened", subjectId: "exp_a", surface: "listing" });

    const visibility = (state: "visible" | "hidden") => {
      Object.defineProperty(document, "visibilityState", {
        configurable: true,
        get: () => state,
      });
      document.dispatchEvent(new Event("visibilitychange"));
    };
    visibility("hidden");
    visibility("visible");
    await vi.waitFor(() => expect(bodies).toHaveLength(1));

    expect(keepalive).toEqual([true]);
    expect(bodies[0]).toMatchObject({
      events: [{ kind: "opened", subjectId: "exp_a", surface: "listing" }],
    });
    setConsent("denied");
  });
});
