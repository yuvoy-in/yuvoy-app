"use client";

import { useCallback, useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, createApiClient } from "@/lib/api/client";
import { qk } from "@/lib/query/policy";
import { isDeadToken } from "@/lib/api/errors";
import {
  getTravellerSession,
  saveTravellerSession,
  clearTravellerSession,
} from "./traveller-session";

/**
 * Whether this device is signed in — yuvoy-app#34.
 *
 * `undefined` while the store is being read, which is a third state and not a
 * nicety: `null` renders the sign-in form, and flashing that at somebody who
 * IS signed in, on every mount, is worse than a skeleton.
 *
 * Two screens read this now (Account and Trips), so the read, the save and the
 * sign-out are here rather than duplicated. They also have to agree instantly:
 * signing in on Account must fill Trips without a reload, which is why the
 * session lives in React Query rather than in each screen's own state.
 */
export function useTravellerSession() {
  const qc = useQueryClient();
  const [token, setToken] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    void getTravellerSession().then((s) => {
      if (!cancelled) setToken(s?.sessionToken ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const signIn = useCallback(
    async (session: { sessionToken: string; expiresAt?: string | null }) => {
      await saveTravellerSession(session);
      setToken(session.sessionToken);
      // The trips list is keyed by the token, so a new one is a new entry —
      // but the OLD entry would otherwise sit in the cache holding somebody
      // else's trips on a shared phone.
      await qc.invalidateQueries({ queryKey: ["listMyBookings"] });
    },
    [qc],
  );

  const signOut = useCallback(async () => {
    const current = await getTravellerSession();
    /*
      Tell the server first, then forget locally — but never let the server's
      answer decide whether the device forgets.

      `DELETE /me/session` answers 204 whatever the token was, including one
      already ended, so a failure here means the network rather than the
      session. A traveller who taps sign out on a jetty with no signal must
      still be signed out on the device in front of them; the session expires
      on its own within thirty days either way.
    */
    if (current?.sessionToken) {
      try {
        const client = createApiClient();
        await client.DELETE("/me/session", {
          headers: { Authorization: `Bearer ${current.sessionToken}` },
        });
      } catch {
        // Deliberately ignored. See above.
      }
    }
    await clearTravellerSession();
    setToken(null);
    await qc.invalidateQueries({ queryKey: ["listMyBookings"] });
  }, [qc]);

  return { token, signIn, signOut };
}

/**
 * Asking for a sign-in code.
 *
 * `POST /me/sign-in/request` rather than `/bookings/recovery/request`, and
 * that is the whole of yuvoy-app#34's first half: recovery refuses a correct
 * code for a number that has never booked, so a first-time traveller typed the
 * right code and read "That code did not work".
 *
 * It also answers plainly — "a code was sent" — where recovery is deliberately
 * vague, because recovery's answer would reveal whether a number has booked
 * and this one has nothing to reveal.
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

/** Exchanging the code for a 30-day session that revokes nothing. */
export function useVerifySignInCode() {
  return useMutation({
    retry: false,
    mutationFn: async (input: { phone: string; code: string }) => {
      const { data, error } = await api.POST("/me/sign-in/verify", {
        body: { phone: input.phone.trim(), code: input.code.trim() },
      });
      if (error) throw error;
      return data;
    },
  });
}

/**
 * Every trip on this number — `GET /me/bookings`.
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
 * Keyed by the token so two numbers on one phone cannot read each other's
 * trips out of the cache.
 */
export function useMyBookings(token: string | null | undefined) {
  return useQuery({
    queryKey: qk.myBookings(token ?? ""),
    enabled: Boolean(token),
    retry: false,
    queryFn: async ({ signal }) => {
      const client = createApiClient();
      const { data, error } = await client.GET("/me/bookings", {
        headers: { Authorization: `Bearer ${token}` },
        signal,
      });
      if (error) throw error;
      return data;
    },
  });
}

/** Whether a failure means the session is finished rather than the network. */
export { isDeadToken };
