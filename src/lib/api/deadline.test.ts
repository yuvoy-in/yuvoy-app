import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fetchWithin, StalledError } from "./deadline";

/**
 * The deadline on silence (production readiness, 6 Oct 2026).
 *
 * Before it, a request on a connection that had died waited for the browser or
 * the platform to give up: minutes on a phone, five on the server. The stand-in
 * `fetch` below behaves as the platform's does when its signal is aborted: the
 * pending request rejects, and a body that is still arriving errors.
 */

const URL_ = "https://api.example.test/v1/reels";

/** A body that sends `chunks` one at a time, `everyMs` apart, then closes. */
function trickle(
  chunks: string[],
  everyMs: number,
  signal: AbortSignal,
  options: { close?: boolean } = {},
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      signal.addEventListener("abort", () => controller.error(signal.reason));
      chunks.forEach((chunk, i) => {
        setTimeout(
          () => {
            if (signal.aborted) return;
            controller.enqueue(encoder.encode(chunk));
            if (i === chunks.length - 1 && options.close !== false) {
              controller.close();
            }
          },
          everyMs * (i + 1),
        );
      });
    },
  });
}

/** A `fetch` that never answers, and rejects the way the platform does. */
function silent(rejectWith: "reason" | "abort-error" = "reason") {
  return vi.fn(
    (_input: RequestInfo | URL, init?: RequestInit) =>
      new Promise<Response>((_, reject) => {
        const signal = init?.signal;
        const fail = () =>
          reject(
            rejectWith === "reason"
              ? signal?.reason
              : new DOMException("The operation was aborted.", "AbortError"),
          );
        if (signal?.aborted) fail();
        else signal?.addEventListener("abort", fail);
      }),
  );
}

/** Settles a promise into a value the test can inspect without racing it. */
function settle<T>(promise: Promise<T>) {
  const state: { value?: T; error?: unknown; done: boolean } = { done: false };
  promise.then(
    (value) => Object.assign(state, { value, done: true }),
    (error: unknown) => Object.assign(state, { error, done: true }),
  );
  return state;
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("fetchWithin", () => {
  it("gives up on an answer that never begins", async () => {
    vi.stubGlobal("fetch", silent());
    const read = settle(fetchWithin(URL_, {}, 1_000));

    await vi.advanceTimersByTimeAsync(999);
    expect(read.done).toBe(false);

    await vi.advanceTimersByTimeAsync(1);
    expect(read.error).toBeInstanceOf(StalledError);
  });

  it("never cuts off a slow answer that is still arriving", async () => {
    /*
      Five chunks over three seconds against a one-second deadline. A deadline
      on the whole transfer would have failed this read; this is the case the
      design exists for, a link that is slow and alive.
    */
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async (_input: RequestInfo | URL, init?: RequestInit) =>
          new Response(
            trickle(["[1,", "2,", "3,", "4,", "5]"], 600, init!.signal!),
            { status: 200, headers: { "content-type": "application/json" } },
          ),
      ),
    );
    const read = settle(fetchWithin(URL_, {}, 1_000));

    await vi.advanceTimersByTimeAsync(3_000);
    expect(read.error).toBeUndefined();
    expect(await read.value!.json()).toEqual([1, 2, 3, 4, 5]);
  });

  it("gives up on an answer that stops arriving halfway", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async (_input: RequestInfo | URL, init?: RequestInit) =>
          new Response(
            trickle(['{"items":['], 100, init!.signal!, { close: false }),
            { status: 200 },
          ),
      ),
    );
    const read = settle(fetchWithin(URL_, {}, 1_000));

    await vi.advanceTimersByTimeAsync(1_099);
    expect(read.done).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(read.error).toBeInstanceOf(StalledError);
  });

  it("rejects with the caller's own reason when the caller cancels", async () => {
    vi.stubGlobal("fetch", silent());
    const controller = new AbortController();
    const read = settle(
      fetchWithin(URL_, { signal: controller.signal }, 1_000),
    );

    controller.abort();
    await vi.advanceTimersByTimeAsync(0);
    expect(read.error).not.toBeInstanceOf(StalledError);
    expect((read.error as Error).name).toBe("AbortError");
  });

  it("rejects at once for a caller that has already cancelled", async () => {
    const fetchMock = silent();
    vi.stubGlobal("fetch", fetchMock);
    const read = settle(
      fetchWithin(URL_, { signal: AbortSignal.abort() }, 1_000),
    );

    await vi.advanceTimersByTimeAsync(0);
    expect((read.error as Error).name).toBe("AbortError");
    expect(fetchMock.mock.calls[0]?.[1]?.signal?.aborted).toBe(true);
  });

  it("names the stall even on an engine that rejects with a bare AbortError", async () => {
    vi.stubGlobal("fetch", silent("abort-error"));
    const read = settle(fetchWithin(URL_, {}, 1_000));

    await vi.advanceTimersByTimeAsync(1_000);
    expect(read.error).toBeInstanceOf(StalledError);
  });

  it("leaves no timer running once the answer is in", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ items: [] })),
    );
    const response = await fetchWithin(URL_, {}, 1_000);

    expect(await response.json()).toEqual({ items: [] });
    expect(vi.getTimerCount()).toBe(0);
  });

  it("keeps the status and headers, and a bodiless answer bodiless", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(
          Response.json(
            { reservationId: "res_1" },
            { status: 201, headers: { "x-request-id": "req_1" } },
          ),
        )
        .mockResolvedValueOnce(new Response(null, { status: 204 })),
    );

    const created = await fetchWithin(URL_, { method: "POST" }, 1_000);
    expect(created.status).toBe(201);
    expect(created.headers.get("x-request-id")).toBe("req_1");
    expect(await created.json()).toEqual({ reservationId: "res_1" });

    const empty = await fetchWithin(URL_, { method: "DELETE" }, 1_000);
    expect(empty.status).toBe(204);
    expect(empty.body).toBeNull();
  });
});

describe("a Request", () => {
  it("is handed to fetch as its URL and an init, with the deadline's own signal", async () => {
    /*
      Given a Request and a signal, Next 16.3 folds them into new Requests
      and keeps only the last, so the abort can be lost to a garbage
      collection mid-request. See "`fetch` is never handed a `Request`
      together with a signal" in ./deadline.
    */
    const seen: { input: unknown; init?: RequestInit }[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        seen.push({ input, init });
        return Response.json({});
      }),
    );
    const request = new Request(URL_, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: "Bearer t",
      },
      body: JSON.stringify({ events: [] }),
      cache: "no-store",
    });

    await fetchWithin(request, {}, 1_000);
    expect(seen).toHaveLength(1);
    expect(seen[0].input).toBe(URL_);
    const init = seen[0].init ?? {};
    expect(init.method).toBe("POST");
    expect(new Headers(init.headers).get("authorization")).toBe("Bearer t");
    expect(new TextDecoder().decode(init.body as ArrayBuffer)).toBe(
      JSON.stringify({ events: [] }),
    );
    expect(init.cache).toBe("no-store");
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });
});
