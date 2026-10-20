"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import { qk } from "@/lib/query/policy";
import { useTravellerSession } from "@/lib/auth/use-traveller";
import { useMyAccount } from "@/lib/auth/use-my-account";
import {
  asAppConfig,
  releaseOpen,
  releaseStage,
  type ReleaseKey,
  type ReleaseStage,
} from "./app-config";

/**
 * A release, read in the browser (yuvoy-app#181, R0-T5): its stage from
 * `GET /app-config`, and whether it is open to this traveller by the API's
 * rule with `cohort` from `GET /me`.
 *
 * For a client shell that decides in the browser what to show, as R3-T3's
 * form and the Trigo sheet will. A page that can decide on the server reads
 * `getAppConfig` and `getCohort` instead, so nothing paints and then hides.
 *
 * ## Shut until it is known
 *
 * `open` is false while either read is out, and stays false when the config
 * could not be read: a screen still being tried must never show for a moment
 * to somebody it is not open to. `pending` says which of the two it is, so a
 * caller that would rather wait than show the closed state can.
 *
 * The cohort is asked for only when the stage depends on it. At `all` or
 * `off` the answer is the same for everybody, and signed out it is null with
 * no call at all (`useMyAccount` is disabled then).
 */

export interface Release {
  stage: ReleaseStage;
  /** Whether this traveller may see what the release adds. */
  open: boolean;
  /** Still finding out: the config, or the cohort a stage depends on. */
  pending: boolean;
}

/** `GET /app-config` in the browser: public, so the plain client, no session. */
export const appConfigQuery = {
  queryKey: qk.appConfig(),
  queryFn: async ({ signal }: { signal?: AbortSignal }) => {
    const { data, error } = await api.GET("/app-config", { signal });
    if (error) throw error;
    return asAppConfig(data);
  },
  /*
    A switch moved in the console reaches the apps "within about 8 minutes",
    so reading it again more often than once a minute buys nothing.
  */
  staleTime: 60_000,
};

export function useRelease(key: ReleaseKey): Release {
  const config = useQuery({ ...appConfigQuery, retry: false });
  const stage = releaseStage(config.data, key);
  const byCohort = stage === "early" || stage === "staff";

  const { signedIn } = useTravellerSession();
  const account = useMyAccount(byCohort ? signedIn : false);

  if (config.isPending) return { stage, open: false, pending: true };
  if (!byCohort) {
    return { stage, open: releaseOpen(stage, null), pending: false };
  }
  if (signedIn === undefined || (signedIn && account.isPending)) {
    return { stage, open: false, pending: true };
  }
  const cohort = signedIn ? (account.data?.cohort ?? null) : null;
  return { stage, open: releaseOpen(stage, cohort), pending: false };
}
