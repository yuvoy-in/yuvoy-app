"use client";

import { useQueries } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import { CACHE, qk } from "@/lib/query/policy";
import type { FeedTail, Reel } from "./reels";
import {
  useAccountSavedList,
  useDeviceSavedList,
  useSavedWhere,
} from "./use-saved";

/**
 * A traveller's saves as a reel (the approved redesign: "Saved plays as a
 * reel, with a grid toggle", traveller A, 3 Oct 2026).
 *
 * Each save is a listing, and its reel is the listing's own headline clip
 * (`heroMedia`), the one the feed showed when they saved it. A listing with no
 * clip has nothing to play, so it stays in the grid and is left out here.
 *
 * Read from wherever the saves are, by the same reads the grid uses, so the two
 * views share their cache: signed in, the account's list, a page at a time;
 * signed out, this phone's list, each listing fetched on the same key the grid
 * fetches it on.
 */
export interface SavedReels {
  state: "pending" | "error" | "ready";
  items: Reel[];
  tail: FeedTail;
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  isFetchNextPageError: boolean;
  fetchNextPage: () => void;
  retry: () => void;
}

export function useSavedReels(): SavedReels {
  const where = useSavedWhere();
  const account = useAccountSavedList(where === "account");
  const device = useDeviceSavedList();
  const slugs =
    where === "device"
      ? (device.data ?? []).flatMap((entry) => (entry.slug ? [entry.slug] : []))
      : [];
  const listings = useQueries({
    queries: slugs.map((slug) => ({
      queryKey: qk.experience(slug),
      queryFn: async ({ signal }: { signal: AbortSignal }) => {
        const { data, error } = await api.GET("/experiences/{slug}", {
          params: { path: { slug } },
          signal,
        });
        if (error) throw error;
        return data;
      },
      ...CACHE.getExperience,
    })),
  });

  const none = {
    hasNextPage: false,
    isFetchingNextPage: false,
    isFetchNextPageError: false,
    fetchNextPage: () => {},
  };

  if (where === undefined) {
    return {
      state: "pending",
      items: [],
      tail: "more",
      retry: () => {},
      ...none,
    };
  }

  if (where === "account") {
    if (account.isPending) {
      return {
        state: "pending",
        items: [],
        tail: "more",
        retry: () => {},
        ...none,
      };
    }
    if (account.isLoadingError) {
      return {
        state: "error",
        items: [],
        tail: "more",
        retry: () => void account.refetch(),
        ...none,
      };
    }
    // Each listing once: a keyset page cannot repeat a row, and this is the belt.
    const seen = new Set<string>();
    const items: Reel[] = [];
    for (const page of account.data?.pages ?? []) {
      for (const saved of page.items) {
        if (seen.has(saved.id) || !saved.heroMedia) continue;
        seen.add(saved.id);
        items.push({ media: saved.heroMedia, experience: saved } as Reel);
      }
    }
    return {
      state: "ready",
      items,
      tail: account.hasNextPage ? "more" : "complete",
      hasNextPage: account.hasNextPage,
      isFetchingNextPage: account.isFetchingNextPage,
      isFetchNextPageError: account.isFetchNextPageError,
      fetchNextPage: () => void account.fetchNextPage(),
      retry: () => void account.refetch(),
    };
  }

  // On this phone.
  if (device.isPending || listings.some((listing) => listing.isPending)) {
    return {
      state: "pending",
      items: [],
      tail: "more",
      retry: () => {},
      ...none,
    };
  }
  const items: Reel[] = [];
  for (const listing of listings) {
    const experience = listing.data;
    if (!experience?.heroMedia) continue;
    items.push({ media: experience.heroMedia, experience } as Reel);
  }
  // Every save failed to load: that is a failure, not an empty reel.
  if (
    items.length === 0 &&
    listings.length > 0 &&
    listings.every((l) => l.isError)
  ) {
    return {
      state: "error",
      items: [],
      tail: "more",
      retry: () => listings.forEach((listing) => void listing.refetch()),
      ...none,
    };
  }
  return { state: "ready", items, tail: "complete", retry: () => {}, ...none };
}
