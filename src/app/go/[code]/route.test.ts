import { describe, it, expect } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "../../../../mocks/server";
import { GET } from "./route";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8099/v1";

/** Where `/go/<code>` sends somebody, read off the redirect Next throws. */
async function destination(code: string): Promise<string> {
  try {
    await GET(new Request(`https://app.yuvoy.in/go/${code}`), {
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

function scanAnswers(target: string) {
  server.use(
    http.post(`${BASE}/scans`, () =>
      HttpResponse.json({ known: true, target }, { status: 201 }),
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
