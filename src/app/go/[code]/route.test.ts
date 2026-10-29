import { afterEach, describe, it, expect, vi } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "../../../../mocks/server";
import { GET } from "./route";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8099/v1";

/** Where `/go/<code>` sends somebody, read off the redirect Next throws. */
async function destination(
  code: string,
  headers?: Record<string, string>,
): Promise<string> {
  try {
    await GET(new Request(`https://app.yuvoy.in/go/${code}`, { headers }), {
      params: Promise.resolve({ code }),
    });
  } catch (thrown) {
    const digest = (thrown as { digest?: string }).digest ?? "";
    // NEXT_REDIRECT;<type>;<url>;<status>;
    if (digest.startsWith("NEXT_REDIRECT")) return digest.split(";")[2];
    throw thrown;
  }
  throw new Error("expected a redirect");
}

function scanAnswers(target: string, kind?: "printed" | "creator") {
  server.use(
    http.post(`${BASE}/scans`, () =>
      HttpResponse.json(
        { known: true, target, ...(kind ? { kind } : {}) },
        { status: 201 },
      ),
    ),
  );
}

/**
 * A printed QR code sends whoever scans it wherever its record says
 * (production readiness, 6 Oct 2026). The record is typed by a person, so the
 * route only ever follows a path on this site.
 */
describe("the scan redirect", () => {
  it("follows a target that is a path on this site", async () => {
    scanAnswers("/e/havelock-night-kayak-bioluminescence");
    expect(await destination("JETTY-1")).toBe(
      "/e/havelock-night-kayak-bioluminescence?src=qr&code=JETTY-1",
    );
  });

  it("never follows a target off the site", async () => {
    for (const target of [
      "https://evil.example/login",
      "//evil.example/login",
      "/\\evil.example",
      "javascript:alert(1)",
    ]) {
      scanAnswers(target);
      expect(await destination("JETTY-1"), target).toBe(
        "/?src=qr&code=JETTY-1",
      );
    }
  });
});

/** A traveller's own link (R12-T2, yuvoy-mobile#389). */
describe("a creator's link", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("arrives as src=creator when the API says the code is a creator's", async () => {
    scanAnswers("/e/havelock-night-kayak-bioluminescence", "creator");
    expect(await destination("C-K7QM2XPA")).toBe(
      "/e/havelock-night-kayak-bioluminescence?src=creator&code=C-K7QM2XPA",
    );
  });

  it("stays src=qr for a printed card, and when the API cannot be reached", async () => {
    scanAnswers("/e/havelock-night-kayak-bioluminescence", "printed");
    expect(await destination("JETTY-1")).toBe(
      "/e/havelock-night-kayak-bioluminescence?src=qr&code=JETTY-1",
    );
    server.use(http.post(`${BASE}/scans`, () => HttpResponse.error()));
    expect(await destination("C-K7QM2XPA")).toBe("/?src=qr&code=C-K7QM2XPA");
  });

  it("sends the visitor's own address, for the API's per-address limit", async () => {
    vi.stubEnv(
      "PROXY_CLIENT_IP_SECRET",
      "0123456789abcdef0123456789abcdef0123456789abcdef",
    );
    const seen: Headers[] = [];
    server.use(
      http.post(`${BASE}/scans`, ({ request }) => {
        seen.push(request.headers);
        return HttpResponse.json({ known: true, target: "/", kind: "creator" });
      }),
    );
    await destination("C-K7QM2XPA", { "x-real-ip": "203.0.113.9" });
    expect(seen[0].get("x-yuvoy-client-ip")).toBe("203.0.113.9");
    expect(seen[0].get("x-yuvoy-proxy-secret")).toBeTruthy();
  });
});
