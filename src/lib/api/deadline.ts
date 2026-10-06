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
    const response = await fetch(input, {
      ...init,
      signal: controller.signal,
    });
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

/** The whole body, with `progress` told of every chunk as it lands. */
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
