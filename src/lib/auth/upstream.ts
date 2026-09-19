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
 * Nothing about the caller's request is forwarded except what is named in
 * `FORWARDED_REQUEST_HEADERS` and `SCENARIO_HEADER`. Not the cookie, not the
 * host, not the user agent. A proxy that forwards headers it was not asked to
 * forward is how a session reaches a place nobody intended.
 */

/** Passed through in a mocked build so `?__scenario=` still reaches MSW. */
const SCENARIO_HEADER = "x-yuvoy-scenario";

/**
 * Request headers the proxy passes through, exactly as sent.
 *
 * An allowlist, for the same reason the paths are: the default is to forward
 * nothing, and every name here is a deliberate act.
 *
 * `Idempotency-Key` earned its place by being missing. The contract makes it a
 * REQUIRED header parameter on `POST /reservations`, and checkout has always
 * sent it — but only a GUEST checkout reaches the API directly. Signed in, the
 * call goes through this proxy, which rebuilt the header set from scratch and
 * dropped it, so the API saw an empty key and refused every reservation with
 * `idempotency_key_malformed`. Every signed-in booking and request failed from
 * 14 September, when the proxy shipped, until this was fixed (yuvoy-app#75).
 *
 * It is not a credential and it is not the caller's identity: it is a value
 * the browser generates from the body so a retry on ferry wifi cannot become
 * two seats on a boat. Forwarding it verbatim is the only way that guarantee
 * survives the hop, since a key minted here would be a different key on every
 * retry and would defeat the mechanism it is named after.
 *
 * `scripts/qa.mjs` reads the pinned contract for every proxied path and fails
 * when a required header parameter is not named here, so the next one cannot
 * arrive the same silent way.
 */
export const FORWARDED_REQUEST_HEADERS = ["Idempotency-Key"] as const;

export interface UpstreamResult {
  status: number;
  /** Parsed when the answer was JSON, `undefined` for a 204 or a non-JSON body. */
  body: unknown;
  /** The raw text, so a non-JSON answer is passed on rather than swallowed. */
  text: string;
  requestId: string | null;
  /**
   * `true` when the API answered from a stored response rather than doing the
   * work again. Set only when the header is present, so a caller can tell
   * "this was a replay" from "this API does not say".
   */
  idempotentReplay: boolean;
  /**
   * The API's own `Date`, so the browser can keep the API's clock rather than
   * this server's. A hold countdown is measured against the API's
   * `expiresAt`; the proxy is a different machine.
   */
  apiDate: string | null;
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
  /**
   * The incoming request, read only for `FORWARDED_REQUEST_HEADERS` and, in a
   * mocked build, the scenario header.
   */
  from?: Request;
  signal?: AbortSignal;
}): Promise<UpstreamResult> {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (options.token) headers.Authorization = `Bearer ${options.token}`;
  if (options.body !== undefined) headers["Content-Type"] = "application/json";

  /*
    The allowlist, copied verbatim. Absent stays absent: sending an empty
    string would turn "the caller did not send one" into "the caller sent
    nothing", and for `Idempotency-Key` those are a 400 and a different 400
    with the same wording.
  */
  if (options.from) {
    for (const name of FORWARDED_REQUEST_HEADERS) {
      const value = options.from.headers.get(name);
      if (value) headers[name] = value;
    }
  }

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
    /*
      A retry after a dropped connection answers `201` with the ORIGINAL
      response, so the status alone cannot tell a caller their second tap did
      nothing. This header is the only thing that can, and the proxy was
      swallowing it. `Headers.get` is case-insensitive, so one read covers
      whatever casing the API chooses.
    */
    idempotentReplay: response.headers.get("Idempotent-Replay") === "true",
    apiDate: response.headers.get("date"),
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
