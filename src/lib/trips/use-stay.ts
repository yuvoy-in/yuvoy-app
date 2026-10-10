"use client";

import { useEffect } from "react";
import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import { createProxyClient } from "@/lib/api/client";
import { YuvoyError } from "@/lib/api/errors";
import { useMyAccount, type TravellerAccount } from "@/lib/auth/use-my-account";
import { qk } from "@/lib/query/policy";
import type { components } from "@/lib/api/schema.gen";
import { clearStay, readStay, writeStay, type Stay } from "./stay";

type AccountStay = components["schemas"]["TravellerStay"];

/** Where the days are kept, for the line that says so. */
export type StayHome = "account" | "phone";

/**
 * The days a traveller is on the island: on the account when the API keeps
 * them (yuvoy-api#257), on this phone when it cannot.
 *
 * ## The account is the copy
 *
 * `GET /me` answers `stay` (null when none is kept) on every API since #257,
 * and `PUT /me/stay` and `DELETE /me/stay` change it, through this app's
 * proxy. So a new phone, a cleared browser and the other phone of a couple
 * see the same days. A change writes the API's answer into the `GET /me`
 * cache rather than reading the account back.
 *
 * ## The phone, only where the account cannot
 *
 * An account answer with no `stay` key at all is an API from before #257,
 * and absent means the old behaviour: the days stay in this device's
 * IndexedDB, as they did, and the screen says so.
 *
 * ## A stay set on this phone before the account could keep one
 *
 * Moves to the account once, the first time a signed-in read finds none
 * there, and then leaves the phone. Days already on the account win and the
 * phone's copy is dropped. A move the API refuses (400) can never succeed,
 * so that copy is dropped too; one that fails any other way (no signal, a
 * lapsed session) is kept, shown, and tried again on the next visit.
 *
 * The phone's copy names nobody, so a phone two numbers share hands it to
 * whichever signs in first after this release. Dates only, and only once:
 * a smaller cost than every traveller typing their days in again.
 */
export function useStay(signedIn: boolean | undefined) {
  const client = useQueryClient();
  const account = useMyAccount(signedIn);
  const device = useQuery(deviceStayQuery);

  const answered = account.data;
  /*
    `in`, not a null check: `stay: null` is an account that keeps days and has
    none, while no key at all is an API that cannot keep them.
  */
  const onAccount = answered !== undefined && "stay" in answered;
  const kept: AccountStay | null = onAccount ? (answered.stay ?? null) : null;
  const local = device.data ?? null;

  useEffect(() => {
    if (!onAccount || !local || moves.has(client)) return;
    const move = (async () => {
      try {
        if (!kept) keepOnAccount(client, await putStay(local, null));
        await forgetLocal(client);
      } catch (error) {
        if (error instanceof YuvoyError && error.status === 400) {
          await forgetLocal(client);
        }
      }
    })().finally(() => moves.delete(client));
    moves.set(client, move);
  }, [client, onAccount, kept, local]);

  const save = useMutation({
    retry: false,
    mutationFn: async (next: Stay | null): Promise<Stay | null> => {
      if (!onAccount) {
        if (next) await writeStay(next);
        else await clearStay();
        return next;
      }
      /*
        After any move still under way, never beside it: two PUTs in flight
        land in either order, and the move landing second would put the old
        phone days back over the ones just chosen. A move never rejects.
      */
      await moves.get(client);
      if (!next) return deleteStay();
      return putStay(next, kept);
    },
    onSuccess: (saved) => {
      if (!onAccount) {
        client.setQueryData(qk.deviceStay(), saved);
        return;
      }
      keepOnAccount(client, saved);
      /*
        A phone copy still waiting to move would otherwise come back over the
        days just set (or just cleared). Not awaited, and it cannot throw: a
        rejection here would turn a save the account took into a failure.
      */
      void forgetLocal(client);
    },
  });

  /*
    Signed in, the account decides where the days live, so nothing is known
    until it answers. On the account the phone's read is not waited for: it
    only matters to a stay still to move, and a store that never answers
    (it happens, see `use-checkout.ts`) must not hold the plan back.
  */
  const reading = signedIn === true;
  const failed = reading && account.isLoadingError;
  const pending = failed
    ? false
    : reading && account.isPending
      ? true
      : !onAccount && device.isPending;

  return {
    /*
      While a move is under way, the phone's days are shown, so the plan does
      not flash "Set your days" between the two reads.
    */
    stay: onAccount ? (kept ?? local) : local,
    pending,
    /** The account did not load. `retry` asks again. */
    failed,
    retry: () => void account.refetch(),
    home: (onAccount ? "account" : "phone") as StayHome,
    save,
  };
}

/**
 * The phone's copy, as one definition. Trips asks for it alongside the
 * session (`trips-screen.tsx`), so it is in the cache by the time the panel
 * mounts. Read once and kept: only this module changes it.
 */
export const deviceStayQuery = {
  queryKey: qk.deviceStay(),
  queryFn: readStay,
  staleTime: Infinity,
  gcTime: Infinity,
};

/**
 * A move to the account under way, per query client, so a panel mounted
 * twice (a tab away and back) never sends it twice and a save waits for it.
 * Per client, not per module: each test renders its own.
 */
const moves = new WeakMap<QueryClient, Promise<void>>();

/**
 * Keeps `stay` on the account. `PUT` replaces the whole stay, so a
 * `destinationKey` already kept (set on another client) is sent back with
 * it: changing the dates here must not drop where they are staying.
 */
async function putStay(
  stay: Stay,
  current: AccountStay | null,
): Promise<AccountStay> {
  const { data, error } = await createProxyClient().PUT("/me/stay", {
    body: {
      from: stay.from,
      to: stay.to,
      ...(current?.destinationKey
        ? { destinationKey: current.destinationKey }
        : {}),
    },
  });
  if (error) throw error;
  return data;
}

async function deleteStay(): Promise<null> {
  const { error } = await createProxyClient().DELETE("/me/stay");
  if (error) throw error;
  return null;
}

/** The answer becomes the account's `stay`, with no second read. */
function keepOnAccount(client: QueryClient, stay: AccountStay | null): void {
  client.setQueryData<TravellerAccount>(qk.myAccount(), (account) =>
    account ? { ...account, stay } : account,
  );
}

/** Drops the phone's copy. Never throws: a store that will not open has none. */
async function forgetLocal(client: QueryClient): Promise<void> {
  client.setQueryData(qk.deviceStay(), null);
  try {
    await clearStay();
  } catch {
    // Nothing to forget, or nothing that can be: either way the cache says none.
  }
}
