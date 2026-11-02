"use client";

import { useCallback, useRef } from "react";
import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import { createProxyClient } from "@/lib/api/client";
import { YuvoyError } from "@/lib/api/errors";
import { useSessionAfter401 } from "@/lib/auth/session-after-401";
import { useTravellerSession } from "@/lib/auth/use-traveller";
import { CACHE, qk } from "@/lib/query/policy";
import {
  PeopleShutError,
  readDirectoryAgain,
  releasesReadAgain,
} from "@/lib/people/people-stand-ins";
import { followsAfter, type ClubFollows, type FollowedClub } from "./follows";

/**
 * Follow a group (yuvoy-mobile#392, web half): the follows list and the two
 * writes, all through this app's proxy, which holds the session.
 *
 * A 404 is never success (decision A). The list and Stop following answer
 * 404 only while People is closed to the caller, so there it means closed.
 * Follow also answers 404 for a group that is not shown, so after a 404 the
 * releases and the list are read again to tell the two apart.
 */

function is404(error: unknown): boolean {
  return error instanceof YuvoyError && error.status === 404;
}

/** One read of `GET /me/club-follows`; its 404 is People closed. */
async function readClubFollows(signal?: AbortSignal): Promise<ClubFollows> {
  const client = createProxyClient();
  try {
    const { data, error } = await client.GET("/me/club-follows", { signal });
    if (error || !data) {
      throw error ?? new Error("GET /me/club-follows had no body.");
    }
    return data;
  } catch (error) {
    if (is404(error)) throw new PeopleShutError();
    throw error;
  }
}

const clubFollowsQuery = {
  queryKey: qk.myClubFollows(),
  queryFn: ({ signal }: { signal?: AbortSignal }) => readClubFollows(signal),
  ...CACHE.listMyClubFollows,
};

/**
 * The groups this traveller follows, newest first. Kept five minutes and
 * read again on every mount (policy.ts), so a page that opens reads it
 * again. `retry: false`: a 401 is a sign-in that ended, and reads the
 * session again; People closed does not open by asking again at once.
 */
export function useMyClubFollows(enabled: boolean) {
  const query = useQuery({ ...clubFollowsQuery, enabled, retry: false });
  useSessionAfter401(query.error);
  return query;
}

/**
 * What a follow's 404 turns into: People closed when the releases or the
 * list now say so, else the group is not there and the directory is read
 * again so it drops out. When nothing can be read the 404 stays, which shows
 * "not there" and never success.
 */
async function afterFollow404(
  qc: QueryClient,
  signedIn: boolean,
  error: unknown,
): Promise<unknown> {
  const open = await releasesReadAgain(qc, signedIn, ["people"]);
  if (open && !open("people")) return new PeopleShutError();
  if (await peopleShutByFollows(qc)) return new PeopleShutError();
  void readDirectoryAgain(qc);
  return error;
}

/**
 * The follows list read again as the People signal: true when it answers
 * People closed. Any other outcome, a list or a failure, is false. The
 * crew invite uses it too after a 404.
 */
export async function peopleShutByFollows(qc: QueryClient): Promise<boolean> {
  try {
    await qc.fetchQuery({ ...clubFollowsQuery, staleTime: 0 });
    return false;
  } catch (readError) {
    return readError instanceof PeopleShutError;
  }
}

/** What a follow or an unfollow is sent with. */
export interface FollowInput {
  clubId: string;
  /** The group as the page shows it, so the list can name it at once. */
  club?: FollowedClub;
}

/**
 * The guard both writes share: one request per group while one is out, so a
 * burst of taps sends one write. `send` is the guarded mutate.
 */
function useOneAtATime(mutate: (input: FollowInput) => void) {
  const busy = useRef(new Set<string>());
  const send = useCallback(
    (input: FollowInput) => {
      if (busy.current.has(input.clubId)) return;
      busy.current.add(input.clubId);
      mutate(input);
    },
    [mutate],
  );
  const done = useCallback((clubId: string) => {
    busy.current.delete(clubId);
  }, []);
  return { send, done };
}

/**
 * `PUT /me/club-follows/{clubId}`. The list changes only once the API has
 * taken it (204), never before. A 401 reads the session again so the page
 * offers Sign in.
 */
export function useFollowClub() {
  const qc = useQueryClient();
  const { signedIn } = useTravellerSession();
  const mutation = useMutation({
    retry: false,
    mutationFn: async ({ clubId }: FollowInput): Promise<void> => {
      const client = createProxyClient();
      try {
        const { error } = await client.PUT("/me/club-follows/{clubId}", {
          params: { path: { clubId } },
        });
        if (error) throw error;
      } catch (error) {
        if (is404(error)) {
          throw await afterFollow404(qc, Boolean(signedIn), error);
        }
        throw error;
      }
    },
    onSuccess: async (_data, { clubId, club }) => {
      // A read still out (the list reads again on mount) would land after this and undo it.
      await qc.cancelQueries({ queryKey: qk.myClubFollows() });
      qc.setQueryData<ClubFollows>(qk.myClubFollows(), (old) =>
        followsAfter(old, clubId, true, club),
      );
    },
    onError: (error) => {
      if (error instanceof YuvoyError && error.status === 401) {
        void qc.invalidateQueries({ queryKey: qk.session() });
      }
    },
    onSettled: (_data, _error, { clubId }) => guard.done(clubId),
  });
  const guard = useOneAtATime(mutation.mutate);
  return { ...mutation, follow: guard.send };
}

/**
 * `DELETE /me/club-follows/{clubId}`. 204 also for a group not followed.
 * Its only 404 is People closed, so that is what it throws, and the list is
 * left as it was.
 */
export function useUnfollowClub() {
  const qc = useQueryClient();
  const mutation = useMutation({
    retry: false,
    mutationFn: async ({ clubId }: FollowInput): Promise<void> => {
      const client = createProxyClient();
      try {
        const { error } = await client.DELETE("/me/club-follows/{clubId}", {
          params: { path: { clubId } },
        });
        if (error) throw error;
      } catch (error) {
        if (is404(error)) throw new PeopleShutError();
        throw error;
      }
    },
    onSuccess: async (_data, { clubId }) => {
      await qc.cancelQueries({ queryKey: qk.myClubFollows() });
      qc.setQueryData<ClubFollows>(qk.myClubFollows(), (old) =>
        followsAfter(old, clubId, false),
      );
    },
    onError: (error) => {
      if (error instanceof YuvoyError && error.status === 401) {
        void qc.invalidateQueries({ queryKey: qk.session() });
      }
    },
    onSettled: (_data, _error, { clubId }) => guard.done(clubId),
  });
  const guard = useOneAtATime(mutation.mutate);
  return { ...mutation, unfollow: guard.send };
}
