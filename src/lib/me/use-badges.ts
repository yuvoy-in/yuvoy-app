"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createProxyClient } from "@/lib/api/client";
import { qk } from "@/lib/query/policy";
import { markedSeen } from "./me-helpers";
import type { MyBadges } from "./types";

/**
 * Badges (yuvoy-mobile#444; yuvoy-api#469): `GET /me/badges`, earned and in
 * progress, and "Nice" on a new one (`POST /me/badges/seen`).
 *
 * A 404 is the `me` release closed to this person, as on the life list
 * (`isMeClosed` in use-life-list.ts), and the section is not drawn.
 */

/** `GET /me/badges`. A minute fresh; read again when the tab comes back. */
export function useBadges(enabled: boolean) {
  return useQuery({
    queryKey: qk.myBadges(),
    enabled,
    retry: false,
    staleTime: 60_000,
    gcTime: 5 * 60_000,
    refetchOnWindowFocus: true,
    queryFn: async ({ signal }): Promise<MyBadges> => {
      const client = createProxyClient();
      const { data, error } = await client.GET("/me/badges", { signal });
      if (error || !data) throw error ?? new Error("me.badges: no body");
      return data;
    },
  });
}

/**
 * "Nice": `POST /me/badges/seen` with the keys (1 to 20, the API's rule), and
 * on its 204 the cache marks them seen, so the panel moves on to the next new
 * badge or goes. Nothing is marked before the answer: a mark that did not go
 * through is the mutation's error (the page says `ME_WORDS.saveFailed`) and
 * the badge is still new on the account, so it shows again on a later read.
 * The page keeps a badge whose Nice is on its way out of the panel meanwhile
 * (`nextNewBadge` in me-helpers.ts takes that set).
 */
export function useMarkBadgesSeen() {
  const qc = useQueryClient();
  return useMutation<void, unknown, string[]>({
    mutationKey: ["markBadgesSeen", "me"],
    mutationFn: async (keys) => {
      const sent = [...new Set(keys)].slice(0, 20);
      if (sent.length === 0) return;
      const client = createProxyClient();
      const { error } = await client.POST("/me/badges/seen", {
        body: { keys: sent },
      });
      if (error) throw error;
    },
    onSuccess: (_void, keys) => {
      qc.setQueryData<MyBadges>(qk.myBadges(), (data) =>
        data ? { ...data, earned: markedSeen(data.earned, keys) } : data,
      );
    },
  });
}
