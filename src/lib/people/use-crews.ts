"use client";

import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import { createProxyClient } from "@/lib/api/client";
import { YuvoyError } from "@/lib/api/errors";
import { CACHE, qk } from "@/lib/query/policy";
import { refreshPeople } from "./use-people";
import type { Crew, CrewInput, CrewList, CrewPatch } from "./crews-words";

/**
 * Crews on the web (yuvoy-app#227): a traveller's own named lists of their
 * friends. Only they see them and members are never told. Every call goes
 * through this app's proxy, session only, and each answers `404` while the
 * `people` release is closed, like the rest of People.
 *
 * There is no single-crew read in the contract: a crew's page and its editor
 * find the crew in the list (at most 20, never paged). The list is cached
 * under `qk.myCrews()` and forgotten with People on sign in and sign out.
 */

/** A refusal naming members who are not the caller's friends now. */
export function isNotFriends(error: unknown): boolean {
  return error instanceof YuvoyError && error.code === "not_friends";
}

/** The ids `not_friends` names, lowercased so they compare with ours. */
export function notFriendsIds(error: unknown): string[] {
  if (!isNotFriends(error)) return [];
  const ids = (error as YuvoyError).details.personIds;
  if (!Array.isArray(ids)) return [];
  return ids
    .filter((id): id is string => typeof id === "string")
    .map((id) => id.toLowerCase());
}

/** `crew_limit_reached`: 20 crews already. */
export function isCrewLimit(error: unknown): boolean {
  return error instanceof YuvoyError && error.code === "crew_limit_reached";
}

/**
 * What a crew `404` turned out to be. In the contract that `404` is either a
 * crew that is not the caller's any more (deleted on another device) or the
 * `people` release closed to them, so it proves neither on its own (the
 * shared rule: a `404` is never success). The release is read again first,
 * as People does: `GET /me/people` answers `404` while People is closed to
 * the caller. Then, for a change to one crew, the list: a list without it
 * means the crew is gone. For the list read only, a release that answers
 * `200` is `open`: People is open and only the list did not load. A create or
 * a delete never says `open`: its `404` is `unknown`, so the page says the
 * change did not happen rather than showing the API's word. Anything else, or
 * a read that fails, is `unknown`, and the page says the change did not
 * happen, or that People could not be checked.
 */
export type CrewMissing = "gone" | "closed" | "open" | "unknown";

const missing = new WeakMap<object, CrewMissing>();

/** Why a crew call answered `404`, once it was read again; else null. */
export function crewMissing(error: unknown): CrewMissing | null {
  return error instanceof YuvoyError ? (missing.get(error) ?? null) : null;
}

/** The list read again says the crew is not the caller's any more. */
export function isCrewGone(error: unknown): boolean {
  return crewMissing(error) === "gone";
}

function is404(error: unknown): error is YuvoyError {
  return error instanceof YuvoyError && error.status === 404;
}

/*
  The client throws a `YuvoyError` on every answer that is not 2xx (the error
  middleware in lib/api/client.ts), so a refusal arrives as a throw, never as
  `error` on the result. Each read and each change below catches it.
*/
async function whyMissing(
  crewId?: string,
  signal?: AbortSignal,
  forList = false,
): Promise<{ why: CrewMissing; home?: unknown }> {
  const client = createProxyClient();
  let home: unknown;
  try {
    const { data, error } = await client.GET("/me/people", { signal });
    if (error) throw error;
    home = data;
  } catch (error) {
    return { why: is404(error) ? "closed" : "unknown" };
  }
  if (!crewId) return { why: forList ? "open" : "unknown", home };
  try {
    const { data, error } = await client.GET("/me/crews", { signal });
    if (error) throw error;
    const id = crewId.toLowerCase();
    const why: CrewMissing = data.crews.some(
      (c) => c.crewId.toLowerCase() === id,
    )
      ? "unknown"
      : "gone";
    return { why, home };
  } catch {
    return { why: "unknown", home };
  }
}

/**
 * Reads the release again after a `404` and keeps the answer on the error.
 * Returns the People home it read, when it read one.
 */
async function explain(
  error: unknown,
  crewId?: string,
  signal?: AbortSignal,
  forList = false,
): Promise<unknown> {
  if (!is404(error)) return undefined;
  const { why, home } = await whyMissing(crewId, signal, forList);
  missing.set(error, why);
  return home;
}

/** Makes a change, and explains a `404` it throws before passing it on. */
async function explained<T>(
  change: () => Promise<T>,
  crewId?: string,
): Promise<T> {
  try {
    return await change();
  } catch (error) {
    await explain(error, crewId);
    throw error;
  }
}

/**
 * After a change: the crews list. After a `404`, all of People too, with the
 * Account row (`GET /me` carries `people`), as a People `404` does.
 */
function refreshAfter(qc: QueryClient, error: unknown): Promise<unknown> {
  return is404(error)
    ? refreshPeople(qc)
    : qc.invalidateQueries({ queryKey: qk.myCrews() });
}

/** Writes a change into the cached list at once, before it is read again. */
function patchList(qc: QueryClient, change: (crews: Crew[]) => Crew[]): void {
  qc.setQueryData<CrewList>(qk.myCrews(), (list) =>
    list ? { crews: change(list.crews) } : list,
  );
}

/** `GET /me/crews`, newest first. */
export function useMyCrews(enabled: boolean) {
  const qc = useQueryClient();
  return useQuery({
    queryKey: qk.myCrews(),
    enabled,
    retry: false,
    ...CACHE.listMyCrews,
    queryFn: async ({ signal }) => {
      try {
        const client = createProxyClient();
        const { data, error } = await client.GET("/me/crews", { signal });
        if (error) throw error;
        return data;
      } catch (error) {
        if (is404(error)) {
          const home = await explain(error, undefined, signal, true);
          // The People home just read goes into its cache, so the home does
          // not read it a second time; a closed or failed read makes the
          // home read itself. Not the crews list: that would loop.
          if (home !== undefined) qc.setQueryData(qk.myPeople(), home);
          else void qc.invalidateQueries({ queryKey: qk.myPeople() });
          void qc.invalidateQueries({ queryKey: qk.myAccount() });
        }
        throw error;
      }
    },
  });
}

/** `POST /me/crews`. The new crew goes to the top of the list. */
export function useCreateCrew() {
  const qc = useQueryClient();
  return useMutation({
    retry: false,
    mutationFn: (input: CrewInput): Promise<Crew> =>
      explained(async () => {
        const client = createProxyClient();
        const { data, error } = await client.POST("/me/crews", {
          body: input,
        });
        if (error) throw error;
        return data;
      }),
    onSuccess: (crew) => patchList(qc, (crews) => [crew, ...crews]),
    onSettled: (_, error) => refreshAfter(qc, error),
  });
}

/**
 * `PATCH /me/crews/{crewId}`: a new name, new members, or both. A `404`
 * reads the release and the list again before it is thrown (`crewMissing`).
 */
export function useUpdateCrew() {
  const qc = useQueryClient();
  return useMutation({
    retry: false,
    mutationFn: async ({
      crewId,
      patch,
    }: {
      crewId: string;
      patch: CrewPatch;
    }): Promise<Crew> =>
      explained(async () => {
        const client = createProxyClient();
        const { data, error } = await client.PATCH("/me/crews/{crewId}", {
          params: { path: { crewId } },
          body: patch,
        });
        if (error) throw error;
        return data;
      }, crewId),
    onSuccess: (crew) =>
      patchList(qc, (crews) =>
        crews.map((c) => (c.crewId === crew.crewId ? crew : c)),
      ),
    onSettled: (_, error) => refreshAfter(qc, error),
  });
}

/**
 * `DELETE /me/crews/{crewId}`. Done only on `204` (a crew that is gone
 * answers `204` too). A `404` is never done: the release is read again and
 * the page says People closed, or that the crew was not deleted.
 */
export function useDeleteCrew() {
  const qc = useQueryClient();
  return useMutation({
    retry: false,
    mutationFn: (crewId: string): Promise<void> =>
      explained(async () => {
        const client = createProxyClient();
        const { error, response } = await client.DELETE("/me/crews/{crewId}", {
          params: { path: { crewId } },
        });
        if (error) throw error;
        if (response.status !== 204) {
          throw new YuvoyError({
            code: "internal_error",
            message: "",
            status: response.status,
          });
        }
      }),
    onSuccess: (_, crewId) =>
      patchList(qc, (crews) => crews.filter((c) => c.crewId !== crewId)),
    onSettled: (_, error) => refreshAfter(qc, error),
  });
}
