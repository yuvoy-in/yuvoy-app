import { describe, it, expect, beforeEach, vi } from "vitest";
import { http, HttpResponse } from "msw";
import { NetworkError, YuvoyError } from "@/lib/api/errors";
import { server } from "../../../mocks/server";
import {
  __resetAppRouteMocks,
  __signInAppRouteMock,
} from "../../../mocks/app-route-handlers";
import { EXPORT_WORDS, exportText } from "../../../mocks/export-handlers";
import {
  LET_GO_AFTER_MS,
  fallbackFileName,
  fetchMyData,
  fileNameOf,
  saveFile,
} from "./download-my-data";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8099/v1";

beforeEach(() => {
  __resetAppRouteMocks();
  __signInAppRouteMock();
});

/** The thrown value, so a test can look at it rather than only at its type. */
async function failure(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (cause) {
    return cause;
  }
  throw new Error("expected the request to fail");
}

describe("the file name (yuvoy-app#221)", () => {
  it("takes the API's name from the header", () => {
    expect(
      fileNameOf('attachment; filename="yuvoy-my-data-2026-11-02.json"'),
    ).toBe("yuvoy-my-data-2026-11-02.json");
    expect(fileNameOf("attachment; filename=yuvoy-my-data.json")).toBe(
      "yuvoy-my-data.json",
    );
  });

  it("REFUSES a name with a path, a space or another extension", () => {
    // The browser writes this name to disk, so it is refused, never cleaned.
    expect(fileNameOf('attachment; filename="../evil.json"')).toBeNull();
    expect(fileNameOf('attachment; filename="a/b.json"')).toBeNull();
    expect(fileNameOf('attachment; filename="my data.json"')).toBeNull();
    expect(fileNameOf('attachment; filename="data.exe"')).toBeNull();
    expect(fileNameOf("attachment")).toBeNull();
    expect(fileNameOf(null)).toBeNull();
  });

  it("falls back to the API's own pattern, on the UTC day", () => {
    // 01:30 on the 2nd in Kolkata is still the 1st in UTC, the day the API names.
    expect(fallbackFileName(new Date("2026-11-01T20:00:00Z"))).toBe(
      "yuvoy-my-data-2026-11-01.json",
    );
  });
});

describe("asking for the file", () => {
  it("returns the file as it came, under the API's name", async () => {
    const file = await fetchMyData();
    expect(file.fileName).toMatch(/^yuvoy-my-data-\d{4}-\d{2}-\d{2}\.json$/);
    const body = JSON.parse(file.text) as {
      generatedAt: string;
      sections: Record<string, unknown>;
    };
    expect(file.text).toBe(exportText(new Date(body.generatedAt)));
    expect(body.sections).toHaveProperty("account");
  });

  it("asks once, even when the API says 503", async () => {
    // The shared client would retry a read on 503. Here that is the API
    // saying the file took too long, so the row offers to try again instead.
    let asked = 0;
    server.use(
      http.get(`${BASE}/me/export`, () => {
        asked += 1;
        return HttpResponse.json(
          { error: { code: "unavailable", message: EXPORT_WORDS.down } },
          { status: 503 },
        );
      }),
    );
    const cause = await failure(fetchMyData());
    expect(cause).toBeInstanceOf(YuvoyError);
    expect((cause as YuvoyError).code).toBe("unavailable");
    expect((cause as YuvoyError).message).toBe(EXPORT_WORDS.down);
    expect(asked).toBe(1);
  });

  it("carries the API's sentence for the fourth file in a day", async () => {
    server.use(
      http.get(`${BASE}/me/export`, () =>
        HttpResponse.json(
          { error: { code: "rate_limited", message: EXPORT_WORDS.limit } },
          { status: 429, headers: { "Retry-After": "3600" } },
        ),
      ),
    );
    const cause = (await failure(fetchMyData())) as YuvoyError;
    expect(cause.status).toBe(429);
    expect(cause.code).toBe("rate_limited");
    expect(cause.message).toBe(EXPORT_WORDS.limit);
  });

  it("says 401 when the session is not a sign-in", async () => {
    server.use(
      http.get(`${BASE}/me/export`, () =>
        HttpResponse.json(
          { error: { code: "unauthorized", message: EXPORT_WORDS.signedOut } },
          { status: 401 },
        ),
      ),
    );
    const cause = (await failure(fetchMyData())) as YuvoyError;
    expect(cause.status).toBe(401);
    expect(cause.message).toBe(EXPORT_WORDS.signedOut);
  });

  it("words a failure with no envelope as the file, not as a code", async () => {
    server.use(
      http.get(
        "*/api/v1/me/export",
        () => new HttpResponse("<html>Bad gateway</html>", { status: 502 }),
      ),
    );
    const cause = (await failure(fetchMyData())) as YuvoyError;
    expect(cause).toBeInstanceOf(YuvoyError);
    expect(cause.status).toBe(502);
    expect(cause.message).toBe(
      "We couldn't make your file. Try again in a minute.",
    );
  });

  it("is a NetworkError when nothing answered", async () => {
    server.use(http.get("*/api/v1/me/export", () => HttpResponse.error()));
    expect(await failure(fetchMyData())).toBeInstanceOf(NetworkError);
  });

  it("is NOT a NetworkError when the page gave up on it", async () => {
    const ask = new AbortController();
    ask.abort();
    const cause = await failure(fetchMyData(ask.signal));
    expect(cause).not.toBeInstanceOf(NetworkError);
  });
});

describe("saving the file", () => {
  it("keeps the object URL a minute after the click, for WebKit", () => {
    vi.useFakeTimers();
    const revoke = vi.fn();
    Object.defineProperty(URL, "createObjectURL", {
      value: () => "blob:mock/1",
      configurable: true,
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      value: revoke,
      configurable: true,
    });
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => {});
    try {
      saveFile({ fileName: "yuvoy-my-data-2026-11-02.json", text: "{}" });
      expect(click).toHaveBeenCalledTimes(1);
      vi.advanceTimersByTime(LET_GO_AFTER_MS - 1);
      expect(revoke).not.toHaveBeenCalled();
      vi.advanceTimersByTime(1);
      expect(revoke).toHaveBeenCalledWith("blob:mock/1");
    } finally {
      click.mockRestore();
      vi.useRealTimers();
    }
  });
});
