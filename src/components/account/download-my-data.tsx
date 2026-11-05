"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { YuvoyError } from "@/lib/api/errors";
import { fetchMyData, saveFile } from "@/lib/account/download-my-data";

/** The line under the row, the app's words (yuvoy-mobile#369). */
export const DOWNLOAD_NOTE =
  "One file with everything Yuvoy keeps about you. Up to 3 a day.";

/** Said when nothing answered, so the row can be tapped again. */
export const NO_SIGNAL =
  "We could not reach Yuvoy. Check your signal and try again.";

/**
 * "Download my data" on Account, signed in only (yuvoy-app#221, the web half
 * of yuvoy-mobile#369, API yuvoy-api#417).
 *
 * One tap asks for the file once and the browser saves it under the API's
 * own name, `yuvoy-my-data-<date>.json`. The page keeps nothing.
 *
 * ## Every refusal is shown in the API's own words
 *
 * They are short fixed sentences: three a day (429), a file that took too
 * long (503), a session that is not a sign-in (401). The row stays ready
 * after each, since only a made file counts toward the three.
 *
 * ## A 401 ends the session on the page too
 *
 * The proxy has already dropped the cookie when the API refuses the session,
 * so `onSessionEnded` asks the session again and Account turns into the
 * sign-in form, which is the way forward the issue names. The API's sentence
 * goes with it, since this row is gone once the form shows.
 */
export function DownloadMyData({
  onSessionEnded,
  className,
}: {
  /** The API refused the session; called with its sentence. */
  onSessionEnded: (message: string) => void | Promise<void>;
  className?: string;
}) {
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const controller = useRef<AbortController | null>(null);
  const noteId = useId();

  useEffect(() => () => controller.current?.abort(), []);

  async function download() {
    controller.current?.abort();
    const ask = new AbortController();
    controller.current = ask;
    setPending(true);
    setFailure(null);
    try {
      saveFile(await fetchMyData(ask.signal));
    } catch (cause) {
      if (ask.signal.aborted) return;
      // Anything that is not the API's own refusal is a request that did not
      // arrive, `NetworkError` included, so it is worded as the signal.
      if (cause instanceof YuvoyError) {
        setFailure(cause.message);
        if (cause.status === 401) void onSessionEnded(cause.message);
      } else {
        setFailure(NO_SIGNAL);
      }
    } finally {
      if (!ask.signal.aborted) setPending(false);
    }
  }

  return (
    <div className={className}>
      <Button
        variant="outline"
        block
        pending={pending}
        pendingLabel="Making your file"
        onClick={() => void download()}
        aria-describedby={noteId}
      >
        Download my data
      </Button>
      <p id={noteId} className="text-forest/70 mt-2 text-xs">
        {DOWNLOAD_NOTE}
      </p>
      {failure ? (
        <p role="alert" className="text-terra-deep mt-2 text-sm">
          {failure}
        </p>
      ) : null}
    </div>
  );
}
