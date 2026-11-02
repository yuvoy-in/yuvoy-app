"use client";

import { useMemo } from "react";
import {
  useInfiniteQuery,
  useMutation,
  useQueryClient,
  type InfiniteData,
  type QueryClient,
} from "@tanstack/react-query";
import { createProxyClient } from "@/lib/api/client";
import { YuvoyError } from "@/lib/api/errors";
import { qk } from "@/lib/query/policy";
import {
  namedEntriesOf,
  visibilityRoute,
  withEntry,
  withQuestion,
  withoutQuestion,
} from "./me-helpers";
import type {
  DidYouGoItem,
  EntryVisibility,
  LifeEntry,
  LifeListPage,
} from "./types";

/**
 * The life list (yuvoy-mobile#444, R10-M1; yuvoy-api#467, #504): read a page
 * at a time through this app's proxy, and who sees an entry, written.
 *
 * Every `me` route answers 404 while the release is closed to the person, so
 * a 404 on the read is "not for you" (`closed`) and the section is not drawn,
 * rather than a list that failed.
 *
 * An entry's `photoUrl` is a five-minute signed read. It lives in this query
 * only: nothing here writes it to storage, and `gcTime: 0` lets it go as soon
 * as no screen reads the list, so a link that has died is never drawn from a
 * cache that outlived it.
 */

/** Entries a page holds: the API's default, sent so a change there moves nothing here. */
export const LIFE_LIST_PAGE = 20;

type Pages = InfiniteData<LifeListPage, string | undefined>;

/** A read's 404: the `me` release is closed to this traveller. */
export function isMeClosed(error: unknown): boolean {
  return error instanceof YuvoyError && error.status === 404;
}

/**
 * `GET /me/life-list`, newest first. `didYouGo` and `counts` ride on the first
 * page only; later pages carry an empty list and zeros, so neither is read
 * from them.
 *
 * Two minutes fresh, well inside the photo links' five, and read again when
 * the tab comes back, which is when a traveller back from a trip looks.
 * `retry: false` because a 401 and a 404 do not improve with asking again;
 * the client wrapper still retries a GET that never arrived.
 */
export function useLifeList(enabled: boolean) {
  const query = useInfiniteQuery({
    queryKey: qk.myLifeList(),
    enabled,
    retry: false,
    staleTime: 2 * 60_000,
    gcTime: 0,
    refetchOnWindowFocus: true,
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam, signal }) => {
      const client = createProxyClient();
      const { data, error } = await client.GET("/me/life-list", {
        params: {
          query: {
            limit: LIFE_LIST_PAGE,
            // Omitted on the first page: `cursor=` empty is a different request.
            ...(pageParam ? { cursor: pageParam } : {}),
          },
        },
        signal,
      });
      if (error || !data) throw error ?? new Error("me.life-list: no body");
      return data;
    },
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });

  const {
    data,
    status,
    error,
    hasNextPage,
    isFetchingNextPage,
    isFetchNextPageError,
    fetchNextPage,
    refetch,
  } = query;

  const entries = useMemo<LifeEntry[]>(
    () => (data ? namedEntriesOf(data.pages) : []),
    [data],
  );
  const first = data?.pages[0];
  const didYouGo: DidYouGoItem[] = first?.didYouGo ?? [];
  const counts = first ? first.counts : null;

  return {
    status,
    /** The release is closed to this person: draw nothing, say nothing. */
    closed: status === "error" && isMeClosed(error),
    error,
    entries,
    didYouGo,
    counts,
    hasMore: Boolean(hasNextPage),
    loadMore: () => {
      if (hasNextPage && !isFetchingNextPage) void fetchNextPage();
    },
    loadingMore: isFetchingNextPage,
    /** The last Show more failed; the pages already read still stand. */
    moreFailed: isFetchNextPageError,
    refetch: () => {
      void refetch();
    },
  };
}

/** Reads the life list and the badges again: an answer or a check-in may move both. */
export function lifeListChanged(qc: QueryClient): void {
  void qc.invalidateQueries({ queryKey: qk.myLifeList() });
  void qc.invalidateQueries({ queryKey: qk.myBadges() });
}

function changeEntry(
  qc: QueryClient,
  entryId: string,
  change: (entry: LifeEntry) => LifeEntry,
): void {
  qc.setQueryData<Pages>(qk.myLifeList(), (data) =>
    data ? { ...data, pages: withEntry(data.pages, entryId, change) } : data,
  );
}

/** Every change of who sees an entry, so one answer can tell whether another is still out. */
const VISIBILITY_KEY = ["updateMyLifeEntry", "me"] as const;

export type VisibilityChange = {
  entry: LifeEntry;
  visibility: EntryVisibility;
};

/**
 * Who sees this: shown at once, then sent. A trip or a table is
 * `PATCH /me/life-list/{entryId}` and answers the entry; a went entry only
 * ever `PATCH /me/went/{eventId}`, which answers the visibility alone, so it
 * resolves with nothing. A plan has no route and rejects without a request
 * (the page draws "Only you see plans" and never asks).
 *
 * One change at a time, in order (`scope`), and only the last answer settles
 * the cache, so two quick taps never flicker back through the first. A
 * refusal puts back what was there and is the mutation's error, for the page
 * to say `ME_WORDS.changeFailed`.
 */
export function useSetEntryVisibility() {
  const qc = useQueryClient();
  return useMutation<
    LifeEntry | void,
    unknown,
    VisibilityChange,
    { was: EntryVisibility }
  >({
    mutationKey: VISIBILITY_KEY,
    scope: { id: "me-life-visibility" },
    onMutate: async ({ entry, visibility }) => {
      const was = entry.visibility;
      if (visibilityRoute(entry) === null) return { was };
      // A read on its way would land over the change.
      await qc.cancelQueries({ queryKey: qk.myLifeList() });
      changeEntry(qc, entry.entryId, (e) => ({ ...e, visibility }));
      return { was };
    },
    mutationFn: async ({ entry, visibility }) => {
      const route = visibilityRoute(entry);
      const client = createProxyClient();
      if (route === "went" && entry.eventId) {
        const { error } = await client.PATCH("/me/went/{eventId}", {
          params: { path: { eventId: entry.eventId } },
          body: { visibility },
        });
        if (error) throw error;
        return;
      }
      if (route !== "life-list") {
        throw new Error("me.visibility: no route for this entry");
      }
      const { data, error } = await client.PATCH("/me/life-list/{entryId}", {
        params: { path: { entryId: entry.entryId } },
        body: { visibility },
      });
      if (error || !data) throw error ?? new Error("me.visibility: no body");
      return data;
    },
    onSuccess: (saved, { entry, visibility }) => {
      // A later change still on its way keeps what it shows.
      if (qc.isMutating({ mutationKey: VISIBILITY_KEY }) > 1) return;
      changeEntry(qc, entry.entryId, (e) =>
        saved
          ? // The answer's photo link is newer than the one held, so it wins too.
            { ...e, ...saved }
          : { ...e, visibility },
      );
    },
    onError: (error, { entry }, context) => {
      if (context) {
        changeEntry(qc, entry.entryId, (e) => ({
          ...e,
          visibility: context.was,
        }));
      }
      // Closed to them since the read: read again, and the section goes.
      if (isMeClosed(error)) {
        void qc.invalidateQueries({ queryKey: qk.myLifeList() });
      }
    },
  });
}

const ANSWER_KEY = ["answerDidYouGo", "me"] as const;

/**
 * Did you go?, answered from Me: `POST /me/went/{eventId}` with `went` and
 * `via: "trips_card"`, the value the phone sends from the same card
 * (yuvoy-mobile#446, difference 4). The question leaves at the tap; a refusal
 * (409 `not_reviewable_yet` or `review_window_closed`, a 429) or a failure
 * puts it back and is the mutation's error. Either way the life list and the
 * badges are read again, so the went entry and any badge it earned show.
 */
export function useAnswerDidYouGo() {
  const qc = useQueryClient();
  return useMutation<
    void,
    unknown,
    { eventId: string; went: boolean },
    { item: DidYouGoItem | undefined; at: number }
  >({
    mutationKey: ANSWER_KEY,
    onMutate: async ({ eventId }) => {
      await qc.cancelQueries({ queryKey: qk.myLifeList() });
      const asked =
        qc.getQueryData<Pages>(qk.myLifeList())?.pages[0]?.didYouGo ?? [];
      const key = eventId.toLowerCase();
      const at = asked.findIndex((q) => q.eventId.toLowerCase() === key);
      qc.setQueryData<Pages>(qk.myLifeList(), (data) =>
        data ? { ...data, pages: withoutQuestion(data.pages, eventId) } : data,
      );
      return { item: at >= 0 ? asked[at] : undefined, at };
    },
    mutationFn: async ({ eventId, went }) => {
      const client = createProxyClient();
      const { error } = await client.POST("/me/went/{eventId}", {
        params: { path: { eventId } },
        body: { went, via: "trips_card" },
      });
      if (error) throw error;
    },
    onSettled: () => {
      // Read again once the last answer is in, either way: a read between
      // two would bring back the question still on its way.
      if (qc.isMutating({ mutationKey: ANSWER_KEY }) > 1) return;
      lifeListChanged(qc);
    },
    onError: (_error, _vars, context) => {
      // Only this question goes back, where it was: another answer may be out.
      const item = context?.item;
      const at = context?.at ?? 0;
      if (item) {
        qc.setQueryData<Pages>(qk.myLifeList(), (data) =>
          data && data.pages.length > 0
            ? {
                ...data,
                pages: withQuestion(data.pages, item, at),
              }
            : data,
        );
      }
    },
  });
}
