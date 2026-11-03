"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createProxyClient } from "@/lib/api/client";
import { qk } from "@/lib/query/policy";
import {
  meSettingsPatch,
  withSetting,
  type MeSettingChange,
} from "./me-helpers";
import type { MySettings } from "./types";

/**
 * Me's two settings (yuvoy-mobile#444; yuvoy-api#467): "Languages I'm happy
 * with" and "Women-only tables", on `/me/settings`. The same route holds the
 * usage choice and the email switches; each write from here sends only the
 * field that changed, so Me never sends theirs. The table switch stores no
 * gender.
 */

/** `GET /me/settings`. Five minutes fresh: only this person changes it. */
export function useMeSettings(enabled: boolean) {
  return useQuery({
    queryKey: qk.mySettings(),
    enabled,
    retry: false,
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
    queryFn: async ({ signal }): Promise<MySettings> => {
      const client = createProxyClient();
      const { data, error } = await client.GET("/me/settings", { signal });
      if (error || !data) throw error ?? new Error("me.settings: no body");
      return data;
    },
  });
}

const WRITE_KEY = ["updateMySettings", "me"] as const;

/**
 * One change: shown at once, then `PATCH /me/settings` with that field alone.
 * Changes go one after another (`scope`), so the last tap is what the account
 * keeps, and only the last answer settles the cache. A change that does not
 * go through puts back what was there and is the mutation's error (the page
 * says `ME_WORDS.changeFailed`); nothing is kept to send later.
 */
export function useUpdateMeSettings() {
  const qc = useQueryClient();
  return useMutation<
    MySettings,
    unknown,
    MeSettingChange,
    { was: MySettings | undefined }
  >({
    mutationKey: WRITE_KEY,
    scope: { id: "me-settings" },
    onMutate: async (change) => {
      await qc.cancelQueries({ queryKey: qk.mySettings() });
      const was = qc.getQueryData<MySettings>(qk.mySettings());
      if (was) qc.setQueryData(qk.mySettings(), withSetting(was, change));
      return { was };
    },
    mutationFn: async (change) => {
      const client = createProxyClient();
      const { data, error } = await client.PATCH("/me/settings", {
        body: meSettingsPatch(change),
      });
      if (error || !data) throw error ?? new Error("me.settings: no body");
      return data;
    },
    onSuccess: (saved) => {
      // A later tap still on its way keeps what it shows.
      if (qc.isMutating({ mutationKey: WRITE_KEY }) > 1) return;
      qc.setQueryData(qk.mySettings(), saved);
    },
    onError: (_error, _change, context) => {
      // A later tap still on its way keeps what it shows; its answer settles it.
      if (qc.isMutating({ mutationKey: WRITE_KEY }) > 1) return;
      if (context?.was) qc.setQueryData(qk.mySettings(), context.was);
      // What was there may itself have been an earlier tap's guess: read it.
      void qc.invalidateQueries({ queryKey: qk.mySettings() });
    },
  });
}
