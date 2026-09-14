"use client";

import { useCallback } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, createProxyClient } from "@/lib/api/client";
import { qk } from "@/lib/query/policy";
import { isDeadToken, YuvoyError, isErrorEnvelope } from "@/lib/api/errors";

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

async function readSession(signal?: AbortSignal): Promise<SessionAnswer> {
  const response = await fetch("/api/session", {
    signal,
    headers: { Accept: "application/json" },
  });
  if (!response.ok) return { signedIn: false };
  const body = (await response.json()) as Partial<SessionAnswer>;
  return { signedIn: Boolean(body?.signedIn) };
}

export function useTravellerSession() {
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: qk.session(),
    queryFn: ({ signal }) => readSession(signal),
    retry: false,
    /*
      The cookie can be cleared by the server underneath us: a revoked session
      answers 401 through the proxy and the route drops it. Refetching when
      the tab comes back is what turns that into a Login button rather than a
      screen that keeps failing.
    */
    refetchOnWindowFocus: true,
    staleTime: 60_000,
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
  const signIn = useCallback(async () => {
    qc.removeQueries({ queryKey: qk.myBookings() });
    await qc.invalidateQueries({ queryKey: qk.session() });
  }, [qc]);

  /**
   * Sign out.
   *
   * The route tells the API and then clears the cookie, and never lets the
   * API's answer decide whether the device forgets. A traveller who taps sign
   * out on a jetty with no signal must still be signed out on the phone in
   * front of them; the session lapses on its own within fourteen days either
   * way.
   */
  const signOut = useCallback(async () => {
    try {
      await fetch("/api/session", { method: "DELETE" });
    } catch {
      // Deliberately ignored. See above.
    }
    qc.removeQueries({ queryKey: qk.myBookings() });
    qc.setQueryData(qk.session(), { signedIn: false });
    await qc.invalidateQueries({ queryKey: qk.session() });
  }, [qc]);

  return { signedIn, signIn, signOut, isLoading: query.isPending };
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
export function useMyBookings(signedIn: boolean | undefined) {
  return useQuery({
    queryKey: qk.myBookings(),
    enabled: signedIn === true,
    retry: false,
    queryFn: async ({ signal }) => {
      const client = createProxyClient();
      const { data, error } = await client.GET("/me/bookings", { signal });
      if (error) throw error;
      return data;
    },
  });
}

/** Whether a failure means the session is finished rather than the network. */
export { isDeadToken };
