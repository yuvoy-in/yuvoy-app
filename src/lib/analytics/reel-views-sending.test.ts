import { describe, it, expect, vi, afterEach } from "vitest";
import {
  retryDelayMs,
  sendReelViews,
  slowDownMs,
  uuidV4,
  type ReelViewEvent,
} from "./reel-views";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8099/v1";

afterEach(() => vi.unstubAllGlobals());

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
      // As the network sees it: `fetch` reads its two arguments as one Request.
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        requests.push(new Request(input, init));
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
