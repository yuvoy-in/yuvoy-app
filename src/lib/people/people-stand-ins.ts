"use client";

import type { QueryClient } from "@tanstack/react-query";
import { myAccountQuery } from "@/lib/auth/use-my-account";
import { appConfigQuery } from "@/lib/site/use-release";
import {
  releaseOpen,
  releaseStage,
  type Cohort,
  type ReleaseKey,
} from "@/lib/site/app-config";

/**
 * What the follow and crew invite code needs from People work that is not on
 * dev yet (yuvoy-mobile#392). Each piece is small, has its own name so it
 * cannot clash with the one it stands in for, and says what replaces it.
 * Once yuvoy-app#386 and #222 are in, this file goes.
 */

/**
 * People closed to this reader: the line a 404 turns into once a read says
 * so (decision A, 2 Nov: a 404 is never success).
 */
// Swap for PEOPLE_WORDS.closed from #222 once it merges.
export const PEOPLE_SHUT_WORDS = Object.freeze({
  title: "People is not open yet",
  body: "When it opens to you, it shows on Account.",
});

/** People closed, as one line for a button or a picker. */
export const PEOPLE_SHUT_LINE = `${PEOPLE_SHUT_WORDS.title}. ${PEOPLE_SHUT_WORDS.body}`;

/** Mobile's People error words, the ones follow and invite can need. */
// Swap for PEOPLE_ERROR_WORDS from #386 once it merges.
export const PEOPLE_FAILURE_WORDS = Object.freeze({
  signIn: "Sign in again to use People.",
  age: "People is for adults. Confirm your age to go on.",
  name: "Add your first name before you use People.",
  paused: "Your use of People is paused for now.",
  ended: "Your use of People has ended.",
  noSignal: "We could not reach Yuvoy. Check your signal and try again.",
  fault: "Something went wrong on our side. Try again in a minute.",
});

/**
 * Thrown by the hooks in place of a 404 once a read again says People is
 * closed to this reader, so a screen can tell that from "not there".
 */
// Swap for PeopleClosedError from #386 once it merges.
export class PeopleShutError extends Error {
  constructor() {
    super("People is closed to this reader.");
    this.name = "PeopleShutError";
  }
}

/** Whether an error is People closed, as the hooks here throw it. */
// Swap for #386's isPeopleClosed (an instanceof check on PeopleClosedError)
// once it merges. Not #222's isPeopleClosed: that one is a raw 404 check and
// would read a "gone" 404 as People closed.
export function isPeopleShut(error: unknown): boolean {
  return error instanceof PeopleShutError;
}

/**
 * The releases read again after a 404, with the cohort when a stage needs
 * one. Gives a function that says whether each key is open to this reader,
 * or null when the config could not be read (the 404 then stays as it is,
 * which still shows no success).
 */
// Swap for afterNotFound from #386 once it merges.
export async function releasesReadAgain(
  qc: QueryClient,
  signedIn: boolean,
  keys: readonly ReleaseKey[],
): Promise<((key: ReleaseKey) => boolean) | null> {
  try {
    const config = await qc.fetchQuery({ ...appConfigQuery, staleTime: 0 });
    const byCohort = keys.some((key) => {
      const stage = releaseStage(config, key);
      return stage === "early" || stage === "staff";
    });
    let cohort: Cohort = null;
    if (byCohort && signedIn) {
      const account = await qc.fetchQuery({ ...myAccountQuery, staleTime: 0 });
      cohort = account?.cohort ?? null;
    }
    return (key) => releaseOpen(releaseStage(config, key), cohort);
  } catch {
    return null;
  }
}

/** The groups directory and every group page, read again. */
// Swap for readGroupsAgain from #386 once it merges.
export function readDirectoryAgain(qc: QueryClient): Promise<void> {
  return Promise.all([
    qc.invalidateQueries({ queryKey: ["listClubs"] }),
    qc.invalidateQueries({ queryKey: ["getClub"] }),
  ]).then(() => undefined);
}

/** The traveller's crews, read again (a crew page after an invite). */
// Swap for qk.myCrews from #227 once it merges.
export function readCrewsAgain(qc: QueryClient): Promise<void> {
  return qc.invalidateQueries({ queryKey: ["listMyCrews"] });
}
