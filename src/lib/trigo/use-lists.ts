"use client";

import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import { createProxyClient } from "@/lib/api/client";
import { YuvoyError } from "@/lib/api/errors";
import { CACHE, qk } from "@/lib/query/policy";
import { useHasMounted } from "@/lib/react/use-has-mounted";
import { useRelease } from "@/lib/site/use-release";
import type { DateAlert, TripDraft } from "./lists-words";
import { withoutDateAlert, withoutTripDraft } from "./lists";

/**
 * The date alerts and trip drafts on the signed-in number (yuvoy-app#220),
 * through this app's proxy, session only. A Trigo card the traveller said
 * yes to puts one here (`actions.ts` marks both lists stale when it does).
 *
 * Both lists are behind the `trigo` release, and nothing here is read while
 * it is closed. Every change is done only on `204`. A `404` means the item
 * is not there any more (stopped or deleted on the phone): it comes out of
 * the list, and the list is read again either way.
 */

type AlertList = { alerts: DateAlert[] };
type DraftList = { drafts: TripDraft[] };

/** The lists' release, open, and only once the browser has drawn the page. */
export function useTrigoListsOpen(): boolean {
  const release = useRelease("trigo");
  const mounted = useHasMounted();
  return mounted && release.open;
}

/** `GET /me/date-alerts`: every waiting alert and the latest that told. */
export function useMyDateAlerts(enabled: boolean) {
  return useQuery({
    queryKey: qk.myDateAlerts(),
    enabled,
    retry: false,
    ...CACHE.listMyDateAlerts,
    queryFn: async ({ signal }): Promise<AlertList> => {
      const client = createProxyClient();
      const { data, error } = await client.GET("/me/date-alerts", { signal });
      if (error) throw error;
      return data;
    },
  });
}

/** `GET /me/trip-drafts`: the drafts, newest first. */
export function useMyTripDrafts(enabled: boolean) {
  return useQuery({
    queryKey: qk.myTripDrafts(),
    enabled,
    retry: false,
    ...CACHE.listMyTripDrafts,
    queryFn: async ({ signal }): Promise<DraftList> => {
      const client = createProxyClient();
      const { data, error } = await client.GET("/me/trip-drafts", { signal });
      if (error) throw error;
      return data;
    },
  });
}

/** Anything but `204` is not done, even a 2xx. */
function only204(response: Response): void {
  if (response.status !== 204) {
    throw new YuvoyError({
      code: "internal_error",
      message: "",
      status: response.status,
    });
  }
}

function status(error: unknown): number | null {
  return error instanceof YuvoyError ? error.status : null;
}

/**
 * After a change. Done or gone, the item comes out of the cached list at
 * once. Then the list is read again. A `401` means the proxy has dropped the
 * cookie: the session is marked stale so the next screen asks for it.
 */
function settle(
  qc: QueryClient,
  error: unknown,
  drop: () => void,
  list: readonly unknown[],
): Promise<unknown> {
  const code = error ? status(error) : 204;
  if (code === 204 || code === 404) drop();
  if (code === 401) {
    void qc.invalidateQueries({ queryKey: qk.session(), refetchType: "none" });
  }
  return qc.invalidateQueries({ queryKey: list });
}

/** `DELETE /me/date-alerts/{id}`, "Stop telling me". */
export function useStopDateAlert() {
  const qc = useQueryClient();
  return useMutation({
    retry: false,
    mutationFn: async (id: string): Promise<void> => {
      const client = createProxyClient();
      const { error, response } = await client.DELETE("/me/date-alerts/{id}", {
        params: { path: { id } },
      });
      if (error) throw error;
      only204(response);
    },
    onSettled: (_, error, id) =>
      settle(
        qc,
        error,
        () =>
          qc.setQueryData<AlertList>(qk.myDateAlerts(), (list) =>
            list ? { alerts: withoutDateAlert(list.alerts, id) } : list,
          ),
        qk.myDateAlerts(),
      ),
  });
}

/** `DELETE /me/trip-drafts/{id}`, "Delete draft". */
export function useDeleteTripDraft() {
  const qc = useQueryClient();
  return useMutation({
    retry: false,
    mutationFn: async (id: string): Promise<void> => {
      const client = createProxyClient();
      const { error, response } = await client.DELETE("/me/trip-drafts/{id}", {
        params: { path: { id } },
      });
      if (error) throw error;
      only204(response);
    },
    onSettled: (_, error, id) =>
      settle(
        qc,
        error,
        () =>
          qc.setQueryData<DraftList>(qk.myTripDrafts(), (list) =>
            list ? { drafts: withoutTripDraft(list.drafts, id) } : list,
          ),
        qk.myTripDrafts(),
      ),
  });
}
