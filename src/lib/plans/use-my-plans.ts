"use client";

import { useInfiniteQuery } from "@tanstack/react-query";
import { createProxyClient } from "@/lib/api/client";
import type { components } from "@/lib/api/schema.gen";
import { CACHE, qk } from "@/lib/query/policy";

/**
 * The traveller's own plans, `GET /me/plans` (yuvoy-mobile#392, web half):
 * what Invite to a plan picks from on a crew page. Through this app's
 * proxy, which holds the session.
 */

export type PlanSummary = components["schemas"]["PlanSummary"];

/** The most the API gives in one page; a picker wants them all at once. */
export const MY_PLANS_PAGE_SIZE = 50;

/**
 * Plans, upcoming or past, page by page. Kept five minutes and read again on
 * every mount (policy.ts), so the picker reads them again each time it opens. `retry: false`: a 404 is the plans release
 * closed and a 503 is plans paused, and neither changes by asking again at
 * once. The client wrapper still retries a GET that never arrived.
 */
export function useMyPlans(when: "upcoming" | "past", enabled: boolean) {
  return useInfiniteQuery({
    queryKey: qk.myPlans(when),
    enabled,
    retry: false,
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam, signal }) => {
      const client = createProxyClient();
      const { data, error } = await client.GET("/me/plans", {
        params: {
          query: {
            when,
            limit: MY_PLANS_PAGE_SIZE,
            // Left out on the first page: an empty cursor is not the same
            // request as none.
            ...(pageParam ? { cursor: pageParam } : {}),
          },
        },
        signal,
      });
      if (error || !data) {
        throw error ?? new Error("GET /me/plans had no body.");
      }
      return data;
    },
    // `complete` first, so a last page with a cursor still on it stops.
    getNextPageParam: (last) =>
      last.complete ? undefined : (last.nextCursor ?? undefined),
    ...CACHE.listMyPlans,
  });
}

/**
 * The plans a crew can be invited to: ones this traveller made that are
 * still open or decided. A member cannot invite, and a plan done, cancelled
 * or closed answers `409 plan_closed`, so neither is offered.
 */
export function invitablePlans(items: readonly PlanSummary[]): PlanSummary[] {
  return items.filter(
    (plan) =>
      plan.role === "planner" &&
      (plan.state === "open" || plan.state === "decided"),
  );
}
