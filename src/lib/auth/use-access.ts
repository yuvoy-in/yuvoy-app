"use client";

import type { QueryClient } from "@tanstack/react-query";
import { useTravellerSession, sessionQuery } from "./use-traveller";
import { useMyAccount, myAccountQuery } from "./use-my-account";
import { useHasMounted } from "@/lib/react/use-has-mounted";
import {
  INVITE_ONLY,
  accessOfStanding,
  standingOfAccount,
  type Access,
  type Standing,
} from "@/lib/site/access";

/**
 * The browser's half of the invite gate (yuvoy-api#195): where this device
 * stands, from the session and `GET /me`.
 *
 * `undefined` until it is KNOWN, and that is a state rather than a gap. Until
 * this tree has hydrated, and until the session and (when signed in) the
 * account have answered, nothing may be drawn as a refusal or as permission:
 * a page renders what the server rendered, and a control holds its tap until
 * it can tell (`ensureStanding`).
 *
 * `enabled: false` asks for nothing at all. The session is read by every page
 * already (the Login button), so the only read this can add is `GET /me`, and
 * with the switch off nothing enables it. The one caller that enables it
 * regardless of the switch is checkout after a `403 invite_required`, because
 * the API's gate can be on while this app's is off.
 */
export function useStanding(enabled: boolean): Standing | undefined {
  const { signedIn } = useTravellerSession();
  const account = useMyAccount(enabled ? signedIn : false);
  const mounted = useHasMounted();

  if (!enabled || !mounted || signedIn === undefined) return undefined;
  if (!signedIn) return "signed-out";
  if (account.data) return standingOfAccount(account.data);
  if (account.isError) return "unknown";
  return undefined;
}

/**
 * What the gate lets this device do, as a page would decide it.
 *
 * `open` whenever the switch is off, with nothing read. With it on, a number
 * whose `GET /me` did not say is `open` too, for the reason `Access` gives.
 */
export function useAccess(): Access | undefined {
  const standing = useStanding(INVITE_ONLY);
  if (!INVITE_ONLY) return "open";
  return standing === undefined ? undefined : accessOfStanding(standing);
}

/**
 * The same answer, fetched now, for a tap that arrived before it was known.
 *
 * A save tapped in the first moment after a page loads would otherwise have to
 * be dropped (a dead tap) or guessed (a refusal drawn at somebody who may be
 * admitted, or a save made by somebody who is not). This waits for the two
 * reads the hooks above would have made, through the same query definitions,
 * so it costs nothing when they are already in the cache.
 *
 * A session read that fails is signed out, as `useTravellerSession` reads it;
 * an account read that fails is `unknown`, as `useStanding` reads it.
 */
export async function ensureStanding(qc: QueryClient): Promise<Standing> {
  let signedIn = false;
  try {
    signedIn = (await qc.fetchQuery(sessionQuery)).signedIn;
  } catch {
    signedIn = false;
  }
  if (!signedIn) return "signed-out";

  try {
    return standingOfAccount(await qc.fetchQuery(myAccountQuery));
  } catch {
    return "unknown";
  }
}
