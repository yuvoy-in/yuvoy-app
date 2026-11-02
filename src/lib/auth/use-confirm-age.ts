"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createProxyClient } from "@/lib/api/client";
import { YuvoyError } from "@/lib/api/errors";
import { refreshOrganisers } from "@/lib/organisers/use-organisers";
import { qk } from "@/lib/query/policy";
import type { TravellerAccount } from "./use-my-account";

/** What `PUT /me/age` takes. */
export interface ConfirmAgeBody {
  birthYear: number;
  birthdayPassed?: boolean;
}

/**
 * `PUT /me/age` through the proxy (yuvoy-app#224): the year asked once, for
 * an account whose GET /me says `ageConfirmed: false`.
 *
 * On a confirmed answer the account entry says so at once and is read again,
 * so every screen that branches on `ageConfirmed` moves on, and every
 * organiser read is asked again (`refreshOrganisers`). A 401 reads the
 * session again. What a refusal says is `confirmAgeOutcome`'s; an under-18
 * answer (403 `under_age_sign_up`) is the step's to sign out on.
 */
export function useConfirmAge() {
  const qc = useQueryClient();
  return useMutation({
    retry: false,
    mutationFn: async (
      body: ConfirmAgeBody,
    ): Promise<{ ageConfirmed: boolean }> => {
      const client = createProxyClient();
      const { data, error } = await client.PUT("/me/age", { body });
      if (error) throw error;
      if (!data) throw new Error("PUT /me/age had no body.");
      return data;
    },
    onSuccess: (answer) => {
      if (answer.ageConfirmed) {
        qc.setQueryData<TravellerAccount>(qk.myAccount(), (account) =>
          account ? { ...account, ageConfirmed: true } : account,
        );
        refreshOrganisers(qc);
      }
      void qc.invalidateQueries({ queryKey: qk.myAccount() });
    },
    onError: (error) => {
      if (error instanceof YuvoyError && error.status === 401) {
        void qc.invalidateQueries({ queryKey: qk.session() });
      }
    },
  });
}
