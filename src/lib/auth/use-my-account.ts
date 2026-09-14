"use client";

import { useQuery } from "@tanstack/react-query";
import { createProxyClient } from "@/lib/api/client";
import { qk } from "@/lib/query/policy";
import type { components } from "@/lib/api/schema.gen";

export type TravellerAccount = components["schemas"]["TravellerAccount"];

/**
 * Who the signed-in traveller is — `GET /me`, through the proxy.
 *
 * One read for every screen that needs to stop asking a signed-in traveller
 * who they are (yuvoy-app#32, #38). It carries `name`, `phone`, `email`, the
 * trip counts, the support number and, under a traveller session,
 * `session.expiresAt`.
 *
 * ## `name` is nullable and that is a real branch, not a defensive one
 *
 * A number that has signed in but never completed the first-sign-in screen
 * has `name: null` and `onboardingRequired: true`. That is the common state
 * for somebody who signed in to look at their trips, so a form has to ask for
 * a name and cannot ask for a number it already has.
 *
 * ## Not fetched at all when signed out
 *
 * `enabled` rather than a call that 401s. A guest checkout is the majority
 * path on this product and putting a refused request in front of it costs a
 * round trip on a 0.5 Mbps island connection for an answer already known.
 */
export function useMyAccount(signedIn: boolean | undefined) {
  return useQuery({
    queryKey: qk.myAccount(),
    enabled: signedIn === true,
    retry: false,
    /*
      A profile does not change while a form is open, and both forms that read
      it are opened repeatedly on one page. Without this, every open of the Ask
      sheet is a fresh request before the fields can be drawn.
    */
    staleTime: 60_000,
    queryFn: async ({ signal }) => {
      const client = createProxyClient();
      const { data, error } = await client.GET("/me", { signal });
      if (error) throw error;
      return data;
    },
  });
}
