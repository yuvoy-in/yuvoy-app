"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createProxyClient } from "@/lib/api/client";
import { qk } from "@/lib/query/policy";
import type { components } from "@/lib/api/schema.gen";

export type TravellerAccount = components["schemas"]["TravellerAccount"];

/**
 * The `GET /me` read, as one definition.
 *
 * Shared with `ensureStanding` (`use-access.ts`), which asks whether a number
 * is admitted from inside a tap, before any component has rendered the
 * answer. One key, one function and one freshness, so the two cannot differ.
 */
export const myAccountQuery = {
  queryKey: qk.myAccount(),
  queryFn: async ({ signal }: { signal?: AbortSignal }) => {
    const client = createProxyClient();
    const { data, error } = await client.GET("/me", { signal });
    if (error) throw error;
    return data;
  },
  /*
    A profile does not change while a form is open, and both forms that read
    it are opened repeatedly on one page. Without this, every open of the Ask
    sheet is a fresh request before the fields can be drawn.
  */
  staleTime: 60_000,
};

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
    ...myAccountQuery,
    enabled: signedIn === true,
    retry: false,
  });
}

/**
 * The tiles for the first-sign-in screen and the profile sheet.
 *
 * `listInterestOptions` exists "so the app does not invent its own list": the
 * options are activity types with live listings, ordered by how much is
 * actually on sale. A hard-coded list here would offer a traveller an interest
 * nothing in the market matches.
 *
 * Fetched only when something is about to render it, and cached for the
 * session: the list changes with inventory, not with the minute.
 */
export function useInterestOptions(enabled: boolean) {
  return useQuery({
    queryKey: qk.interestOptions(),
    enabled,
    retry: false,
    staleTime: 60 * 60_000,
    queryFn: async ({ signal }) => {
      const client = createProxyClient();
      const { data, error } = await client.GET("/me/interest-options", {
        signal,
      });
      if (error) throw error;
      return data;
    },
  });
}

/** What `PATCH /me` accepts. Only what changes is ever sent. */
export interface AccountPatch {
  name?: string;
  email?: string | null;
  interests?: string[];
  onboarded?: true;
}

/**
 * Saving the profile, and answering the first-sign-in screen.
 *
 * One mutation for both, because they are one endpoint and one rule: "Creates
 * the profile on first save and updates it after. Send only the fields that
 * change."
 *
 * ## The answer is written straight into the cache
 *
 * `PATCH /me` returns "the account after the change, the same shape as
 * `getMyAccount`", so the response IS the next value of the query. Writing it
 * with `setQueryData` rather than invalidating means the screen behind the
 * sheet is correct the instant the sheet closes, with no second request and no
 * frame showing the old name.
 *
 * That matters most for `onboardingRequired`: an invalidate would leave the
 * first-sign-in screen on the screen until a refetch landed, so skipping it
 * would visibly not work on a slow connection.
 */
export function useUpdateMyAccount() {
  const qc = useQueryClient();
  return useMutation({
    retry: false,
    mutationFn: async (patch: AccountPatch) => {
      const client = createProxyClient();
      const { data, error } = await client.PATCH("/me", { body: patch });
      if (error) throw error;
      return data;
    },
    onSuccess: (account) => {
      if (account) qc.setQueryData(qk.myAccount(), account);
    },
  });
}
