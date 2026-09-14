import { apiBaseUrl } from "@/lib/api/client";

/**
 * One call to the traveller API, made by this app's own server.
 *
 * Deliberately NOT `createApiClient`. That client is built for a screen: it
 * throws a typed `YuvoyError`, retries GETs, and records the server clock for
 * the hold countdown. A route handler wants the opposite of all three. It has
 * to pass the API's status and body through UNCHANGED, because the forms on
 * the other side branch on `error.code` and yuvoy-app#57 says so in as many
 * words: "it passes the status and error body through unchanged, so the form's
 * existing error messages still work." Turning the envelope into a thrown
 * error here would mean re-encoding it on the way out, and a re-encoded
 * envelope is one that can drift.
 *
 * Nothing about the caller's request is forwarded except what is listed. Not
 * the cookie, not the host, not the user agent. A proxy that forwards headers
 * it was not asked to forward is how a session reaches a place nobody
 * intended.
 */

/** Passed through in a mocked build so `?__scenario=` still reaches MSW. */
const SCENARIO_HEADER = "x-yuvoy-scenario";

export interface UpstreamResult {
  status: number;
  /** Parsed when the answer was JSON, `undefined` for a 204 or a non-JSON body. */
  body: unknown;
  /** The raw text, so a non-JSON answer is passed on rather than swallowed. */
  text: string;
  requestId: string | null;
}

export async function callUpstream(options: {
  method: string;
  /** A contract path with a leading slash, already checked against the allowlist. */
  path: string;
  /** The caller's query string, including the leading `?`, or "". */
  search?: string;
  /** The session token to sign with, if this call is authenticated. */
  token?: string | null;
  /** A JSON body, for a write. */
  body?: unknown;
  /** The incoming request, read only for the scenario header. */
  from?: Request;
  signal?: AbortSignal;
}): Promise<UpstreamResult> {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (options.token) headers.Authorization = `Bearer ${options.token}`;
  if (options.body !== undefined) headers["Content-Type"] = "application/json";

  /*
    Only in a mocked build, and only from the incoming request. Reading it
    unconditionally would let anybody set a scenario header against the real
    API, which does not honour it but should never be offered the chance.
  */
  if (process.env.NEXT_PUBLIC_API_MOCKING === "enabled" && options.from) {
    const scenario = options.from.headers.get(SCENARIO_HEADER);
    if (scenario) headers[SCENARIO_HEADER] = scenario;
  }

  const response = await fetch(
    `${apiBaseUrl()}${options.path}${options.search ?? ""}`,
    {
      method: options.method,
      headers,
      body:
        options.body === undefined ? undefined : JSON.stringify(options.body),
      // The API's own cache rules are not this proxy's to reinterpret.
      cache: "no-store",
      signal: options.signal,
    },
  );

  const text = await response.text();
  let body: unknown = undefined;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      // A non-JSON body is itself information. `text` carries it on.
    }
  }

  return {
    status: response.status,
    body,
    text,
    requestId:
      response.headers.get("x-request-id") ??
      response.headers.get("X-Request-Id"),
  };
}

/** `session.expiresAt` off a `GET /me` answer, if it is there. */
export function sessionExpiryOf(body: unknown): string | null {
  if (typeof body !== "object" || body === null) return null;
  const session = (body as { session?: unknown }).session;
  if (typeof session !== "object" || session === null) return null;
  const expiresAt = (session as { expiresAt?: unknown }).expiresAt;
  return typeof expiresAt === "string" ? expiresAt : null;
}
