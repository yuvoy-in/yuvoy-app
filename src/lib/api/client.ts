import createFetchClient, { type Middleware } from "openapi-fetch";
import type { paths } from "./schema.gen";
import {
  YuvoyError,
  NetworkError,
  isErrorEnvelope,
  type ErrorCode,
} from "./errors";
import { recordServerDate } from "@/lib/booking/clock";

/**
 * The one place `fetch` is called.
 *
 * Three behaviours are non-negotiable, and each exists because of a specific
 * way this app can lose somebody money on a 0.5 Mbps island connection:
 *
 *   1. Throws a typed `YuvoyError` carrying code / details / requestId, so
 *      call sites branch on `code` and never on `message`.
 *   2. Retries GET ONLY. A blind POST retry is how one checkout becomes two.
 *      `POST /reservations` is protected by its idempotency key; nothing else
 *      is, so nothing else may be replayed automatically.
 *   3. Never logs a URL fragment. The booking status token lives in one, and
 *      this API logs request URIs.
 */

const DEFAULT_BASE_URL = "http://localhost:8099/v1";

export function apiBaseUrl(): string {
  return process.env.NEXT_PUBLIC_API_URL ?? DEFAULT_BASE_URL;
}

/** Observers get told about every response, success or failure. */
export type ResponseObserver = (info: {
  requestId?: string;
  status: number;
  method: string;
  /** Path only — never the full URL, which could carry a fragment. */
  path: string;
  durationMs: number;
}) => void;

const observers = new Set<ResponseObserver>();

export function observeResponses(fn: ResponseObserver): () => void {
  observers.add(fn);
  return () => observers.delete(fn);
}

function notify(info: Parameters<ResponseObserver>[0]) {
  for (const fn of observers) {
    try {
      fn(info);
    } catch {
      // An observer must never be able to fail a request.
    }
  }
}

/* ------------------------------------------------------------------ retry */

/** Retry only these. Everything else is either fine or must not be replayed. */
const RETRYABLE_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);

/**
 * Codes that are a deliberate refusal rather than a transient fault. Retrying
 * `booking_disabled` just asks a human's decision again, four times.
 */
const NEVER_RETRY: ReadonlySet<string> = new Set<ErrorCode>([
  "booking_disabled",
  "operator_not_bookable",
  "payments_unavailable",
  "media_unavailable",
  "rate_limited",
]);

const MAX_GET_ATTEMPTS = 3;

/**
 * Exponential backoff with full jitter. Jitter matters more than usual here:
 * a whole ferry of travellers regains signal at the same moment, and
 * un-jittered backoff turns that into a synchronised stampede.
 */
export function backoffMs(attempt: number): number {
  const base = Math.min(300 * 2 ** attempt, 4_000);
  return Math.round(base * (0.5 + Math.random() * 0.5));
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/* ----------------------------------------------------------------- client */

/** Strips any fragment before a URL is handed to a logger. */
function safePath(url: string): string {
  try {
    const u = new URL(url, "http://x");
    return u.pathname;
  } catch {
    return url.split("#")[0].split("?")[0];
  }
}

const errorMiddleware: Middleware = {
  async onResponse({ response, request }) {
    const requestId =
      response.headers.get("x-request-id") ??
      response.headers.get("X-Request-Id") ??
      undefined;

    notify({
      requestId: requestId ?? undefined,
      status: response.status,
      method: request.method,
      path: safePath(request.url),
      durationMs: 0,
    });

    // The one clock the hold countdown may trust. See lib/booking/clock.
    recordServerDate(response.headers.get("date"));

    if (response.ok) return response;

    // Read the envelope without consuming the caller's copy.
    let body: unknown = undefined;
    try {
      body = await response.clone().json();
    } catch {
      // A non-JSON error body is itself information — fall through.
    }

    if (isErrorEnvelope(body)) {
      throw new YuvoyError({
        code: body.error.code,
        message: body.error.message,
        status: response.status,
        details: body.error.details,
        requestId: body.error.requestId ?? requestId ?? undefined,
      });
    }

    throw new YuvoyError({
      code: "internal_error",
      message: `The server answered ${response.status}.`,
      status: response.status,
      requestId: requestId ?? undefined,
    });
  },
};

/**
 * Wraps fetch with GET-only retry. Sits beneath openapi-fetch so that a
 * retried request is indistinguishable from a first attempt to the caller.
 */
/**
 * In a mocked build, nothing may leave before the worker is intercepting.
 *
 * The alternative — gating the React tree until the worker is ready — is what
 * broke server rendering: it returned null on the server, so every page had an
 * empty body and the content lived only in the RSC payload. Waiting HERE keeps
 * SSR intact and removes the race entirely.
 *
 * Compiled out when mocking is off: NEXT_PUBLIC_* is inlined at build time.
 */
async function awaitMocks(): Promise<void> {
  if (process.env.NEXT_PUBLIC_API_MOCKING !== "enabled") return;
  if (typeof window === "undefined") return;
  try {
    const { startBrowserMocks } = await import("../../../mocks/start-browser");
    await startBrowserMocks();
  } catch {
    // A failed worker must not block the request. It goes to the real origin,
    // which is a visible, diagnosable failure rather than a hang.
  }
}

function retryingFetch(input: Request): Promise<Response> {
  const isGet = input.method === "GET";

  const attempt = async (n: number): Promise<Response> => {
    let res: Response;
    try {
      await awaitMocks();
      res = await fetch(isGet ? input.clone() : input);
    } catch (cause) {
      if (isGet && n < MAX_GET_ATTEMPTS - 1) {
        await sleep(backoffMs(n));
        return attempt(n + 1);
      }
      throw new NetworkError(undefined, cause);
    }

    if (!isGet || res.ok || n >= MAX_GET_ATTEMPTS - 1) return res;
    if (!RETRYABLE_STATUS.has(res.status)) return res;

    // A deliberate stop is not a transient fault — do not hammer it.
    try {
      const body = await res.clone().json();
      if (isErrorEnvelope(body) && NEVER_RETRY.has(body.error.code)) return res;
    } catch {
      // Unparseable body: treat the status alone as the signal.
    }

    await sleep(backoffMs(n));
    return attempt(n + 1);
  };

  return attempt(0);
}

/**
 * Carries a `?__scenario=` from the PAGE url into every API request.
 *
 * The scenario switch is read by the mock handlers off the API request, but it
 * is documented — and only usable — as a parameter on the page: nobody types a
 * query string onto a fetch they cannot see. Without this the switch silently
 * did nothing, which is exactly the kind of gap that makes a failure state
 * "untestable" and then unbuilt.
 *
 * Compiled out of any build that does not enable mocking, because
 * NEXT_PUBLIC_* is inlined at build time.
 */
function scenarioHeaders(): Record<string, string> {
  if (process.env.NEXT_PUBLIC_API_MOCKING !== "enabled") return {};
  if (typeof window === "undefined") return {};
  const scenario = new URLSearchParams(window.location.search).get(
    "__scenario",
  );
  return scenario ? { "x-yuvoy-scenario": scenario } : {};
}

/**
 * The scenario header for a SERVER-side call, given the page's own query.
 *
 * `scenarioHeaders()` above reads `window.location`, so it is empty on the
 * server by construction — which meant a Server Component's fetch never
 * carried the switch and always got the ordinary answer.
 *
 * That was invisible while the homepage's prefetch was failing for an
 * unrelated reason: the client did every fetch, carried the header, and the
 * failure states rendered. The moment the prefetch started working, the server
 * seeded `initialData` with a healthy feed and the client never refetched — so
 * `/?__scenario=booking-disabled` showed a working feed and the kill switch
 * became untestable. Exactly the gap the switch exists to close, one layer up.
 *
 * Compiled out of any build that does not enable mocking, because
 * NEXT_PUBLIC_* is inlined at build time.
 */
export function serverScenarioHeaders(
  scenario: string | undefined,
): Record<string, string> {
  if (process.env.NEXT_PUBLIC_API_MOCKING !== "enabled") return {};
  return scenario ? { "x-yuvoy-scenario": scenario } : {};
}

export function createApiClient(options?: { baseUrl?: string }) {
  const client = createFetchClient<paths>({
    baseUrl: options?.baseUrl ?? apiBaseUrl(),
    fetch: retryingFetch as typeof fetch,
    headers: { "Content-Type": "application/json" },
  });

  if (process.env.NEXT_PUBLIC_API_MOCKING === "enabled") {
    client.use({
      onRequest({ request }) {
        for (const [k, v] of Object.entries(scenarioHeaders())) {
          request.headers.set(k, v);
        }
        return request;
      },
    });
  }

  client.use(errorMiddleware);
  return client;
}

/** The shared browser client. Server components build their own per request. */
export const api = createApiClient();
