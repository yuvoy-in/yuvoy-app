"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createProxyClient } from "@/lib/api/client";
import { YuvoyError } from "@/lib/api/errors";
import { qk } from "@/lib/query/policy";
import type { components } from "@/lib/api/schema.gen";

export type TableView = components["schemas"]["TableView"];
export type TableSeatState = components["schemas"]["TableSeatState"];
export type TableReport = components["schemas"]["TableReport"];

/**
 * One table, as the person who asked to join it sees it (yuvoy-app#194,
 * R8-T1).
 *
 * ## Signed in, always, and through the proxy
 *
 * The contract lets anybody read a listed table and report one. This page
 * never does either signed out: every table email links here, and the link
 * builder's own rule is that "the id alone opens nothing", so a forwarded
 * letter shows a stranger no title, no time and no area. The session is also
 * what adds the reader's own request, the names and the venue. So all three
 * calls go through `createProxyClient`, and the screen does not call them
 * until the session says signed in.
 *
 * ## A 401 is the session ending, not an error to show
 *
 * The proxy drops the cookie on a 401, so the cached "signed in" is stale.
 * Invalidating the session query lets the screen fall to its sign-in branch
 * rather than draw a failure the reader can only fix by signing in.
 */

/** Whether a failure means the session is over rather than anything else. */
export function isSignedOut(error: unknown): boolean {
  return error instanceof YuvoyError && error.status === 401;
}

/** One table, for `/tables/{id}`. */
export function useTable(id: string, enabled: boolean) {
  return useQuery({
    queryKey: qk.table(id),
    enabled: enabled && Boolean(id),
    retry: false,
    queryFn: async ({ signal }) => {
      const client = createProxyClient();
      const { data, error } = await client.GET("/tables/{id}", {
        params: { path: { id } },
        signal,
      });
      if (error) throw error;
      return data;
    },
  });
}

/**
 * Withdrawing a request, or giving back a seat.
 *
 * The `200` is the table as it now stands, so it replaces the one on screen
 * and nothing is read again. Every refusal reads the table again instead:
 * `409 table_closed` because the table has started or was cancelled, and
 * `404` because there is no live seat any more (given back on the phone, for
 * one), which says nothing about the table itself.
 */
export function useWithdrawTableSeat(id: string) {
  const qc = useQueryClient();
  return useMutation({
    retry: false,
    mutationFn: async () => {
      const client = createProxyClient();
      const { data, error } = await client.DELETE(
        "/tables/{id}/requests/mine",
        { params: { path: { id } } },
      );
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      if (data) qc.setQueryData(qk.table(id), data);
    },
    onError: (error) => {
      if (isSignedOut(error)) {
        void qc.invalidateQueries({ queryKey: qk.session() });
        return;
      }
      void qc.invalidateQueries({ queryKey: qk.table(id) });
    },
  });
}

/**
 * Reporting the table, or somebody at it. `202` carries no body, and nothing
 * on the table changes, so there is nothing to put in the cache.
 */
export function useReportTable(id: string) {
  const qc = useQueryClient();
  return useMutation({
    retry: false,
    mutationFn: async (body: TableReport) => {
      const client = createProxyClient();
      const { error } = await client.POST("/tables/{id}/reports", {
        params: { path: { id } },
        body,
      });
      if (error) throw error;
    },
    onError: (error) => {
      if (isSignedOut(error)) {
        void qc.invalidateQueries({ queryKey: qk.session() });
      }
    },
  });
}
