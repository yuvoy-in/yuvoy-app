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
 * Except a session with no proven number (signed in by email, yuvoy-api#304):
 * the API reads `whatsapp` from it as from a guest, and refuses a missing or
 * bad one with `400` naming `contact.whatsapp`. The contract text still says
 * "ignored when signed in"; the handler is the truth (yuvoy-app#229).
 *
 * Aliased here so the two forms and the shared contact block agree on one
 * type rather than each reaching into the generated schema and drifting.
 */
export type ReservationContactInput =
  components["schemas"]["ReservationContact"];
