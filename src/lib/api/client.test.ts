import { describe, it, expect, vi } from "vitest";
import { http, HttpResponse, delay } from "msw";
import { createApiClient } from "./client";
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
