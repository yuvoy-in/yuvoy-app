import { preconnect } from "react-dom";
import { apiBaseUrl } from "@/lib/api/client";

/**
 * Connection warm-ups for the hosts a page is about to need (production
 * readiness, 6 Oct 2026).
 *
 * Measured on the live app on a throttled phone profile, the first request to
 * a cross-origin host took about 550ms longer than the next one on the same
 * connection: DNS, TCP and TLS, paid at the moment the page needed the answer.
 * Search's results, a listing's availability and a reel's first frame each
 * waited behind one. A hint in the HTML starts that work while the page is
 * still parsing.
 *
 * Where a page asks for the hint decides when it lands. A listing asks at the
 * top of the page and gets a `<link>` in the HTML's head. The feed and Search
 * ask inside their gated content, so theirs travels in the RSC payload and
 * starts at hydration, which on a throttled phone is still about a second
 * before their first read from the browser.
 *
 * Playwright's default contexts ignore these hints, so a lab run in one never
 * shows them; a persistent context honours them. Measured that way on
 * production after the release: the first API read and the first video
 * manifest each found their connection already open, where without the hint
 * the manifest waited about 330ms for one.
 *
 * Only where a page reads from the host as it loads. A connection nobody uses
 * is a handshake spent on a metered link and then dropped.
 */

/** The origin of a URL, or null for anything that does not parse. */
export function originOf(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

/**
 * The API, for a page that reads it from the browser as it loads.
 *
 * `crossOrigin: "anonymous"` because those reads are CORS fetches without
 * credentials, which the browser keeps in a connection pool of their own. A
 * hint without it warms a connection the fetch never uses.
 */
export function preconnectApi(): void {
  // A mocked build answers from a service worker: there is no host to warm.
  if (process.env.NEXT_PUBLIC_API_MOCKING === "enabled") return;
  const origin = originOf(apiBaseUrl());
  if (origin) preconnect(origin, { crossOrigin: "anonymous" });
}
