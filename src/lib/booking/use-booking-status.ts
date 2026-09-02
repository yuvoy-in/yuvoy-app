"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { createApiClient } from "@/lib/api/client";
import { NetworkError, isDeadToken } from "@/lib/api/errors";
import { qk } from "@/lib/query/policy";
import { pollIntervalMs, POLL_CEILING_MS } from "./poll";
import {
  findByToken,
  getSnapshot,
  markTokenDead,
  rememberBooking,
  saveSnapshot,
  type BookingSnapshot,
} from "./token-store";
import type { components } from "@/lib/api/schema.gen";

type BookingStatus = components["schemas"]["BookingStatus"];

/**
 * The booking screen's data, and the recovery path for the riskiest moment in
 * the product.
 *
 * Confirmation arrives from the payment provider TO US, never to the browser.
 * So the browser polls and reports what is true — and the two behaviours that
 * make that bearable are here:
 *
 *   - Polling PAUSES while the tab is hidden and refetches the instant it is
 *     visible again. A traveller in their UPI app for two minutes should not
 *     burn forty requests, and should see the truth the moment they return.
 *   - It stops at a ceiling and hands over to a human rather than spinning
 *     forever. Somebody who has been debited and is watching a spinner assumes
 *     the worst.
 */
export function useBookingStatus(token: string | null) {
  // Lazy state rather than `useRef(Date.now())`: reading the clock during
  // render is impure, and the React compiler is right to refuse it. A lazy
  // initialiser runs once, outside the render path.
  const [startedAt] = useState(() => Date.now());
  const [gaveUp, setGaveUp] = useState(false);
  const [snapshot, setSnapshot] = useState<BookingSnapshot | null>(null);

  const query = useQuery({
    queryKey: qk.bookingStatus(token ?? ""),
    enabled: Boolean(token),
    // The token authenticates the request, so a client is built per call
    // rather than mutating shared state.
    queryFn: async ({ signal }) => {
      const client = createApiClient();
      const { data, error } = await client.GET("/bookings/status", {
        headers: { Authorization: `Bearer ${token}` },
        signal,
      });
      if (error) throw error;
      return data as BookingStatus;
    },
    // `final` is told by the server. Never hard-code which states are terminal.
    refetchInterval: (q) => {
      const status = q.state.data;
      if (status?.final) return false;
      if (Date.now() - startedAt > POLL_CEILING_MS) return false;
      return pollIntervalMs(q.state.dataUpdateCount);
    },
    // THIS LINE is the UPI return path.
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    staleTime: 0,
    gcTime: Infinity,
    retry: false,
  });

  // Give up loudly rather than quietly spinning.
  //
  // Always through a timer, never a synchronous setState in the effect body —
  // even when the ceiling has already passed. A sync setState here cascades a
  // second render on every mount of an already-timed-out booking.
  useEffect(() => {
    if (query.data?.final) return;
    const remaining = Math.max(0, POLL_CEILING_MS - (Date.now() - startedAt));
    const t = setTimeout(() => setGaveUp(true), remaining);
    return () => clearTimeout(t);
  }, [query.data?.final, startedAt]);

  /*
    Every successful fetch is the moment this device learns the most about the
    booking, so it is the moment the store is brought up to date:

      - the token that just worked is kept under the booking's key — which
        re-keys a checkout-time record from reservation id to reference the
        first time the reference is seen, and OVERWRITES a revoked token with
        the fresh one a recovery just minted, so the Trips card opens again;
      - and T9's offline guarantee: the whole payload is kept, so the screen
        that "has to work even if WhatsApp, email and signal all fail" does.
        A hold that was never paid has nothing to keep offline, so snapshots
        wait for a reference.
  */
  useEffect(() => {
    const status = query.data;
    if (!status || !token) return;
    void rememberBooking({
      reservationId: status.reservationId,
      reference: status.bookingReference ?? undefined,
      token,
    });
    if (status.bookingReference) {
      void saveSnapshot(status.bookingReference, status);
    }
  }, [query.data, token]);

  /*
    On a cold, offline load there is nothing to fetch — fall back to what we
    kept, clearly stamped rather than presented as live. Only when the network
    genuinely did not answer: a 401 while online is a dead link, and showing a
    saved booking under "you are offline" would diagnose the wrong thing and
    hide the one action that helps. And only THIS booking's snapshot — the
    first one found on the device was, for a while, somebody's other trip.
  */
  useEffect(() => {
    if (query.data || !query.isError) return;
    if (!(query.error instanceof NetworkError) || !token) return;
    let cancelled = false;
    void (async () => {
      const record = await findByToken(token);
      const snap = record ? await getSnapshot(record.key) : null;
      if (snap && !cancelled) setSnapshot(snap);
    })();
    return () => {
      cancelled = true;
    };
  }, [query.data, query.isError, query.error, token]);

  // A link the server has finished with is flagged on the device, so the
  // Trips tab can say so and offer a new one instead of a dead tap.
  useEffect(() => {
    if (!query.isError || !token) return;
    if (isDeadToken(query.error)) void markTokenDead(token);
  }, [query.isError, query.error, token]);

  return {
    ...query,
    /** True once we have stopped polling without a settled outcome. */
    gaveUp: gaveUp && !query.data?.final,
    /** Last known payload, when the network cannot be reached at all. */
    snapshot,
  };
}
