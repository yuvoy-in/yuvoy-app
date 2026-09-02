"use client";

import { useMutation } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import {
  idempotencyKeyFor,
  clearIdempotencyKey,
  type CheckoutBodyShape,
} from "./idempotency";
import { rememberBooking } from "./token-store";
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
    onSuccess: (reservation, body) => {
      /*
        The token comes back exactly once, so it is kept on the device — but
        NOT awaited, and it cannot throw. TanStack treats a rejection from
        `onSuccess` as the mutation failing, and this used to `await` a bare
        IndexedDB write: on a browser that refuses the database (Safari's
        private mode defines it and then will not open it) a reservation that
        the server had created and was holding seats for rendered as
        "Something went wrong", and the redirect to the booking page — whose
        URL fragment carries the very same token — never happened. If the
        open HUNG, the button said "Holding your seats…" forever.

        The fragment URL is the booking's canonical home and the server holds
        the booking; the store is the Trips tab's convenience. It is written
        best-effort, alongside the navigation rather than in front of it.
      */
      if (reservation.statusToken) {
        void rememberBooking({
          reservationId: reservation.reservationId,
          token: reservation.statusToken,
        });
      }
      clearIdempotencyKey(body.slotId);
    },
  });
}
