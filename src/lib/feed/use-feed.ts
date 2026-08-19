"use client";

import { useInfiniteQuery } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import { CACHE, qk } from "@/lib/query/policy";
import type { components, operations } from "@/lib/api/schema.gen";

type ExperienceSummary = components["schemas"]["ExperienceSummary"];

/**
 * Filters are the contract's own query type, not a hand-written mirror.
 * `category` is an enum in the contract, so a typo is a build failure rather
 * than a filter that silently matches nothing.
 */
export type FeedFilters = Omit<
  NonNullable<operations["listExperiences"]["parameters"]["query"]>,
  "cursor" | "limit"
>;

/**
 * The feed's data.
 *
 * The load-bearing line is `getNextPageParam`: it returns undefined when the
 * server says `complete`, and NOT when a page comes back short.
 *
 * A client that infers the end from a short page stops early the first time a
 * filter happens to return exactly one page — and an infinite scroll that
 * silently stops looks identical to one with nothing more to show, so nobody
 * reports it as a bug.
 */
export function useFeed(filters: FeedFilters = {}) {
  return useInfiniteQuery({
    queryKey: qk.experiences(filters as Record<string, string | undefined>),
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam, signal }) => {
      const { data, error } = await api.GET("/experiences", {
        params: {
          query: { ...filters, ...(pageParam ? { cursor: pageParam } : {}) },
        },
        signal,
      });
      if (error) throw error;
      return data;
    },
    getNextPageParam: (last) =>
      last.complete ? undefined : (last.nextCursor ?? undefined),
    ...CACHE.listExperiences,
  });
}

/** Flattens pages into the list the feed renders. */
export function flattenFeed(
  pages: { items: ExperienceSummary[] }[] | undefined,
): ExperienceSummary[] {
  return pages?.flatMap((p) => p.items) ?? [];
}
