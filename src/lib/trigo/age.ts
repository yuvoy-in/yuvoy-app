"use client";

import {
  useMutation,
  useQueryClient,
  type UseMutationResult,
} from "@tanstack/react-query";
import { createProxyClient } from "@/lib/api/client";
import { YuvoyError } from "@/lib/api/errors";
import { qk } from "@/lib/query/policy";
import { isSignedOut } from "./failures";

/**
 * The age line Trigo shows on `403 adult_confirmation_required`. Moved out of
 * `./api` word for word (yuvoy-app#243), which still exports these names, so
 * imports from `./api` keep working.
 */

export interface ConfirmAgeVars {
  birthYear: number;
  birthdayPassed?: boolean;
}

/**
 * `PUT /me/age` (confirmMyAge), for the age line Trigo shows on
 * `403 adult_confirmation_required`. The web has no age form of its own yet,
 * so the chat carries a small one. On a 200 the session and the account are
 * read again (the account's `ageConfirmed` turns true), and the screen sends
 * the turn again with its same key.
 *
 * An under-18 answer closes the account and ends its sessions, so
 * `403 under_age_sign_up` reads the session again too, and the screen falls
 * to signed out after showing the API's sentence.
 */
export function useConfirmAge(): UseMutationResult<
  void,
  unknown,
  ConfirmAgeVars
> {
  const qc = useQueryClient();
  return useMutation({
    retry: false,
    mutationFn: async ({ birthYear, birthdayPassed }: ConfirmAgeVars) => {
      const client = createProxyClient();
      const { error } = await client.PUT("/me/age", {
        body:
          birthdayPassed === undefined
            ? { birthYear }
            : { birthYear, birthdayPassed },
      });
      if (error) throw error;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.session() });
      void qc.invalidateQueries({ queryKey: qk.myAccount() });
    },
    onError: (error) => {
      if (
        isSignedOut(error) ||
        (error instanceof YuvoyError &&
          error.status === 403 &&
          error.code === "under_age_sign_up")
      ) {
        void qc.invalidateQueries({ queryKey: qk.session() });
      }
    },
  });
}

export type AgeFailure =
  | { kind: "need_birthday" } // 400 invalid_input with details.birthdayPassed: ask the question
  | { kind: "under_age"; message: string } // 403 under_age_sign_up: the account is closed
  | { kind: "locked"; message: string } // 409 age_locked: only the team can change it
  | { kind: "signed_out" } // 401
  | { kind: "failure" };

/** Which state a failed `PUT /me/age` puts the form in, by status and code only. */
export function classifyAgeError(error: unknown): AgeFailure {
  if (!(error instanceof YuvoyError)) return { kind: "failure" };
  const { status, code } = error;
  if (status === 401) return { kind: "signed_out" };
  if (
    status === 400 &&
    code === "invalid_input" &&
    "birthdayPassed" in error.details
  ) {
    return { kind: "need_birthday" };
  }
  if (status === 403 && code === "under_age_sign_up") {
    return { kind: "under_age", message: error.message };
  }
  if (status === 409 && code === "age_locked") {
    return { kind: "locked", message: error.message };
  }
  return { kind: "failure" };
}
