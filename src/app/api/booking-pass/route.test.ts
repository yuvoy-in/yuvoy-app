import { describe, it, expect, vi } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "../../../../mocks/server";
import { POST } from "./route";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8099/v1";

/**
 * The pass is drawn for anybody who can post here, so what it forwards is
 * bounded before the API is asked (production readiness, 6 Oct 2026).
 */
describe("the booking pass", () => {
  it("refuses a token longer than any real one, without asking the API", async () => {
    let asked = false;
    server.use(
      http.get(`${BASE}/bookings/status`, () => {
        asked = true;
        return HttpResponse.json({}, { status: 404 });
      }),
    );
    const answer = await POST(
      new Request("https://app.yuvoy.in/api/booking-pass", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token: "x".repeat(513) }),
      }),
    );
    expect(answer.status).toBe(400);
    expect(asked).toBe(false);
  });
});

describe("an API that does not answer", () => {
  it("is a 502 the page can say something about, not a crash", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    server.use(http.get(`${BASE}/bookings/status`, () => HttpResponse.error()));
    const answer = await POST(
      new Request("https://app.yuvoy.in/api/booking-pass", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token: "bst_live_token" }),
      }),
    );
    expect(answer.status).toBe(502);
    expect((await answer.json()).error.code).toBe("unavailable");
  });
});
