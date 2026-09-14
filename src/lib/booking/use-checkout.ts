"use client";

import { useMutation } from "@tanstack/react-query";
import { api, createProxyClient } from "@/lib/api/client";
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
    mutationFn: async ({
      authenticated = false,
      ...body
    }: CheckoutBodyShape & {
      /**
       * Send the traveller's session with it (yuvoy-app#32).
       *
       * A guest books through the SAME endpoint, unauthenticated, and that is
       * the majority path: this product's whole shape is that booking needs no
       * account. So the choice is per call rather than a client-wide switch.
       *
       * Signed in, the call goes through this app's own server, which attaches
       * the HttpOnly cookie (#57). The API then ignores `contact.whatsapp` and
       * fills `contact.name` from the profile, which is why the body leaves
       * them out rather than sending them empty.
       */
      authenticated?: boolean;
    }): Promise<Reservation> => {
      // Derived from the body, so a retry of the same attempt reuses it and a
      // materially different body gets a fresh one. Never minted per click.
      const key = idempotencyKeyFor(body);

      /*
        `authenticated` is deliberately NOT part of the fingerprint. It is how
        the request is sent, not what is being asked for, so a traveller whose
        session lapses mid-form and resends as a guest must reuse the same key:
        a fresh one would let the same booking through twice.
      */
      const client = authenticated ? createProxyClient() : api;

      // The contract makes Idempotency-Key a REQUIRED header parameter, so
      // omitting it is a type error rather than a runtime 400. Good.
      const { data, error } = await client.POST("/reservations", {
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
