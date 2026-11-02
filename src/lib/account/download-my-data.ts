import { isErrorEnvelope, NetworkError, YuvoyError } from "@/lib/api/errors";
import { proxyBaseUrl, scenarioHeaders } from "@/lib/api/client";

/**
 * Download my data (yuvoy-app#221, the web half of yuvoy-mobile#369).
 *
 * `GET /me/export` through the proxy, asked ONCE. Not through the shared
 * client, for two reasons:
 *
 *   - That client retries a read on 503, and here a 503 is the API saying the
 *     file took over 6 seconds to make. Three silent attempts would keep a
 *     traveller waiting most of a minute for the same answer. The row offers
 *     to try again instead, which is what the contract asks for.
 *   - The file is handed to the browser as text, as it came, rather than
 *     parsed into an object and written back out. The app never reads the
 *     sections: they grow as features ship.
 */

export interface MyDataFile {
  fileName: string;
  text: string;
}

/** The name the API uses, with its UTC day, for when no header names one. */
export function fallbackFileName(now: Date = new Date()): string {
  return `yuvoy-my-data-${now.toISOString().slice(0, 10)}.json`;
}

/**
 * The file name from a `Content-Disposition`, or null.
 *
 * Only a plain name ending `.json` is taken. The header comes from our own
 * API, but a name is something the browser writes to disk, so anything with
 * a path, a quote or a space in it is refused rather than cleaned up.
 */
export function fileNameOf(disposition: string | null): string | null {
  if (!disposition) return null;
  const match = /filename\s*=\s*"?([^";]+)"?/i.exec(disposition);
  const name = match?.[1]?.trim();
  return name && /^[A-Za-z0-9._-]+\.json$/.test(name) ? name : null;
}

/**
 * Ask for the file. Throws `YuvoyError` with the API's own code and message on
 * any refusal, and `NetworkError` when nothing answered.
 */
export async function fetchMyData(signal?: AbortSignal): Promise<MyDataFile> {
  let response: Response;
  try {
    response = await fetch(`${proxyBaseUrl()}/me/export`, {
      method: "GET",
      // The page's `?__scenario=`, in a mocked build only, as the client does.
      headers: { Accept: "application/json", ...scenarioHeaders() },
      credentials: "same-origin",
      cache: "no-store",
      signal,
    });
  } catch (cause) {
    if (signal?.aborted) throw cause;
    throw new NetworkError(undefined, cause);
  }

  const text = await response.text();
  if (!response.ok) {
    let body: unknown;
    try {
      body = JSON.parse(text);
    } catch {
      body = undefined;
    }
    if (isErrorEnvelope(body)) {
      throw new YuvoyError({
        code: body.error.code,
        message: body.error.message,
        status: response.status,
        details: body.error.details,
        requestId: body.error.requestId,
      });
    }
    throw new YuvoyError({
      code: "unknown_error",
      message: "We couldn't make your file. Try again in a minute.",
      status: response.status,
    });
  }

  return {
    fileName:
      fileNameOf(response.headers.get("Content-Disposition")) ??
      fallbackFileName(),
    text,
  };
}

/**
 * Hand the file to the browser as a download, and keep nothing.
 *
 * The object URL is let go on the next turn: the click has started the
 * download by then, and the file is the traveller's, not the page's.
 */
export function saveFile(file: MyDataFile): void {
  const blob = new Blob([file.text], { type: "application/json" });
  const href = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = href;
  link.download = file.fileName;
  link.rel = "noopener";
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(href), 0);
}
