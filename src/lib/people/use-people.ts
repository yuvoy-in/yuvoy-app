"use client";

import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import { createProxyClient } from "@/lib/api/client";
import { YuvoyError } from "@/lib/api/errors";
import { CACHE, qk } from "@/lib/query/policy";
import type {
  Friend,
  FriendLink,
  PeopleHome,
  PersonRef,
  Sharing,
} from "./people-words";

/**
 * People on the web (yuvoy-app#222): the home, the friends list, the friend
 * link and the age step. Every call goes through this app's proxy, which
 * holds the session: People is session only, signed out every call is `401`.
 *
 * Behind the `people` release. Outside it the API answers `404` to every
 * People call, so a `404` from the home means "closed to you", not a failure.
 */

/** Twenty friends a page, sent explicitly so an upstream default cannot move it. */
export const FRIENDS_PAGE_SIZE = 20;

/** The home's `404`: the people release is closed to this traveller. */
export function isPeopleClosed(error: unknown): boolean {
  return error instanceof YuvoyError && error.status === 404;
}

/** Whether a refusal asks for the age step first. */
export function needsAge(error: unknown): boolean {
  return (
    error instanceof YuvoyError && error.code === "adult_confirmation_required"
  );
}

/** Whether a refusal asks for a first name first. */
export function needsName(error: unknown): boolean {
  return error instanceof YuvoyError && error.code === "name_required";
}

/**
 * After any write: the home's counts, the friends list and the Account row's
 * summary (`GET /me` carries `people`) are all read again.
 */
function refreshPeople(qc: QueryClient): Promise<unknown> {
  return Promise.all([
    qc.invalidateQueries({ queryKey: qk.myPeople() }),
    qc.invalidateQueries({ queryKey: qk.myFriends() }),
    qc.invalidateQueries({ queryKey: qk.myAccount() }),
  ]);
}

/** `GET /me/people`. Never cached: the requests waiting move under it. */
export function usePeopleHome(enabled: boolean) {
  return useQuery({
    queryKey: qk.myPeople(),
    enabled,
    retry: false,
    ...CACHE.getMyPeople,
    queryFn: async ({ signal }) => {
      const client = createProxyClient();
      const { data, error } = await client.GET("/me/people", { signal });
      if (error) throw error;
      return data;
    },
  });
}

/** `GET /me/friends`, paged by `nextCursor` until it is null. */
export function useMyFriends(enabled: boolean) {
  return useInfiniteQuery({
    queryKey: qk.myFriends(),
    enabled,
    retry: false,
    ...CACHE.listMyFriends,
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam, signal }) => {
      const client = createProxyClient();
      const { data, error } = await client.GET("/me/friends", {
        params: {
          query: {
            limit: FRIENDS_PAGE_SIZE,
            // Omitted on the first page: `cursor=` empty is another request.
            ...(pageParam ? { cursor: pageParam } : {}),
          },
        },
        signal,
      });
      if (error) throw error;
      return data;
    },
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
}

/** Every friend loaded so far, in the order the pages came. */
export function friendsOf(
  pages: { friends: Friend[] }[] | undefined,
): Friend[] {
  return pages?.flatMap((p) => p.friends) ?? [];
}

export interface PeoplePatch {
  sharing?: Sharing;
  shareUpcomingGoing?: boolean;
  requestEmails?: boolean;
}

/** `PATCH /me/people`. The answer is the whole home, so it replaces it. */
export function useUpdatePeople() {
  const qc = useQueryClient();
  return useMutation({
    retry: false,
    mutationFn: async (patch: PeoplePatch): Promise<PeopleHome> => {
      const client = createProxyClient();
      const { data, error } = await client.PATCH("/me/people", { body: patch });
      if (error || !data)
        throw error ?? new Error("PATCH /me/people had no body.");
      return data;
    },
    onSuccess: (home) => {
      qc.setQueryData(qk.myPeople(), home);
    },
  });
}

/**
 * Accept or Decline. A `404` means it is no longer waiting (answered on
 * another device, or taken back): the lists are read again either way, so
 * the row goes and the screen says why.
 */
export function useAnswerRequest() {
  const qc = useQueryClient();
  return useMutation({
    retry: false,
    mutationFn: async (input: {
      requestId: string;
      answer: "accept" | "decline";
    }) => {
      const client = createProxyClient();
      const { data, error } = await client.POST(
        "/me/friend-requests/{requestId}/answer",
        {
          params: { path: { requestId: input.requestId } },
          body: { answer: input.answer },
        },
      );
      if (error) throw error;
      return data;
    },
    onSettled: () => refreshPeople(qc),
  });
}

/** Take back a request this traveller sent. A `404` means it already went. */
export function useWithdrawRequest() {
  const qc = useQueryClient();
  return useMutation({
    retry: false,
    mutationFn: async (requestId: string) => {
      const client = createProxyClient();
      const { error, response } = await client.DELETE(
        "/me/friend-requests/{requestId}",
        { params: { path: { requestId } } },
      );
      if (error && response.status !== 404) throw error;
    },
    onSettled: () => refreshPeople(qc),
  });
}

/** Unfriend. A `404` means they are already not a friend: the same outcome. */
export function useRemoveFriend() {
  const qc = useQueryClient();
  return useMutation({
    retry: false,
    mutationFn: async (personId: string) => {
      const client = createProxyClient();
      const { error, response } = await client.DELETE(
        "/me/friends/{personId}",
        {
          params: { path: { personId } },
        },
      );
      if (error && response.status !== 404) throw error;
    },
    onSettled: () => refreshPeople(qc),
  });
}

/**
 * `PUT /me/friend-link`: the link they have, or a new one. With `rotate` the
 * old code stops working and a new one is made. The home is patched with the
 * answer at once, so the link on screen is the one the API keeps.
 */
export function usePutFriendLink() {
  const qc = useQueryClient();
  return useMutation({
    retry: false,
    mutationFn: async (rotate: boolean): Promise<FriendLink> => {
      const client = createProxyClient();
      const { data, error } = await client.PUT("/me/friend-link", {
        body: rotate ? { rotate: true } : {},
      });
      if (error || !data)
        throw error ?? new Error("PUT /me/friend-link had no body.");
      return data;
    },
    onSuccess: (friendLink) => {
      qc.setQueryData<PeopleHome>(qk.myPeople(), (old) =>
        old ? { ...old, friendLink } : old,
      );
    },
  });
}

/** Switch the friend link off. */
export function useDeleteFriendLink() {
  const qc = useQueryClient();
  return useMutation({
    retry: false,
    mutationFn: async () => {
      const client = createProxyClient();
      const { error, response } = await client.DELETE("/me/friend-link");
      if (error && response.status !== 404) throw error;
    },
    onSuccess: () => {
      qc.setQueryData<PeopleHome>(qk.myPeople(), (old) =>
        old ? { ...old, friendLink: null } : old,
      );
    },
  });
}

/** What a friend link says, for `/add/{code}`. */
export type LinkLookup = {
  state: "ok" | "expired" | "full" | "unavailable";
  owner?: PersonRef;
  relation?: "self" | "none" | "requested" | "request_in" | "friends";
};

/**
 * `POST /friend-links/lookup`, read as a query because it changes nothing:
 * the code is in the body only so it never sits in a logged path. Never
 * cached (`CACHE`), and not retried: a `401`, `404` or `429` is the answer.
 */
export function useLookupFriendLink(code: string | null, enabled: boolean) {
  return useQuery({
    queryKey: qk.friendLink(code ?? ""),
    enabled: enabled && code !== null,
    retry: false,
    ...CACHE.lookupFriendLink,
    queryFn: async ({ signal }): Promise<LinkLookup> => {
      const client = createProxyClient();
      const { data, error } = await client.POST("/friend-links/lookup", {
        body: { code: code ?? "" },
        signal,
      });
      if (error || !data) throw error ?? new Error("lookup had no body.");
      return data;
    },
  });
}

/**
 * Ask to be friends through a link. A `202` is always shown as "Request
 * sent", whatever happens behind it, unless it made them friends at once
 * (they had already asked this traveller).
 */
export function useRequestFriend() {
  const qc = useQueryClient();
  return useMutation({
    retry: false,
    mutationFn: async (code: string) => {
      const client = createProxyClient();
      const { data, error } = await client.POST("/me/friend-requests", {
        body: { via: "friend_link", code },
      });
      if (error || !data)
        throw error ?? new Error("POST /me/friend-requests had no body.");
      return data;
    },
    onSettled: () => refreshPeople(qc),
  });
}

/**
 * `PUT /me/age`, asked once. `birthdayPassed` only for the year that
 * straddles 18. An under-18 answer closes the account (`under_age_sign_up`):
 * the caller shows the API's sentence and signs out.
 */
export function useConfirmAge() {
  const qc = useQueryClient();
  return useMutation({
    retry: false,
    mutationFn: async (input: {
      birthYear: number;
      birthdayPassed?: boolean;
    }) => {
      const client = createProxyClient();
      const { error } = await client.PUT("/me/age", {
        body:
          input.birthdayPassed === undefined
            ? { birthYear: input.birthYear }
            : {
                birthYear: input.birthYear,
                birthdayPassed: input.birthdayPassed,
              },
      });
      if (error) throw error;
    },
    onSuccess: () => refreshPeople(qc),
  });
}
