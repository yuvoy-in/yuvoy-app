"use client";

import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { createApiClient, createProxyClient } from "@/lib/api/client";
import { CACHE, qk } from "@/lib/query/policy";

/**
 * Reading help requests back (yuvoy-api#196).
 *
 * Until this existed the whole support surface of the API was one write: a
 * traveller sent a message, got a reference, and had nowhere to type it. Two
 * reads now, with different credentials, and the difference is the design:
 *
 *   - **The list is signed in only.** "A booking link's status token proves
 *     one booking, not the number on it, so it cannot list." It goes through
 *     this app's proxy, which holds the session in an HttpOnly cookie.
 *   - **One request by reference takes either.** The booking page holds a
 *     status token and no session, which is how a guest who booked without
 *     signing in can look up the reference they were given. That call goes to
 *     the API directly bearing the token, the same way that page sends.
 */

/**
 * Twenty, sent explicitly for the reason `TRIPS_PAGE_SIZE` gives: a default
 * that moves upstream would silently change how much arrives at once.
 */
export const SUPPORT_PAGE_SIZE = 20;

/**
 * This number's help requests, newest first, paged.
 *
 * Disabled until the session answers `true`, so a signed-out visitor to the
 * Help Center, which is public and indexable, costs no request at all.
 *
 * `retry: false` because every failure here has a sentence of its own on the
 * screen, and the two that matter most do not improve with retrying: a `401`
 * (signed out) and a `405` (an API that predates the read, see
 * `isMissingReadSide`). The client wrapper still retries a transient GET.
 */
export function useSupportRequests(signedIn: boolean | undefined) {
  return useInfiniteQuery({
    queryKey: qk.supportRequests(),
    enabled: signedIn === true,
    retry: false,
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam, signal }) => {
      const client = createProxyClient();
      const { data, error } = await client.GET("/support/requests", {
        params: {
          query: {
            limit: SUPPORT_PAGE_SIZE,
            // Omitted on the first page: `cursor=` empty is a different
            // request from sending none.
            ...(pageParam ? { cursor: pageParam } : {}),
          },
        },
        signal,
      });
      if (error) throw error;
      return data;
    },
    /*
      "Pass `nextCursor` back unchanged as `cursor`, and stop on
      `complete: true`." `complete` first, so a complete page carrying a stale
      cursor does not fetch a page past the end.
    */
    getNextPageParam: (last) =>
      last.complete ? undefined : (last.nextCursor ?? undefined),
    /*
      The status moves when a person picks a request up, and the moment a
      traveller comes back from WhatsApp is when they look.
    */
    refetchOnWindowFocus: true,
    ...CACHE.supportRequests,
  });
}

/**
 * One help request, by the reference `createSupportRequest` returned.
 *
 * Asked on demand, never on mount: `enabled` is the traveller's tap. Right
 * after sending, the answer is always "received", and a request made before
 * anybody asked would spend a round trip on island signal to say so.
 *
 * With `token` it goes straight to the API bearing the booking's status token,
 * which "opens only the requests raised about this booking or its
 * reservation". Without one it goes through the proxy on the session.
 */
export function useSupportRequest(
  reference: string,
  options: { token?: string | null; enabled: boolean },
) {
  const token = options.token ?? null;
  return useQuery({
    queryKey: qk.supportRequest(reference, token),
    enabled: options.enabled && reference.length > 0,
    retry: false,
    staleTime: 0,
    queryFn: async ({ signal }) => {
      if (token) {
        const client = createApiClient();
        const { data, error } = await client.GET(
          "/support/requests/{reference}",
          {
            params: { path: { reference } },
            headers: { Authorization: `Bearer ${token}` },
            signal,
          },
        );
        if (error) throw error;
        return data;
      }
      const client = createProxyClient();
      const { data, error } = await client.GET(
        "/support/requests/{reference}",
        { params: { path: { reference } }, signal },
      );
      if (error) throw error;
      return data;
    },
  });
}
