/**
 * A fetch that gives up on a connection that has gone quiet (production
 * readiness, 6 Oct 2026).
 *
 * Nothing that called the API had a deadline. A read on a connection that died
 * mid-crossing waited for the phone to notice, which can take minutes, with a
 * spinner the whole time; a server render that asked a stalled API held the
 * page until the platform's own limit, five minutes.
 *
 * ## Silence is timed, not the whole transfer
 *
 * The deadline fires when no answer has begun, or no more of one has arrived,
 * for `stallMs`. A slow link that is still delivering is never cut off, and a
 * dead one is given up on in seconds. A deadline on the whole transfer would
 * have to choose between those two, and on island signal either choice is
 * wrong for somebody.
 *
 * ## The answer comes back already read
 *
 * The body is read inside the deadline. A connection that drops halfway
 * through an answer is then the same fault as one that never answered, and a
 * read is retried as one, instead of the failure surfacing later as a JSON
 * parse error that nothing retries. Every answer this is used for is a few
 * kilobytes, so holding it whole costs nothing.
 *
 * ## `fetch` is never handed a `Request` together with a signal
 *
 * On the server that pairing loses the abort. Next 16.3's patched `fetch`
 * folds the init into a new `Request` and then copies THAT into a second one,
 * keeping only the second (`next/dist/server/lib/patch-fetch.js`). The first,
 * and the controller the signal is relayed through, can be garbage-collected
 * mid-request, and after a collection the abort never reaches the socket. In
 * a plain Node experiment a fetch aborted at one second ran its full four;
 * in the suite, Search's 3s budget let a render wait 4.5s for an answer
 * (production readiness, 6 Oct 2026). A URL with its init keeps the signal in
 * the init, which `fetch` follows directly, so that is all this ever passes.
 * A side effect: Next does not memoise a read that carries a signal, so a
 * read two parts of a render share is shared with React's `cache`.
 */

/** What a request that went quiet is aborted with. */
export class StalledError extends Error {
  readonly stallMs: number;
  constructor(stallMs: number) {
    super(`Nothing arrived for ${stallMs}ms.`);
    this.name = "StalledError";
    this.stallMs = stallMs;
  }
}

/** Statuses that carry no body, which a `Response` refuses to be given one. */
const NULL_BODY_STATUS = new Set([101, 103, 204, 205, 304]);

/**
 * `fetch`, given up on after `stallMs` of silence, resolving with the whole
 * answer read.
 *
 * `init.signal` stays the caller's own cancellation: when it fires, this
 * rejects with its reason exactly as `fetch` would. Only the deadline rejects
 * with a `StalledError`, so a caller can always tell "I cancelled this" from
 * "the network went quiet".
 */
export async function fetchWithin(
  input: RequestInfo | URL,
  init: RequestInit,
  stallMs: number,
): Promise<Response> {
  const caller = init.signal ?? null;
  const controller = new AbortController();
  const cancel = () => controller.abort(caller?.reason);
  if (caller?.aborted) cancel();
  else caller?.addEventListener("abort", cancel, { once: true });

  let timer: ReturnType<typeof setTimeout> | undefined;
  const rearm = () => {
    clearTimeout(timer);
    timer = setTimeout(
      () => controller.abort(new StalledError(stallMs)),
      stallMs,
    );
  };

  rearm();
  try {
    const [url, sent] = await asUrlAndInit(input, init);
    const response = await fetch(url, { ...sent, signal: controller.signal });
    rearm();
    return await readWhole(response, rearm);
  } catch (cause) {
    /*
      Some engines reject an aborted fetch with a plain AbortError rather than
      the reason it was aborted with. The reason is the truth, so it is what
      is thrown, unless the caller cancelled, which is theirs to see as-is.
    */
    const reason: unknown = controller.signal.reason;
    if (!caller?.aborted && reason instanceof StalledError) throw reason;
    throw cause;
  } finally {
    clearTimeout(timer);
    caller?.removeEventListener("abort", cancel);
  }
}

/**
 * `input` as a URL, and an init that says everything else the `Request` did.
 * See "`fetch` is never handed a `Request` together with a signal" above.
 */
async function asUrlAndInit(
  input: RequestInfo | URL,
  init: RequestInit,
): Promise<[string | URL, RequestInit]> {
  if (typeof input === "string" || input instanceof URL) return [input, init];
  // Next's own options (`revalidate`, `tags`) ride on the request object.
  const { next } = input as { next?: RequestInit["next"] };
  return [
    input.url,
    {
      method: input.method,
      headers: input.headers,
      body: input.body ? await input.arrayBuffer() : undefined,
      cache: input.cache,
      credentials: input.credentials,
      integrity: input.integrity,
      keepalive: input.keepalive,
      mode: input.mode,
      redirect: input.redirect,
      referrer: input.referrer,
      referrerPolicy: input.referrerPolicy,
      ...(next === undefined ? {} : { next }),
      ...init,
    },
  ];
}

/**
 * The whole body, with `progress` told of every chunk as it lands.
 *
 * Chromium's network panel lists a response read this way as "(canceled)",
 * `net::ERR_ABORTED`, once its last byte is in. Nothing was lost. Measured
 * against production on 6 Oct 2026: the whole body arrived, the next request
 * reused the same connection, and the same URL read with `arrayBuffer()` is
 * listed as finished. It is how the panel reports a body drained through a
 * reader, so a red row there is not a failed read.
 */
async function readWhole(
  response: Response,
  progress: () => void,
): Promise<Response> {
  if (!response.body || response.status < 200 || response.status > 599) {
    return response;
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    length += value.byteLength;
    progress();
  }

  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return new Response(NULL_BODY_STATUS.has(response.status) ? null : bytes, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
}
