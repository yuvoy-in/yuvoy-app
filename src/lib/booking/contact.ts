import type { components } from "@/lib/api/schema.gen";

/**
 * The `contact` object on `POST /reservations`.
 *
 * `name` and `whatsapp` stopped being `required` in the contract on
 * 2026-09-13 (yuvoy-api#183): a signed-in checkout may leave both out, and
 * `whatsapp` is IGNORED rather than merely optional, because the session's
 * number is the number. A guest must still send both and is refused with a
 * `400` naming the field when they do not.
 *
 * Aliased here so the two forms and the shared contact block agree on one
 * type rather than each reaching into the generated schema and drifting.
 */
export type ReservationContactInput =
  components["schemas"]["ReservationContact"];
