"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchWithin } from "@/lib/api/deadline";
import { WRITE_STALL_MS } from "@/lib/api/client";
import { qk } from "@/lib/query/policy";
import { asYuvoyError, type SignInWayIn } from "@/lib/auth/use-traveller";
import { myAccountQuery } from "@/lib/auth/use-my-account";

/**
 * Ways in (yuvoy-app#229, the web half of yuvoy-mobile#340; MD-110): the email
 * and the number an account signs in with, each with a code, and adding the
 * kind it lacks. One of each kind per account, so a way in is never changed or
 * taken off here.
 *
 * What `GET /me` says: `phone` is the number the account signs in with, or
 * null for an account the email door opened; `emailProven` is true exactly
 * when it signs in with an email, and `provenEmail` is that address, or null.
 * It is not the profile's `email`, the contact address, which can differ.
 *
 * Adding is the sign-in's own request (straight to the API, no session) and
 * then `POST /api/session/link`, which sends the verify with the cookie as
 * the bearer. While the email door is shut every verify that carries a
 * session is refused (`503`), the number's too, so nothing is offered then.
 * The words are the mobile app's, so the two say the same thing.
 */

export type WayKind = "email" | "phone";

export interface WaysIn {
  /** The account signs in with an email (`emailProven`). */
  email: boolean;
  /** That address (`provenEmail`), or null when `/me` does not name it. */
  emailAddress: string | null;
  /** The number it signs in with, or null. */
  phone: string | null;
}

/** An account's ways in, from `GET /me`. A field left out counts as not there. */
export function waysIn(account: {
  phone?: string | null;
  emailProven?: boolean;
  provenEmail?: string | null;
}): WaysIn {
  const email = account.emailProven === true;
  const address =
    typeof account.provenEmail === "string" ? account.provenEmail.trim() : "";
  return {
    email,
    emailAddress: email && address ? address : null,
    phone: account.phone ?? null,
  };
}

export function hasWay(ways: WaysIn, kind: WayKind): boolean {
  return kind === "email" ? ways.email : ways.phone !== null;
}

/** Whether `kind` can be added: the email door is open and none is there. */
export function canAddWay(
  ways: WaysIn,
  kind: WayKind,
  emailDoorOpen: boolean,
): boolean {
  return emailDoorOpen && !hasWay(ways, kind);
}

/**
 * Whether Account shows Ways in: while something can be added, or once the
 * account has an email. A number-only account with the door shut would find
 * only the number "Signed in as" already names.
 */
export function showsWaysIn(ways: WaysIn, emailDoorOpen: boolean): boolean {
  return emailDoorOpen || ways.email;
}

export const WAYS_IN_WORDS = {
  title: "Ways in",
  foot: "Each one signs in to this same account, with a code.",
  email: "Email",
  number: "Number",
  /** The email row's line when `/me` does not name the address. */
  emailAdded: "Added",
  addEmail: "Add an email",
  addNumber: "Add a number",
} as const;

export const ADD_WAY_WORDS = {
  title: { email: "Add an email", phone: "Add a number" },
  sentence: "We send it a code first, to check it is yours.",
  emailLabel: "Email",
  codeLabel: "Code",
  submit: { email: "Add this email", phone: "Add this number" },
  added: "Added. You can sign in with it from now on.",
  cancel: "Not now",
} as const;

/**
 * The verify, with this browser's session riding on it. Resolves only on
 * `201 { linked: true }`; everything else throws the API's refusal as the
 * typed error, or the stall.
 */
export function useAddWay() {
  const qc = useQueryClient();
  return useMutation({
    retry: false,
    gcTime: 0,
    mutationFn: async (input: SignInWayIn & { code: string }) => {
      const response = await fetchWithin(
        "/api/session/link",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...("email" in input
              ? { email: input.email.trim() }
              : { phone: input.phone.trim() }),
            code: input.code.trim(),
          }),
        },
        WRITE_STALL_MS,
      );
      if (!response.ok) throw await asYuvoyError(response);
      const body = (await response.json().catch(() => null)) as {
        linked?: unknown;
      } | null;
      if (response.status !== 201 || body?.linked !== true) {
        throw new Error("ways in: the answer added nothing");
      }
    },
    // Its trips, saves and invitations follow the one account now.
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.myAccount() });
      void qc.invalidateQueries({ queryKey: [qk.myBookings()[0]] });
      void qc.invalidateQueries({ queryKey: qk.invitedTrips() });
      void qc.invalidateQueries({ queryKey: qk.savedList("account") });
      void qc.invalidateQueries({ queryKey: qk.savedIds("account") });
    },
  });
}

/**
 * After a verify whose answer never came: whether `GET /me`, asked fresh, now
 * holds the way in, in which case it was added. False when it does not, or
 * could not be asked.
 */
export function useAddedAfterAll() {
  const qc = useQueryClient();
  return async (kind: WayKind): Promise<boolean> => {
    try {
      // A read already out left before the verify did, so it proves nothing.
      await qc.cancelQueries({ queryKey: qk.myAccount() });
      const me = await qc.fetchQuery({ ...myAccountQuery, staleTime: 0 });
      return hasWay(waysIn(me), kind);
    } catch {
      return false;
    }
  };
}
