"use client";

import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import { api, createProxyClient } from "@/lib/api/client";
import { YuvoyError } from "@/lib/api/errors";
import { useTravellerSession } from "@/lib/auth/use-traveller";
import { CACHE, qk } from "@/lib/query/policy";
import { myAccountQuery } from "@/lib/auth/use-my-account";
import { releaseOpen, releaseStage } from "@/lib/site/app-config";
import { appConfigQuery } from "@/lib/site/use-release";
import { isSignedOut } from "@/lib/tables/use-table";
import type {
  Club,
  ClubClaimInput,
  ClubClaimReceipt,
  ClubList,
  ClubRemovalReceipt,
  ClubRemovalRequest,
  ClubReport,
  ClubReportReceipt,
} from "./clubs";
import { PeopleClosedError } from "./clubs";

/**
 * The groups directory's reads and writes (yuvoy-mobile#386, web backfill).
 *
 *   useClubs(destinationKey: string | null): UseQueryResult<ClubList>
 *     One place's groups. Off until the session is known and a place is
 *     given.
 *   useClub(slug: string): UseQueryResult<Club>
 *     One group, for its page. Off until the session is known.
 *   useClaimClub(clubId: string): UseMutationResult<ClubClaimReceipt, Error, ClubClaimInput>
 *     Signed in only.
 *   useRequestClubRemoval(clubId: string): UseMutationResult<ClubRemovalReceipt, Error, ClubRemovalRequest>
 *     Anyone. Sent with the session when there is one.
 *   useReportClub(clubId: string): UseMutationResult<ClubReportReceipt, Error, ClubReport>
 *     Signed in only.
 *
 * A refusal is a `YuvoyError` (or `NetworkError`); `clubFailure(action,
 * error)` in `./clubs` turns it into words. A 202's `message` is the API's
 * own sentence, shown as it comes.
 *
 * Signed in, every call goes through this app's proxy (`createProxyClient`),
 * which adds the session cookie. Signed out, the reads go to the public pair
 * (`/clubs`, `/clubs/{slug}`) with `api`, and so does a removal.
 *
 * Never cached (`CACHE.listClubs`): the API answers no-store, because a
 * group can be hidden at any moment. A 401 means the session ended: the
 * session is read again, and a read falls back to the public pair rather
 * than drawing a failure.
 *
 * A 404 is never success (decision A, 2 Nov). Every read and form here reads
 * the release again on a 404: closed to this reader, it throws a
 * `PeopleClosedError` in place of the 404 (People closed); still open, the
 * 404 stays ("not there"). A 404 from a form also reads the directory and the
 * page again.
 */

/** Read the public answer after a 401 on the `/me/` pair, as `usePlaceList` does. */
function endedSession(qc: QueryClient, cause: unknown): void {
  if (!(cause instanceof YuvoyError && cause.status === 401)) throw cause;
  void qc.invalidateQueries({ queryKey: qk.session() });
}

/** The directory and every group page, read again (a group was hidden or is gone). */
function readGroupsAgain(qc: QueryClient): Promise<void> {
  return Promise.all([
    qc.invalidateQueries({ queryKey: ["listClubs"] }),
    qc.invalidateQueries({ queryKey: ["getClub"] }),
  ]).then(() => undefined);
}

/**
 * What a 404 from a People call means, found by reading the release again,
 * with the cohort when its stage needs one: a `PeopleClosedError` when it is
 * closed to this reader, else the 404 itself. Any other error comes back as
 * it is. When the release cannot be read the 404 stays, which still shows no
 * success.
 */
async function afterNotFound(
  qc: QueryClient,
  signedIn: boolean,
  error: unknown,
): Promise<unknown> {
  if (!(error instanceof YuvoyError && error.status === 404)) return error;
  try {
    const config = await qc.fetchQuery({ ...appConfigQuery, staleTime: 0 });
    const stage = releaseStage(config, "people");
    const byCohort = stage === "early" || stage === "staff";
    const account =
      byCohort && signedIn
        ? await qc.fetchQuery({ ...myAccountQuery, staleTime: 0 })
        : null;
    return releaseOpen(stage, account?.cohort ?? null)
      ? error
      : new PeopleClosedError();
  } catch {
    return error;
  }
}

/** Runs one call; a 404 it throws goes through `afterNotFound` first. */
async function checked<T>(
  qc: QueryClient,
  signedIn: boolean,
  run: () => Promise<T>,
): Promise<T> {
  try {
    return await run();
  } catch (error) {
    throw await afterNotFound(qc, signedIn, error);
  }
}

/** What every form does with a refusal. */
function onRefused(qc: QueryClient, error: unknown): void {
  if (isSignedOut(error)) {
    void qc.invalidateQueries({ queryKey: qk.session() });
    return;
  }
  if (
    error instanceof PeopleClosedError ||
    (error instanceof YuvoyError && error.status === 404)
  ) {
    void readGroupsAgain(qc);
  }
}

/** One place's groups: `GET /me/clubs` signed in, `GET /clubs` signed out. */
export function useClubs(destinationKey: string | null) {
  const qc = useQueryClient();
  const { signedIn } = useTravellerSession();
  const key = destinationKey ?? "";
  return useQuery({
    ...CACHE.listClubs,
    queryKey: qk.clubs(Boolean(signedIn), key),
    enabled: signedIn !== undefined && key !== "",
    retry: false,
    queryFn: ({ signal }): Promise<ClubList> =>
      checked(qc, Boolean(signedIn), async () => {
      const query = { destinationKey: key };
      if (signedIn) {
        try {
          const { data } = await createProxyClient().GET("/me/clubs", {
            params: { query },
            signal,
          });
          if (data) return data;
        } catch (cause) {
          endedSession(qc, cause);
        }
      }
      const { data, error } = await api.GET("/clubs", {
        params: { query },
        signal,
      });
      if (error || !data)
        throw error ?? new Error("GET /clubs answered no list.");
      return data;
    }),
  });
}

/** One group: `GET /me/clubs/{slug}` signed in, `GET /clubs/{slug}` signed out. */
export function useClub(slug: string) {
  const qc = useQueryClient();
  const { signedIn } = useTravellerSession();
  return useQuery({
    ...CACHE.listClubs,
    queryKey: qk.club(Boolean(signedIn), slug),
    enabled: signedIn !== undefined && slug !== "",
    retry: false,
    queryFn: ({ signal }): Promise<Club> =>
      checked(qc, Boolean(signedIn), async () => {
      const params = { path: { slug } };
      if (signedIn) {
        try {
          const { data } = await createProxyClient().GET("/me/clubs/{slug}", {
            params,
            signal,
          });
          if (data) return data;
        } catch (cause) {
          endedSession(qc, cause);
        }
      }
      const { data, error } = await api.GET("/clubs/{slug}", {
        params,
        signal,
      });
      if (error || !data)
        throw error ?? new Error("GET /clubs/{slug} answered no group.");
      return data;
    }),
  });
}

/**
 * Claim a group. The 202 changes nothing on the listing (it stays "Not on
 * Yuvoy yet" until a person approves it), so nothing is read again.
 */
export function useClaimClub(clubId: string) {
  const qc = useQueryClient();
  return useMutation({
    retry: false,
    mutationFn: (body: ClubClaimInput): Promise<ClubClaimReceipt> =>
      checked(qc, true, async () => {
      const { data, error } = await createProxyClient().POST(
        "/clubs/{clubId}/claims",
        { params: { path: { clubId } }, body },
      );
      if (error || !data) throw error ?? new Error("The claim had no receipt.");
      return data;
    }),
    onError: (error) => onRefused(qc, error),
  });
}

/**
 * Ask for a listing to come down. Anyone may: with the session when there is
 * one, else with no credential. `removed: true` means it is hidden now, so
 * the directory and the page are read again.
 */
export function useRequestClubRemoval(clubId: string) {
  const qc = useQueryClient();
  const { signedIn } = useTravellerSession();
  return useMutation({
    retry: false,
    mutationFn: (body: ClubRemovalRequest): Promise<ClubRemovalReceipt> =>
      checked(qc, Boolean(signedIn), async () => {
      const client = signedIn ? createProxyClient() : api;
      const { data, error } = await client.POST(
        "/clubs/{clubId}/removal-requests",
        { params: { path: { clubId } }, body },
      );
      if (error || !data)
        throw error ?? new Error("The removal request had no receipt.");
      return data;
    }),
    onSuccess: (data) => {
      if (data.removed) void readGroupsAgain(qc);
    },
    onError: (error) => onRefused(qc, error),
  });
}

/** Report a group. The listing stays as it is until a person looks. */
export function useReportClub(clubId: string) {
  const qc = useQueryClient();
  return useMutation({
    retry: false,
    mutationFn: (body: ClubReport): Promise<ClubReportReceipt> =>
      checked(qc, true, async () => {
      const { data, error } = await createProxyClient().POST(
        "/clubs/{clubId}/reports",
        { params: { path: { clubId } }, body },
      );
      if (error || !data)
        throw error ?? new Error("The report had no receipt.");
      return data;
    }),
    onError: (error) => onRefused(qc, error),
  });
}
