import { YuvoyError } from "@/lib/api/errors";
import type { WayKind } from "@/lib/auth/use-add-way";
import {
  signInFailure,
  type SignInFailure,
} from "@/components/auth/sign-in-failure";

/**
 * What went wrong adding a way in (yuvoy-app#229), in the mobile app's words
 * (`addWayFailure` in yuvoy-mobile's `packages/core/src/account/ways-in.ts`),
 * so the two apps say the same thing about the same answer.
 *
 * The add-only answers first, then the sign-in's own for the code and the
 * fields. A plain `401` is the code's: one for the session itself is told
 * apart by reading the account again, which ends the signed-in view when the
 * session is gone.
 */
export type AddWayFailure = Omit<SignInFailure, "action" | "offer"> & {
  /**
   * What the panel offers: another address or number (`change`) when this
   * one is taken, signing out when the session is too old to add to
   * (`sign-out`), or `close` when there is nothing left to try here.
   */
  action?: "change" | "close" | "sign-out";
};

/** The mobile app's `STALLED_WRITE_LEAD`. */
const STALLED_WRITE_LEAD =
  "The connection dropped, so we cannot tell whether that went through.";

export function addWayFailure(
  error: unknown,
  at: { way: WayKind; stage: "entry" | "code" },
): AddWayFailure | null {
  if (!error) return null;
  const code = error instanceof YuvoyError ? error.code : null;
  const status = error instanceof YuvoyError ? error.status : null;
  const what = at.way === "email" ? "address" : "number";

  if (status === 409 && code === "identity_taken") {
    return {
      title: `That ${what} is taken`,
      body: `That ${what} already signs in to another Yuvoy account. Nothing was changed.`,
      action: "change",
    };
  }
  if (status === 409 && code === "identity_kind_taken") {
    return {
      title: "Nothing was added",
      body: `This account already has ${at.way === "email" ? "an email" : "a number"}.`,
      action: "close",
    };
  }
  if (status === 401 && code === "fresh_sign_in_required") {
    return {
      title: "Sign in again first",
      body: "Please sign in again, then add it.",
      action: "sign-out",
    };
  }
  if (status === 503 && code === "sign_in_unavailable") {
    return {
      title: "Adding a way in is closed right now",
      body: "Nothing was changed. Try again later.",
      action: "close",
    };
  }
  /*
    The code went and no answer came back: it may have been added. The form
    reads the account again first, so this is said only when that could not
    tell.
  */
  if (at.stage === "code" && !(error instanceof YuvoyError)) {
    return {
      title: "We could not confirm that",
      body: `${STALLED_WRITE_LEAD} Ways in shows it if it was added. If it does not, try again.`,
    };
  }
  const shared = signInFailure(error, at);
  if (!shared) return null;
  // Sign-in's control and its offer of the number are not drawn here.
  const { title, body, field } = shared;
  return field === undefined ? { title, body } : { title, body, field };
}

/** A refused verify that may be the code's or the session's. */
export function isPlainUnauthorized(error: unknown): boolean {
  return (
    error instanceof YuvoyError &&
    error.status === 401 &&
    error.code !== "fresh_sign_in_required"
  );
}
