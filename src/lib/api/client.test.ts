import { describe, it, expect, vi, afterEach } from "vitest";
import { http, HttpResponse, delay } from "msw";
import { createApiClient, ATTEMPT_HEADER } from "./client";
import { NetworkError } from "./errors";
import { server } from "../../../mocks/server";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8099/v1";

/**
 * The client's own retries for reads, when the caller cancels.
 *
 * A cancelled read used to be retried, backoff and all, and to end as a
 * `NetworkError` (stability audit, 6 Oct 2026): a superseded search or an
 * unmounted screen left timers running, and a caller that checks for an abort
 * was told the network had failed.
 */

const failure = (error: unknown) => error as Error;

describe("a read the caller cancels", () => {
  it("ends as the abort, not as a network fault after its retries", async () => {
    server.use(
      http.get(`${BASE}/reels`, async () => {
        await delay("infinite");
      }),
    );
    const controller = new AbortController();
    const read = createApiClient().GET("/reels", { signal: controller.signal });
    controller.abort();

    const error = await read.then(
      () => null,
      (e: unknown) => e,
    );
    expect(error).not.toBeInstanceOf(NetworkError);
    expect(failure(error).name).toBe("AbortError");
  });

  it("stops waiting out a retry the moment it is cancelled", async () => {
    let asked = 0;
    server.use(
      http.get(`${BASE}/reels`, () => {
        asked += 1;
        return HttpResponse.json(
          { error: { code: "service_unavailable", message: "Later." } },
          { status: 503 },
        );
      }),
    );
    const controller = new AbortController();
    const read = createApiClient().GET("/reels", { signal: controller.signal });
    await vi.waitFor(() => expect(asked).toBe(1));
    controller.abort();

    const error = await read.then(
      () => null,
      (e: unknown) => e,
    );
    expect(error).not.toBeInstanceOf(NetworkError);
    expect(failure(error).name).toBe("AbortError");
    expect(asked).toBe(1);
  });

  it("still retries a read nobody cancelled", async () => {
    let asked = 0;
    server.use(
      http.get(`${BASE}/reels`, () => {
        asked += 1;
        if (asked === 1) {
          return HttpResponse.json(
            { error: { code: "service_unavailable", message: "Later." } },
            { status: 503 },
          );
        }
        return HttpResponse.json({
          items: [],
          nextCursor: null,
          complete: true,
        });
      }),
    );
    const { response } = await createApiClient().GET("/reels");
    expect(response.status).toBe(200);
    expect(asked).toBe(2);
  });
});

/**
 * What a request declares about its body (production readiness, 6 Oct 2026).
 *
 * A `Content-Type` on a read with no body makes every GET to the API a
 * non-simple cross-origin request, so the browser sent an OPTIONS preflight
 * first and waited for it. The API sends no `Access-Control-Max-Age`, so the
 * answer was forgotten after five seconds and paid again on the next read:
 * one extra round trip in front of every search, every page of the feed and
 * every listing read, on the connections that can least afford one.
 */
describe("the headers a request carries", () => {
  it("sends a read with no Content-Type, so the browser does not preflight it", async () => {
    let seen: string | null | undefined;
    server.use(
      http.get(`${BASE}/reels`, ({ request }) => {
        seen = request.headers.get("content-type");
        return HttpResponse.json({
          items: [],
          nextCursor: null,
          complete: true,
        });
      }),
    );
    await createApiClient().GET("/reels");
    expect(seen).toBeNull();
  });

  it("still declares JSON on a write that carries a body", async () => {
    let seen: string | null | undefined;
    server.use(
      http.post(`${BASE}/reel-views`, ({ request }) => {
        seen = request.headers.get("content-type");
        return HttpResponse.json({ accepted: 1, droppedEvents: [] });
      }),
    );
    await createApiClient().POST("/reel-views", {
      body: {
        events: [
          {
            eventId: "8d3f1c2a-1b2c-4d5e-8f90-123456789abc",
            reelId: "9260750c-7296-47bd-b020-96c12bb634c8",
            watchedMs: 1200,
            completed: false,
            viewedAt: "2026-10-06T10:00:00Z",
          },
        ],
      },
    });
    expect(seen).toBe("application/json");
  });
});

/**
 * A request on a connection that has gone quiet (production readiness,
 * 6 Oct 2026). Nothing had a deadline: a read waited for the phone to notice
 * the connection was gone, and a write spun forever.
 */
describe("a request that goes quiet", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("gives up on a silent read and asks again on a fresh connection", async () => {
    vi.useFakeTimers();
    let asked = 0;
    server.use(
      http.get(`${BASE}/reels`, async () => {
        asked += 1;
        if (asked === 1) await delay("infinite");
        return HttpResponse.json({
          items: [],
          nextCursor: null,
          complete: true,
        });
      }),
    );
    const read = createApiClient().GET("/reels");

    await vi.advanceTimersByTimeAsync(11_999);
    expect(asked).toBe(1);
    await vi.advanceTimersByTimeAsync(1 + 4_000);

    const { response } = await read;
    expect(response.status).toBe(200);
    expect(asked).toBe(2);
  });

  it("ends a silent write as a NetworkError, and never sends it twice", async () => {
    vi.useFakeTimers();
    let asked = 0;
    server.use(
      http.post(`${BASE}/reel-views`, async () => {
        asked += 1;
        await delay("infinite");
        return HttpResponse.json({ accepted: 0, droppedEvents: [] });
      }),
    );
    const write = createApiClient()
      .POST("/reel-views", { body: { events: [] } })
      .then(
        () => null,
        (e: unknown) => e,
      );

    await vi.advanceTimersByTimeAsync(30_000);
    expect(await write).toBeInstanceOf(NetworkError);
    expect(asked).toBe(1);
  });
});

/**
 * Next's per-render memo, reduced to what matters here: a GET identical to
 * one already made in this render is answered from the first one's promise,
 * failure and all. The key is the one `next/dist/server/lib/dedupe-fetch.js`
 * builds, method and headers, per URL.
 */
function memoisedLikeNext(real: typeof fetch): typeof fetch {
  const seen = new Map<string, Promise<Response>>();
  return (input, init) => {
    const request = new Request(input, init);
    const key = JSON.stringify([
      request.url,
      request.method,
      [...request.headers.entries()],
    ]);
    let answer = seen.get(key);
    if (!answer) {
      answer = real(request);
      seen.set(key, answer);
    }
    return answer.then((response) => response.clone());
  };
}

describe("a retried read on the server", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("reaches the API, rather than the memo of the attempt that failed", async () => {
    vi.stubGlobal("window", undefined);
    vi.stubGlobal("fetch", memoisedLikeNext(globalThis.fetch));
    const attempts: (string | null)[] = [];
    server.use(
      http.get(`${BASE}/reels`, ({ request }) => {
        attempts.push(request.headers.get(ATTEMPT_HEADER));
        if (attempts.length === 1) return HttpResponse.error();
        return HttpResponse.json({
          items: [],
          nextCursor: null,
          complete: true,
        });
      }),
    );

    const { response } = await createApiClient().GET("/reels");
    expect(response.status).toBe(200);
    expect(attempts).toEqual([null, "2"]);
  });

  it("is never marked in a browser, where the header would need a preflight", async () => {
    const attempts: (string | null)[] = [];
    server.use(
      http.get(`${BASE}/reels`, ({ request }) => {
        attempts.push(request.headers.get(ATTEMPT_HEADER));
        if (attempts.length === 1) return HttpResponse.error();
        return HttpResponse.json({
          items: [],
          nextCursor: null,
          complete: true,
        });
      }),
    );

    await createApiClient().GET("/reels");
    expect(attempts).toEqual([null, null]);
  });
});
