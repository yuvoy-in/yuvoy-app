"use client";

import { useMutation } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import {
  idempotencyKeyFor,
  clearIdempotencyKey,
  type CheckoutBodyShape,
} from "./idempotency";
import { saveToken } from "./token-store";
import type { components } from "@/lib/api/schema.gen";

type Reservation = components["schemas"]["Reservation"];

/**
 * Creating a reservation.
 *
 * `retry: false` is load-bearing. TanStack would otherwise replay the mutation
 * on failure, and while the idempotency key makes that safe on the wire, an
 * automatic replay hides the failure from the traveller. Retry here is an
 * explicit tap — which reuses the same key, because the key is derived from
 * the body rather than minted per call.
 */
export function useCreateReservation() {
  return useMutation({
    retry: false,
    mutationFn: async (body: CheckoutBodyShape): Promise<Reservation> => {
      // Derived from the body, so a retry of the same attempt reuses it and a
      // materially different body gets a fresh one. Never minted per click.
      const key = idempotencyKeyFor(body);

      // The contract makes Idempotency-Key a REQUIRED header parameter, so
      // omitting it is a type error rather than a runtime 400. Good.
      const { data, error } = await api.POST("/reservations", {
        params: { header: { "Idempotency-Key": key } },
        body,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: async (reservation, body) => {
      // The token comes back exactly once. Persist it before anything else can
      // fail — losing it means the traveller loses their booking.
      if (reservation.statusToken) {
        await saveToken(reservation.reservationId, reservation.statusToken);
      }
      clearIdempotencyKey(body.slotId);
    },
  });
}
