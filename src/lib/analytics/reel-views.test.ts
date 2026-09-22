import { describe, it, expect, vi, afterEach } from "vitest";
import {
  MAX_EVENT_AGE_MS,
  MAX_PER_CALL,
  MAX_WATCHED_MS,
  MIN_VIEW_MS,
  SEND_AT,
  __resetReelViewCollector,
  createReelViewCollector,
  reelViewCollector,
  retryDelayMs,
  rfc3339,
  sendReelViews,
  slowDownMs,
  uuidV4,
  type ReelViewEvent,
  type SendOutcome,
} from "./reel-views";
import { setConsent } from "./consent";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8099/v1";

/**
 * A collector with every outside thing in the test's hands: the server's
 * clock, consent, the timers and the wire.
 */
function harness(
  answer: (
    events: ReelViewEvent[],
  ) => Promise<SendOutcome> | SendOutcome = () => ({
    kind: "accepted",
    dropped: [],
  }),
  options: { sendAt?: number } = {},
) {
  const state = {
    now: Date.parse("2026-09-21T10:00:00Z"),
    consent: true,
    ids: 0,
    timers: [] as { at: number; run: () => void; live: boolean }[],
  };
  const sends: {
    events: ReelViewEvent[];
    keepalive: boolean;
    signal: AbortSignal;
  }[] = [];

  const collector = createReelViewCollector({
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

  /** One reel on screen for `ms`, then gone. */
  const view = async (reelId: string, ms = 1_000, played = 0) => {
    const v = collector.beginView({ reelId, experienceId: `exp_${reelId}` });
    if (played) v.played(played);
    state.now += ms;
    v.end();
    await settle();
  };

  return { state, sends, collector, advance, view };
}

/** Lets the collector's promises run. */
const settle = () => new Promise((r) => setTimeout(r, 0));

afterEach(() => vi.unstubAllGlobals());

describe("consent, which is the owner's ruling", () => {
  it("records nothing and sends nothing without it", async () => {
    const h = harness();
    h.state.consent = false;
    // Not even held in memory: asked BEFORE anything could flush it away.
    await h.view("r0");
    await h.view("r1");
    expect(h.collector.inspect()).toEqual({ waiting: [], batches: [] });

    for (let i = 2; i < SEND_AT + 5; i++) await h.view(`r${i}`);
    h.collector.flush({ keepalive: true });
    await settle();

    expect(h.sends).toEqual([]);
    expect(h.collector.inspect()).toEqual({ waiting: [], batches: [] });
  });

  it("wires the shared collector to the consent the prompt writes", () => {
    /*
      The collector for the tab asks the SAME store the consent banner writes,
      so "no" there is no here, without the strip having to say so.
    */
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      __resetReelViewCollector();
      setConsent("denied");
      const denied = reelViewCollector().beginView({ reelId: "r1" });
      vi.setSystemTime(Date.now() + 1_000);
      denied.end();
      expect(reelViewCollector().inspect().waiting).toEqual([]);

      setConsent("granted");
      const granted = reelViewCollector().beginView({ reelId: "r2" });
      vi.setSystemTime(Date.now() + 1_000);
      granted.end();
      expect(
        reelViewCollector()
          .inspect()
          .waiting.map((e) => e.reelId),
      ).toEqual(["r2"]);
    } finally {
      setConsent("denied");
      __resetReelViewCollector();
      vi.useRealTimers();
    }
  });

  it("stops at once when it is withdrawn: the queue goes, and so does the view on screen", async () => {
    const h = harness();
    await h.view("a");
    const running = h.collector.beginView({ reelId: "b" });
    h.state.now += 5_000;

    h.state.consent = false;
    h.collector.withdraw();
    // Even granted again before it ends, a view from before is never sent.
    h.state.consent = true;
    running.end();
    h.collector.flush();
    await settle();

    expect(h.sends).toEqual([]);
    expect(h.collector.inspect()).toEqual({ waiting: [], batches: [] });
  });

  it("aborts a batch that is in the air when consent goes", async () => {
    let release!: (outcome: SendOutcome) => void;
    const h = harness(
      () => new Promise<SendOutcome>((resolve) => (release = resolve)),
    );
    await h.view("a");
    h.collector.flush();
    await settle();
    expect(h.sends).toHaveLength(1);

    h.state.consent = false;
    h.collector.withdraw();
    expect(h.sends[0].signal.aborted).toBe(true);

    // Whatever the wire says afterwards, nothing is kept or retried.
    release({ kind: "retry" });
    await h.advance(10 * 60_000);
    expect(h.sends).toHaveLength(1);
  });

  it("refuses to send what was queued if consent went without a word", async () => {
    // The store can change underneath the collector; it asks again at send.
    const h = harness();
    await h.view("a");
    h.state.consent = false;
    h.collector.flush();
    await settle();
    expect(h.sends).toEqual([]);
    expect(h.collector.inspect().waiting).toEqual([]);
  });
});

describe("one event per reel shown", () => {
  it("says which reel, on which listing, how long it played, and when it began", async () => {
    const h = harness();
    const start = h.state.now;
    const v = h.collector.beginView({
      reelId: "reel-1",
      experienceId: "exp-1",
    });
    v.played(1_200);
    v.played(800);
    v.completed();
    h.state.now += 4_000;
    v.end();
    v.end(); // idempotent
    h.collector.flush();
    await settle();

    expect(h.sends).toHaveLength(1);
    expect(h.sends[0].events).toEqual([
      {
        eventId: "00000000-0000-4000-8000-000000000001",
        reelId: "reel-1",
        experienceId: "exp-1",
        watchedMs: 2_000,
        completed: true,
        viewedAt: rfc3339(start),
      },
    ]);
    // RFC 3339 with an offset, and no milliseconds.
    expect(h.sends[0].events[0].viewedAt).toBe("2026-09-21T10:00:00Z");
  });

  it("mints a new eventId for every view, even of the same reel", async () => {
    const h = harness();
    await h.view("same");
    await h.view("same");
    h.collector.flush();
    await settle();
    const [first, second] = h.sends[0].events;
    expect(first.eventId).not.toBe(second.eventId);
  });

  it("caps watch time at the API's ten minutes, across loops", async () => {
    const h = harness();
    const v = h.collector.beginView({ reelId: "long" });
    for (let i = 0; i < 20; i++) v.played(60_000);
    h.state.now += 20 * 60_000;
    v.end();
    h.collector.flush();
    await settle();
    expect(h.sends[0].events[0].watchedMs).toBe(MAX_WATCHED_MS);
  });

  it("does not count a reel a thumb flicked straight past", async () => {
    const h = harness();
    await h.view("flicked", MIN_VIEW_MS - 1);
    await h.view("watched", MIN_VIEW_MS);
    h.collector.flush();
    await settle();
    expect(h.sends[0].events.map((e) => e.reelId)).toEqual(["watched"]);
  });

  it("leaves experienceId out when it does not know it", async () => {
    const h = harness();
    const v = h.collector.beginView({ reelId: "alone" });
    h.state.now += 1_000;
    v.end();
    h.collector.flush();
    await settle();
    expect(h.sends[0].events[0]).not.toHaveProperty("experienceId");
  });
});

describe("batching", () => {
  it("sends once twenty views are waiting, and not before", async () => {
    const h = harness();
    for (let i = 0; i < SEND_AT - 1; i++) await h.view(`r${i}`);
    expect(h.sends).toEqual([]);

    await h.view("the twentieth");
    expect(h.sends).toHaveLength(1);
    expect(h.sends[0].events).toHaveLength(SEND_AT);
    expect(h.sends[0].keepalive).toBe(false);
  });

  it("sends what is waiting when the reels are left, with keepalive", async () => {
    const h = harness();
    await h.view("a");
    await h.view("b");
    h.collector.flush({ keepalive: true });
    await settle();
    expect(h.sends).toHaveLength(1);
    expect(h.sends[0].events.map((e) => e.reelId)).toEqual(["a", "b"]);
    expect(h.sends[0].keepalive).toBe(true);
  });

  it("never puts more than fifty in one call, however many are waiting", async () => {
    // Nothing sends at twenty here, so the whole backlog meets the cap at once.
    const h = harness(undefined, { sendAt: Infinity });
    for (let i = 0; i < 120; i++) await h.view(`r${i}`);
    expect(h.sends).toEqual([]);

    h.collector.flush({ keepalive: true });
    await settle();

    expect(h.sends.map((s) => s.events.length)).toEqual([
      MAX_PER_CALL,
      MAX_PER_CALL,
      20,
    ]);
    // In the order they were watched, split and not shuffled.
    expect(h.sends.flatMap((s) => s.events.map((e) => e.reelId))).toEqual(
      Array.from({ length: 120 }, (_, i) => `r${i}`),
    );
  });

  it("does not send a batch twice while it is in the air", async () => {
    let release!: (outcome: SendOutcome) => void;
    const h = harness(
      () => new Promise<SendOutcome>((resolve) => (release = resolve)),
    );
    await h.view("a");
    h.collector.flush();
    h.collector.flush({ keepalive: true });
    await settle();
    expect(h.sends).toHaveLength(1);
    release({ kind: "accepted", dropped: [] });
    await settle();
  });
});

describe("what comes back", () => {
  it("retries the SAME batch, with the same eventIds, after a network failure or a 5xx", async () => {
    const outcomes: SendOutcome[] = [
      { kind: "retry" },
      { kind: "retry" },
      { kind: "accepted", dropped: [] },
    ];
    const h = harness(() => outcomes.shift()!);
    await h.view("a");
    await h.view("b");
    h.collector.flush();
    await settle();
    expect(h.sends).toHaveLength(1);

    // Backoff: nothing is sent again before it is due.
    await h.advance(retryDelayMs(1, () => 1) - 1);
    expect(h.sends).toHaveLength(1);
    await h.advance(1);
    expect(h.sends).toHaveLength(2);
    await h.advance(retryDelayMs(2, () => 1));
    expect(h.sends).toHaveLength(3);

    const ids = h.sends.map((s) => s.events.map((e) => e.eventId).join(","));
    expect(new Set(ids).size).toBe(1);
    // Settled by the 202: nothing left to send.
    expect(h.collector.inspect().batches).toEqual([]);
  });

  it("never sends again an event the 202 dropped", async () => {
    const h = harness(() => ({ kind: "accepted", dropped: [1] }));
    await h.view("kept");
    await h.view("dropped");
    h.collector.flush();
    await settle();

    await h.view("later");
    h.collector.flush();
    await settle();
    await h.advance(60 * 60_000);

    expect(h.sends).toHaveLength(2);
    expect(h.sends[1].events.map((e) => e.reelId)).toEqual(["later"]);
  });

  it("backs off every batch on a 429, then sends the same one again", async () => {
    const outcomes: SendOutcome[] = [
      { kind: "slow-down" },
      { kind: "accepted", dropped: [] },
      { kind: "accepted", dropped: [] },
    ];
    const h = harness(() => outcomes.shift()!);
    await h.view("a");
    h.collector.flush();
    await settle();
    const firstIds = h.sends[0].events.map((e) => e.eventId);

    // A new view queued during the pause waits for it too.
    await h.view("b");
    h.collector.flush();
    await settle();
    expect(h.sends).toHaveLength(1);

    await h.advance(slowDownMs(1));
    expect(h.sends.length).toBeGreaterThanOrEqual(2);
    expect(h.sends[1].events.map((e) => e.eventId)).toEqual(firstIds);
  });

  it("drops a batch the API refuses outright, rather than looping on it", async () => {
    const h = harness(() => ({ kind: "refused" }));
    await h.view("a");
    h.collector.flush();
    await settle();
    await h.advance(60 * 60_000);
    expect(h.sends).toHaveLength(1);
    expect(h.collector.inspect().batches).toEqual([]);
  });

  it("drops what is older than a day before sending it", async () => {
    const outcomes: SendOutcome[] = [
      { kind: "retry" },
      { kind: "accepted", dropped: [] },
    ];
    const h = harness(
      () => outcomes.shift() ?? { kind: "accepted", dropped: [] },
    );
    await h.view("old");
    h.collector.flush();
    await settle();
    expect(h.sends).toHaveLength(1);

    // Held back by a failure for longer than the API keeps a view acceptable.
    h.state.now += MAX_EVENT_AGE_MS + 60_000;
    await h.view("new");
    h.collector.flush({ keepalive: true });
    await settle();

    const everySent = h.sends
      .slice(1)
      .flatMap((s) => s.events.map((e) => e.reelId));
    expect(everySent).toEqual(["new"]);
  });
});

describe("the helpers", () => {
  it("doubles the retry wait up to five minutes, with jitter below it", () => {
    expect(retryDelayMs(1, () => 1)).toBe(2_000);
    expect(retryDelayMs(2, () => 1)).toBe(4_000);
    expect(retryDelayMs(20, () => 1)).toBe(5 * 60_000);
    expect(retryDelayMs(1, () => 0)).toBe(1_000);
  });

  it("waits a minute after a 429, doubling to ten", () => {
    expect(slowDownMs(1)).toBe(60_000);
    expect(slowDownMs(2)).toBe(120_000);
    expect(slowDownMs(10)).toBe(10 * 60_000);
  });

  it("makes a version 4 UUID even where randomUUID is missing", () => {
    const uuid =
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
    expect(uuidV4()).toMatch(uuid);
    vi.stubGlobal("crypto", {
      getRandomValues: (bytes: Uint8Array) => bytes.fill(0xab),
    });
    expect(uuidV4()).toMatch(uuid);
  });
});

/**
 * The wire, asserted on the request itself rather than on a mock of the
 * client: where it goes, what it carries, and what it must NOT carry.
 */
describe("sending", () => {
  const event: ReelViewEvent = {
    eventId: "00000000-0000-4000-8000-000000000001",
    reelId: "med_dive",
    watchedMs: 1_000,
    completed: false,
    viewedAt: "2026-09-21T10:00:00Z",
  };

  function wire(response: () => Response | Promise<Response>) {
    const requests: Request[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: Request) => {
        requests.push(input);
        return response();
      }),
    );
    return requests;
  }

  it("goes straight to the API, anonymously, and outlives the page when asked", async () => {
    const requests = wire(
      () =>
        new Response(
          JSON.stringify({ accepted: 1, dropped: 0, droppedEvents: [] }),
          { status: 202, headers: { "Content-Type": "application/json" } },
        ),
    );

    const outcome = await sendReelViews([event], {
      keepalive: true,
      signal: new AbortController().signal,
    });

    expect(outcome).toEqual({ kind: "accepted", dropped: [] });
    expect(requests).toHaveLength(1);
    const [request] = requests;
    expect(request.method).toBe("POST");
    // The API itself, never this app's proxy, which would attach the session.
    expect(request.url).toBe(`${BASE}/reel-views`);
    expect(request.url).not.toContain("/api/v1");
    // No credential of any kind: the views are anonymous by construction.
    expect(request.headers.get("authorization")).toBeNull();
    expect(request.credentials).not.toBe("include");
    expect(request.keepalive).toBe(true);
    expect(await request.json()).toEqual({ events: [event] });
  });

  it("reads the 202's dropped events by position", async () => {
    wire(
      () =>
        new Response(
          JSON.stringify({
            accepted: 1,
            dropped: 1,
            droppedEvents: [{ index: 0, reason: "unknown_reel" }],
          }),
          { status: 202, headers: { "Content-Type": "application/json" } },
        ),
    );
    expect(
      await sendReelViews([event, event], {
        keepalive: false,
        signal: new AbortController().signal,
      }),
    ).toEqual({ kind: "accepted", dropped: [0] });
  });

  it("asks for a retry on a 5xx or a dropped connection, a pause on 429, and nothing on 400", async () => {
    const answer = (status: number, code: string) =>
      new Response(JSON.stringify({ error: { code, message: "x" } }), {
        status,
        headers: { "Content-Type": "application/json" },
      });
    const send = () =>
      sendReelViews([event], {
        keepalive: false,
        signal: new AbortController().signal,
      });

    wire(() => answer(503, "unavailable"));
    expect(await send()).toEqual({ kind: "retry" });

    wire(() => answer(429, "rate_limited"));
    expect(await send()).toEqual({ kind: "slow-down" });

    wire(() => answer(400, "invalid_input"));
    expect(await send()).toEqual({ kind: "refused" });

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("Failed to fetch");
      }),
    );
    expect(await send()).toEqual({ kind: "retry" });
  });
});
