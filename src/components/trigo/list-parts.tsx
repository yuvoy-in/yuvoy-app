"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";
import {
  FailurePanel,
  describeError,
  type DescribedError,
} from "@/components/states";
import {
  trigoListDownSentence,
  trigoListFault,
  trigoListSentence,
} from "@/lib/trigo/lists";
import { TRIGO_LISTS_WORDS as W } from "@/lib/trigo/lists-words";

/**
 * What the date alerts screen and the Drafts view share (yuvoy-app#220).
 *
 * `describeError` reads a `503 unavailable` as "We cannot reach your
 * bookings", which is not what failed here. The lists say what did fail, in
 * the heading, and on a 503 the API's own sentence under it.
 */
export function listFailure(error: unknown, title: string): DescribedError {
  const d = describeError(error);
  const body =
    trigoListFault(error) === "down" ? trigoListDownSentence(error) : d.body;
  return { ...d, title, body };
}

/** A list that did not load: what failed, why, and Try again. */
export function ListFailed({
  error,
  title,
  onRetry,
  retrying,
}: {
  error: unknown;
  title: string;
  onRetry: () => void;
  retrying: boolean;
}) {
  const d = listFailure(error, title);
  return (
    <div
      role="alert"
      className="flex w-full flex-col items-center justify-center px-6 py-16 text-center"
    >
      <p className="font-display tracking-display leading-display text-2xl text-balance">
        {d.title}
      </p>
      <p className="text-forest/70 mt-3 max-w-sm text-sm text-pretty">
        {d.body}
      </p>
      {d.canRetry ? (
        <Button
          className="mt-6"
          pending={retrying}
          pendingLabel={W.retrying}
          onClick={onRetry}
        >
          {W.tryAgain}
        </Button>
      ) : null}
      {d.requestId ? (
        <p className="text-forest/70 mt-8 font-mono text-[10px]">
          {d.requestId}
        </p>
      ) : null}
    </div>
  );
}

/** The API's sentence after a `404` on a change, over the list read again. */
export function GoneNotice({ message }: { message: string }) {
  return (
    <Panel tone="outline" role="status" className="mt-4 px-4 py-3">
      <p className="text-sm text-pretty">{message}</p>
    </Panel>
  );
}

/**
 * One change at a time on a list: the item being changed, the API's sentence
 * after a `404`, the failure under the item for anything else, and whether a
 * `401` ended the sign-in. Every button is off while one change runs.
 */
export function useListChange(
  change: (id: string) => Promise<void>,
  words: { gone: string; failed: string },
) {
  const [working, setWorking] = useState<string | null>(null);
  const [failed, setFailed] = useState<{
    id: string;
    failure: DescribedError;
  } | null>(null);
  const [gone, setGone] = useState<string | null>(null);
  const [expired, setExpired] = useState(false);
  const busy = useRef(false);

  const run = async (id: string) => {
    if (busy.current) return;
    busy.current = true;
    setWorking(id);
    setFailed(null);
    setGone(null);
    try {
      await change(id);
    } catch (error) {
      const fault = trigoListFault(error);
      if (fault === "sign-in") setExpired(true);
      else if (fault === "gone") setGone(trigoListSentence(error, words.gone));
      else setFailed({ id, failure: listFailure(error, words.failed) });
    } finally {
      busy.current = false;
      setWorking(null);
    }
  };

  return {
    working,
    gone,
    expired,
    failureOf: (id: string) => (failed?.id === id ? failed.failure : null),
    run: (id: string) => void run(id),
  };
}

/** A change that failed, under its item, with Try again when it can help. */
export function ChangeFailed({
  failure,
  off,
  onRetry,
}: {
  failure: DescribedError;
  off: boolean;
  onRetry: () => void;
}) {
  return (
    <FailurePanel failure={failure} className="mt-3">
      {failure.canRetry ? (
        <Button
          variant="outline"
          size="sm"
          className="mt-3"
          disabled={off}
          onClick={onRetry}
        >
          {W.tryAgain}
        </Button>
      ) : null}
    </FailurePanel>
  );
}
