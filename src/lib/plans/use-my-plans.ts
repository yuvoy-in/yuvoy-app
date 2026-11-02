"use client";

import { useEffect } from "react";
import {
  infiniteQueryOptions,
  useInfiniteQuery,
  type QueryClient,
} from "@tanstack/react-query";
import { createProxyClient } from "@/lib/api/client";
import { YuvoyError } from "@/lib/api/errors";
import type { components } from "@/lib/api/schema.gen";
import { useSessionAfter401 } from "@/lib/auth/session-after-401";
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
 * every mount (policy.ts), so the picker reads them again each time it opens.
 * `retry: false`: a 404 is the plans release closed and a 503 is plans
 * paused, and neither changes by asking again at once. The client wrapper
 * retries neither (`plans_unavailable` is in NEVER_RETRY); it still retries a
 * GET that never arrived.
 */
function myPlansQuery(when: "upcoming" | "past") {
  return infiniteQueryOptions({
    queryKey: qk.myPlans(when),
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

/** The plans read; a 401 on it reads the session again. */
export function useMyPlans(when: "upcoming" | "past", enabled: boolean) {
  const query = useInfiniteQuery({ ...myPlansQuery(when), enabled });
  useSessionAfter401(query.error);
  return query;
}

/**
 * The upcoming plans read again as the plans signal: true when it answers
 * 404, which this read gives only while plans is closed to the caller. Any
 * other outcome, a page or a failure, is false. The crew invite asks it
 * after a 404, since the config can lag the API by minutes.
 */
export async function plansShutByList(qc: QueryClient): Promise<boolean> {
  try {
    await qc.fetchInfiniteQuery({ ...myPlansQuery("upcoming"), staleTime: 0 });
    return false;
  } catch (readError) {
    return readError instanceof YuvoyError && readError.status === 404;
  }
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

/**
 * What Invite to a plan offers: every upcoming page read, then filtered.
 * Page 1 alone is not enough, since the plans this traveller made can sit on
 * a later page behind ones they only joined. `complete` says every page is
 * in, so "no plans" is shown only then; a page that fails stops the reading
 * and leaves the error for the picker's Try again.
 */
export function useInvitablePlans(enabled: boolean) {
  const query = useMyPlans("upcoming", enabled);
  const {
    hasNextPage,
    isFetchingNextPage,
    isFetchNextPageError,
    fetchNextPage,
  } = query;
  useEffect(() => {
    // A page that failed stops here, so the reading cannot loop on it.
    if (hasNextPage && !isFetchingNextPage && !isFetchNextPageError) {
      void fetchNextPage();
    }
  }, [hasNextPage, isFetchingNextPage, isFetchNextPageError, fetchNextPage]);
  const items = query.data?.pages.flatMap((page) => page.items) ?? [];
  return {
    ...query,
    plans: invitablePlans(items),
    complete: query.data !== undefined && !hasNextPage,
  };
}
