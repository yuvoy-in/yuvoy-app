"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createProxyClient } from "@/lib/api/client";
import { qk } from "@/lib/query/policy";
import { formatInviteCode } from "./invite-code";
import type { TravellerAccount } from "./use-my-account";

/**
 * Redeeming an invite code, `POST /me/invite-codes/redeem`, through the proxy
 * (yuvoy-api#195).
 *
 * Signed in only: the code admits the number the session proved, and
 * redeeming never creates a session. Both 200 shapes mean the same thing to a
 * screen, that this number is in; `alreadyAdmitted` adds that the code was
 * NOT used up and can go to somebody else, which is worth saying.
 *
 * ## Never retried
 *
 * `retry: false`, and the client under it never replays a POST. Redeeming is
 * throttled to ten attempts an hour per number, so an automatic retry would
 * spend the traveller's attempts on their behalf and could turn one wrong
 * code into a `429`.
 *
 * ## The answer goes straight into the account
 *
 * `admitted: true` is written into the cached `GET /me` the moment the API
 * says so, the way `useUpdateMyAccount` writes its answer, so every screen
 * that asks moves on at once rather than after a refetch; the entry is then
 * invalidated so the next read is the API's own. A page the server rendered
 * as the gate sees the change and asks the server again (`GatedPage`), which
 * is what puts the page the traveller asked for on screen, in place.
 */
export interface RedeemAnswer {
  admitted: true;
  /** Present when the number was admitted before; the code was left unused. */
  alreadyAdmitted?: true;
}

export function useRedeemInviteCode() {
  const qc = useQueryClient();
  return useMutation({
    retry: false,
    mutationFn: async (code: string): Promise<RedeemAnswer> => {
      const client = createProxyClient();
      const { data, error } = await client.POST("/me/invite-codes/redeem", {
        body: { code: formatInviteCode(code) },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.setQueryData<TravellerAccount>(qk.myAccount(), (account) =>
        account ? { ...account, admitted: true } : account,
      );
      void qc.invalidateQueries({ queryKey: qk.myAccount() });
    },
  });
}
