import { http, HttpResponse } from "msw";
import type { components } from "../src/lib/api/schema.gen";
import { mockHeaders, mockNow } from "./fixtures";

/**
 * Download my data (yuvoy-app#221, R9-T4): `GET /me/export`.
 *
 * With no scenario the file is made: `generatedAt`, a few sections, and
 * `Content-Disposition` naming it with the mock's UTC day, as the API does.
 * Each scenario below is one refusal, in the API's own words:
 *
 *   - `export-limit`: `429 rate_limited`, the fourth file in a day.
 *   - `export-down`: `503 unavailable`, a file that took over 6 seconds.
 *   - `export-signed-out`: `401 unauthorized`, a session that is not a
 *     sign-in (a recovery link's).
 *
 * The sections are an illustration, never parsed by the app: the real file
 * grows as features ship.
 */

type TravellerExport = components["schemas"]["TravellerExport"];

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8099/v1";
const url = (p: string) => `${BASE}${p}`;

let seq = 0;
const rid = () =>
  `01J${(++seq).toString(36).toUpperCase().padStart(6, "0")}MXPT`;

function envelope(code: string, message: string, status: number) {
  return HttpResponse.json(
    { error: { code, message, requestId: rid() } },
    { status, headers: mockHeaders(rid()) },
  );
}

function scenarioOf(request: Request): string {
  return (
    request.headers.get("x-yuvoy-scenario") ??
    new URL(request.url).searchParams.get("__scenario") ??
    "ok"
  );
}

export const EXPORT_WORDS = {
  signedOut: "Sign in to download your data.",
  limit: "You've downloaded your data 3 times today. Try again tomorrow.",
  down: "We couldn't make your file. Try again in a minute.",
} as const;

/** The file the mock makes, at a given moment. */
export function mockExport(now: Date): TravellerExport {
  return {
    generatedAt: now.toISOString(),
    sections: {
      account: [{ name: "Asha", memberSince: "2026-09-01" }],
      trips: [{ reference: "YV-7K2Q4BCD", status: "confirmed" }],
      saves: [],
      plans: [{ title: "Havelock in March", members: ["Ravi"] }],
    },
  };
}

/** The file as the mock sends it, byte for byte. */
export function exportText(now: Date): string {
  return `${JSON.stringify(mockExport(now), null, 2)}\n`;
}

export const exportHandlers = [
  http.get(url("/me/export"), async ({ request }) => {
    if (!request.headers.get("authorization")) {
      return envelope("unauthorized", EXPORT_WORDS.signedOut, 401);
    }
    switch (scenarioOf(request)) {
      case "export-signed-out":
        return envelope("unauthorized", EXPORT_WORDS.signedOut, 401);
      case "export-limit":
        return envelope("rate_limited", EXPORT_WORDS.limit, 429);
      case "export-down":
        return envelope("unavailable", EXPORT_WORDS.down, 503);
    }
    const now = new Date(mockNow());
    const day = now.toISOString().slice(0, 10);
    /*
      Laid out with two-space indents and a closing newline, so a test can
      tell the file the browser saved is this text and not one parsed and
      written out again on the way through (yuvoy-app#221).
    */
    return new HttpResponse(exportText(now), {
      headers: {
        ...mockHeaders(rid()),
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="yuvoy-my-data-${day}.json"`,
        "Cache-Control": "private, no-store",
      },
    });
  }),
];
