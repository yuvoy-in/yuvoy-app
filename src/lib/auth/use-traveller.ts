"use client";

import { useCallback } from "react";
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import { api, createProxyClient } from "@/lib/api/client";
import { qk } from "@/lib/query/policy";
import { isDeadToken, YuvoyError, isErrorEnvelope } from "@/lib/api/errors";
import { anyUnread, type TripTab } from "@/lib/trips/tabs";
import { forgetAllBookings } from "@/lib/booking/token-store";
import { resetSavedSession } from "@/lib/feed/account-saved";

/**
 * Twenty, the API's own default once paging is opted into.
 *
 * Sent explicitly rather than relied on: a default that moves upstream would
 * silently change how much of somebody's history arrives in one page.
 */
export const TRIPS_PAGE_SIZE = 20;

/**
 * Whether this device is signed in — yuvoy-app#34, rehoused by #57.
 *
 * ## The token is not here any more
 *
 * It used to be a string this hook read out of IndexedDB and handed to every
 * caller, which then set an `Authorization` header. Safari on iPhone deletes
 * script-written storage after seven days without a visit, so travellers were
 * signed out roughly weekly while the server thought they were fine: on
 * 14 September the owner's number had twelve live sessions from twenty-one
 * hours, none revoked.
 *
 * The token now lives in an HttpOnly cookie that this app's own server sets,
 * and nothing in the browser can read it. So this hook answers a BOOLEAN. A
 * caller that wants an authenticated call makes it through `/api/v1/...` and
 * the cookie rides along on its own.
 *
 * `undefined` while the answer is in flight, which is a third state and not a
 * nicety: `false` renders the sign-in form and the Login button, and flashing
 * either at somebody who IS signed in, on every mount, is worse than a
 * skeleton.
 */

interface SessionAnswer {
  signedIn: boolean;
}

/**
 * Saves, on both sides of a change of who is signed in (yuvoy-api#192).
 *
 * REMOVED rather than invalidated, for the reason `refresh` gives below: the
 * account's set belongs to a number, and an invalidated entry would paint the
 * previous number's saves while the refetch ran. The device's set goes too,
 * because signing in moves it onto the account underneath its cache.
 */
/**
 * Help requests, on both sides of a change of who is signed in
 * (yuvoy-api#196).
 *
 * REMOVED rather than invalidated, for the reason `refresh` gives: they belong
 * to a number, and an invalidated list would show the previous number's
 * messages to us, in their own words, while the refetch ran.
 */
function forgetSupportRequests(qc: QueryClient): void {
  qc.removeQueries({ queryKey: qk.supportRequests() });
  qc.removeQueries({ queryKey: ["getSupportRequest"] });
}

function forgetSaved(qc: QueryClient): void {
  /*
    First, so nothing started for the previous number (an adoption, a queued
    write) reaches the next one's account or cache. See `resetSavedSession`.
  */
  resetSavedSession();
  qc.removeQueries({ queryKey: qk.savedIds("account") });
  qc.removeQueries({ queryKey: qk.savedList("account") });
  qc.removeQueries({ queryKey: qk.savedIds("device") });
  qc.removeQueries({ queryKey: qk.savedList("device") });
}

async function readSession(signal?: AbortSignal): Promise<SessionAnswer> {
  const response = await fetch("/api/session", {
    signal,
    headers: { Accept: "application/json" },
  });
  if (!response.ok) return { signedIn: false };
  const body = (await response.json()) as Partial<SessionAnswer>;
  return { signedIn: Boolean(body?.signedIn) };
}

/**
 * The session read, as one definition.
 *
 * Shared with `ensureStanding` (`use-access.ts`), which has to ask the same
 * question from inside a tap, before any component has rendered the answer.
 * One key, one function and one freshness, so the two can never be two
 * different reads of the same cookie.
 */
export const sessionQuery = {
  queryKey: qk.session(),
  queryFn: ({ signal }: { signal?: AbortSignal }) => readSession(signal),
  staleTime: 60_000,
};

export function useTravellerSession() {
  const qc = useQueryClient();

  const query = useQuery({
    ...sessionQuery,
    retry: false,
    /*
      The cookie can be cleared by the server underneath us: a revoked session
      answers 401 through the proxy and the route drops it. Refetching when
      the tab comes back is what turns that into a Login button rather than a
      screen that keeps failing.
    */
    refetchOnWindowFocus: true,
  });

  /*
    A failed read is signed OUT, not unknown. The alternative is a screen stuck
    on a skeleton for anybody whose first request missed, and the honest
    fallback for "we could not tell" is the branch that offers a way in.
  */
  const signedIn = query.isPending ? undefined : Boolean(query.data?.signedIn);

  /**
   * After a successful `POST /api/session`.
   *
   * `removeQueries` rather than `invalidateQueries` on the trips list. The key
   * can no longer carry the session token, so an invalidated entry would paint
   * the PREVIOUS number's trips while the refetch ran. On a shared phone that
   * is somebody else's booking on screen, which is the failure the old
   * token-keyed cache existed to prevent.
   */
  const refresh = useCallback(async () => {
    qc.removeQueries({ queryKey: ["listMyBookings"] });
    qc.removeQueries({ queryKey: qk.myAccount() });
    qc.removeQueries({ queryKey: ["listInvitedTrips"] });
    forgetSaved(qc);
    forgetSupportRequests(qc);
    await qc.invalidateQueries({ queryKey: qk.session() });
  }, [qc]);

  /*
    The same work, under the name a caller means.

    `signIn` is called after `POST /api/session` succeeds. `refresh` is called
    after any proxied call answers `401`: the route has already dropped the
    cookie by then, so the cached "signed in" is stale and a form still showing
    "Booking as Asha" is about to fail again. Both cases are "the server knows
    something this cache does not", which is why they are one function.
  */
  const signIn = refresh;

  /**
   * Sign out.
   *
   * The route tells the API and then clears the cookie, and never lets the
   * API's answer decide whether the device forgets. A traveller who taps sign
   * out on a jetty with no signal must still be signed out on the phone in
   * front of them; the session lapses on its own within fourteen days either
   * way.
   *
   * ## The device's own bookings go too (yuvoy-app#60, item 3)
   *
   * Signing out used to clear the session and leave every saved booking behind,
   * so Trips went on listing them. The owner reported that as a bug on 14
   * September, and the visible half is the smaller half: a status token is a
   * bearer credential that both opens a booking and can cancel it, so leaving
   * one on the phone is the same shape as leaving a session cookie behind.
   *
   * `forgetAllBookings` is awaited before the cache is touched. The store is
   * the durable copy, so if only one of the two can be cleared it has to be
   * that one; a cleared cache over a full store comes straight back on reload,
   * which is precisely the state the owner saw.
   */
  const signOut = useCallback(async () => {
    try {
      await fetch("/api/session", { method: "DELETE" });
    } catch {
      // Deliberately ignored. See above.
    }
    /*
      Resolves even when IndexedDB is missing or refuses, in step with the rest
      of the store, so a private window cannot leave somebody signed in.
    */
    await forgetAllBookings();
    qc.removeQueries({ queryKey: ["listMyBookings"] });
    qc.removeQueries({ queryKey: qk.myAccount() });
    qc.removeQueries({ queryKey: ["listInvitedTrips"] });
    forgetSaved(qc);
    forgetSupportRequests(qc);
    qc.setQueryData(qk.session(), { signedIn: false });
    await qc.invalidateQueries({ queryKey: qk.session() });
  }, [qc]);

  return { signedIn, signIn, signOut, refresh, isLoading: query.isPending };
}

/**
 * Asking for a sign-in code.
 *
 * Still goes straight to the API. It is unauthenticated, it mints nothing, and
 * routing it through this app's server would add a hop for no gain. Only
 * VERIFY moves, because verify is what produces the credential.
 */
export function useRequestSignInCode() {
  return useMutation({
    retry: false,
    mutationFn: async (phone: string) => {
      const { data, error } = await api.POST("/me/sign-in/request", {
        body: { phone: phone.trim() },
      });
      if (error) throw error;
      return data;
    },
  });
}

/**
 * Exchanging the code for a session, through this app's own server.
 *
 * `POST /api/session` calls `POST /me/sign-in/verify` server-side and puts the
 * token straight into an HttpOnly cookie. It answers `{ signedIn: true }` and
 * never the token, so there is no moment at which the credential exists in a
 * place script can reach.
 *
 * The route passes the API's status and error envelope through unchanged, so
 * the failure is re-thrown here as the same `YuvoyError` the form has always
 * branched on. Without that, every sentence in `signInFailure` would have to
 * be re-derived from a status code.
 */
export function useVerifySignInCode() {
  return useMutation({
    retry: false,
    mutationFn: async (input: { phone: string; code: string }) => {
      const response = await fetch("/api/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone: input.phone.trim(),
          code: input.code.trim(),
        }),
      });

      if (!response.ok) throw await asYuvoyError(response);
      return (await response.json()) as { signedIn: boolean };
    },
  });
}

/** The envelope the route passed through, back into the typed error. */
async function asYuvoyError(response: Response): Promise<YuvoyError> {
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    // Fall through to the generic below.
  }
  if (isErrorEnvelope(body)) {
    return new YuvoyError({
      code: body.error.code,
      message: body.error.message,
      status: response.status,
      details: body.error.details,
      requestId:
        body.error.requestId ??
        response.headers.get("x-request-id") ??
        undefined,
    });
  }
  return new YuvoyError({
    code: "internal_error",
    message: `The server answered ${response.status}.`,
    status: response.status,
    requestId: response.headers.get("x-request-id") ?? undefined,
  });
}

/**
 * Every trip on this number — `GET /me/bookings`, through the proxy.
 *
 * ## Three things arrived here with yuvoy-api#172
 *
 *   - **Requests still waiting on the operator** are listed, with
 *     `state: pending_request` and an EMPTY `reference`. Anything keyed by
 *     reference therefore has to key by `reservationId` instead, which is
 *     always present.
 *   - **A declined request stays**, with `reasonCode` saying why (api#175).
 *   - **Every row carries a `statusToken`**, minted for that response, so a
 *     trip booked on another phone opens here. It opens that booking only and
 *     "issuing it revokes nothing" — which is the difference from recovery and
 *     the reason merging the two lists is safe at all.
 *
 * No `Authorization` header and no token argument: the cookie authenticates
 * this, and the browser never sees it (#57).
 */
export function useMyBookings(
  signedIn: boolean | undefined,
  options: { tab?: TripTab; from?: string; to?: string } = {},
) {
  const { tab, from, to } = options;
  return useInfiniteQuery({
    queryKey: qk.myBookings(tab, from, to),
    enabled: signedIn === true,
    retry: false,
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam, signal }) => {
      const client = createProxyClient();
      const { data, error } = await client.GET("/me/bookings", {
        params: {
          query: {
            /*
              Any one of these opts the endpoint into paging, and `limit` then
              defaults to 20. Sent explicitly so the page size is this app's
              decision rather than a default that could move.
            */
            ...(tab ? { tab } : {}),
            ...(from ? { from } : {}),
            ...(to ? { to } : {}),
            limit: TRIPS_PAGE_SIZE,
            // Omitted entirely on the first page: `cursor=` empty is a
            // different request from sending none.
            ...(pageParam ? { cursor: pageParam } : {}),
          },
        },
        signal,
      });
      if (error) throw error;
      return data;
    },
    /*
      `nextCursor` is `null` when there is nothing more, and ALWAYS null on an
      unpaged request. Reading it as the only signal is therefore correct here
      and would not have been before paging existed.
    */
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  });
}

/**
 * Whether a trip has a reply the traveller has not read, for the dot on the
 * Trips destination (yuvoy-api#207).
 *
 * ## It reads the Trips tab's own first answer, not a second list
 *
 * The nav asks for exactly what Trips opens on: `?tab=upcoming`, first page,
 * the same query key. So on `/trips` the two share one request and one cache
 * entry and cannot disagree, and a count cleared by reading a thread clears
 * both at once (`MessageThread` invalidates `listMyBookings` after a mark).
 *
 * The alternatives were worse on the axis the API itself names. An unpaged
 * `GET /me/bookings` is the whole history, and every row of every answer
 * mints a fresh booking link; asking for it on every page to light one dot
 * would mint the most links for the least information. A reply on a past or
 * cancelled trip still shows, as a line on that trip's row; it just does not
 * light the dot, which is a narrower claim rather than a false one.
 *
 * ## Nothing is asked of a signed-out visitor
 *
 * `useMyBookings` is disabled until the session answers `true`, so a visitor
 * who is not signed in costs no request here at all, on any page. The session
 * read itself is shared with `LoginButton`, which every page already makes.
 *
 * Silent on failure by design: the Trips screen owns the error states, and a
 * dot that cannot be computed is simply not drawn.
 */
export function useUnreadTrips(): boolean {
  const { signedIn } = useTravellerSession();
  const upcoming = useMyBookings(signedIn, { tab: "upcoming" });
  if (signedIn !== true) return false;
  return anyUnread(upcoming.data?.pages.flatMap((page) => page.bookings ?? []));
}

/**
 * Trips somebody else booked and invited this number to (yuvoy-app#38).
 *
 * Not paged by the API, so not an infinite query. A guest's row carries no
 * price, no payment, no refund and no booking link, by design: the contract
 * says the booking reference, the money and anything about the person who paid
 * are "deliberately absent".
 */
export function useInvitedTrips(signedIn: boolean | undefined) {
  return useQuery({
    queryKey: qk.invitedTrips(),
    enabled: signedIn === true,
    retry: false,
    queryFn: async ({ signal }) => {
      const client = createProxyClient();
      const { data, error } = await client.GET("/me/invited-trips", { signal });
      if (error) throw error;
      return data;
    },
  });
}

/** Whether a failure means the session is finished rather than the network. */
export { isDeadToken };
