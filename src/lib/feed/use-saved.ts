"use client";

import { useCallback } from "react";
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type InfiniteData,
  type QueryClient,
} from "@tanstack/react-query";
import { CACHE, qk } from "@/lib/query/policy";
import { useTravellerSession } from "@/lib/auth/use-traveller";
import { deviceSavedStore, type SavedEntry } from "./saved-store";
import {
  adoptDeviceSavesOnce,
  fetchAccountSavedPage,
  isSignedOutError,
  readAccountSavedIds,
  removeFromAccount,
  saveToAccount,
  type SavedExperience,
} from "./account-saved";
import type { components } from "@/lib/api/schema.gen";

type SavedPage = components["schemas"]["SavedPage"];

/**
 * The saved set, where it lives, and the one way to change it.
 *
 * ## Two homes, one choice
 *
 * Signed in, saves are on the account (yuvoy-api#192) and follow the traveller
 * to any phone. Signed out, they are on this device, and move onto the account
 * the first time a session appears (`adoptDeviceSavesOnce`). Nothing that
 * renders a bookmark has to know which: it asks this hook.
 *
 * While the session answer is still in flight the device is used, which is
 * what this app always did. A tap in that first moment lands on the device and
 * the adoption that follows the answer carries it onto the account, so the
 * guess costs nothing.
 *
 * ## Why the whole set rather than a boolean per card
 *
 * A feed page is twelve reels and every card asks the same question. Twelve
 * subscriptions to twelve one-bit queries is twelve cache entries, twelve
 * refetches and twelve re-renders on the screen that is the product. One query
 * holding the set is one entry, and a card reads it synchronously. It is the
 * shape `GET /me/saved/ids` was specified to serve, for the same reason.
 *
 * ## Optimistic, in order, and rolled back honestly
 *
 * Saving is a tap on a feed somebody is scrolling; waiting a round trip to
 * colour a control reads as the app not listening. So the set changes at once
 * and the write follows. If the write fails the previous set is put back,
 * which means the control can flip back under the traveller's finger. That is
 * the correct outcome: a wishlist that quietly loses rows is worse than one
 * that admits it could not.
 *
 * Every write, from any card or screen, goes through ONE queue
 * (`WRITE_SCOPE`). A save and an unsave tapped in quick succession are two
 * requests, and nothing about HTTP makes the second arrive second; if the
 * server applied them the other way round the traveller would see "not saved"
 * over an item the account holds. Undo on the list screen is the same race
 * with higher stakes, so it shares the queue.
 */

export type SavedWhere = "device" | "account";

/** Shared empty set, so a card with nothing saved does not re-render per tick. */
const NONE: string[] = [];

/** Every saved write shares this key, so the queue can tell when it is empty. */
const WRITE_KEY = ["writeSavedExperience"] as const;

/** One queue for every saved write, in order. See the file comment. */
const WRITE_SCOPE = { id: "saved-experience-writes" };

/**
 * Where saves live right now, or `undefined` before the session answers.
 *
 * The list screen needs the third state: rendering the device's empty list to
 * somebody who is signed in, for the moment it takes to find out, would say
 * "Nothing saved yet" to a person with twenty saves.
 */
export function useSavedWhere(): SavedWhere | undefined {
  const { signedIn } = useTravellerSession();
  if (signedIn === undefined) return undefined;
  return signedIn ? "account" : "device";
}

/**
 * The session this app thinks it has is over: ask again.
 *
 * The proxy has already dropped the cookie by the time a 401 arrives, so the
 * cached "signed in" is stale, and the next answer flips every saved read back
 * to the device. Invalidated rather than removed, so a screen that is mid
 * render keeps its last answer while the new one arrives.
 */
function sessionEnded(client: QueryClient): void {
  void client.invalidateQueries({ queryKey: qk.session() });
}

/**
 * Forgets what was read off the device.
 *
 * Adoption changes the device store underneath its cache, and that cache
 * never goes stale on its own (`staleTime: Infinity`, because only this tab
 * writes there). Without this, a session that ended would flip the feed back
 * to device reads that still showed the saves which had since moved onto the
 * account.
 */
function forgetDeviceReads(client: QueryClient): void {
  client.removeQueries({ queryKey: qk.savedIds("device") });
  client.removeQueries({ queryKey: qk.savedList("device") });
}

export function useSaved() {
  const client = useQueryClient();
  const { signedIn } = useTravellerSession();
  const where: SavedWhere = signedIn === true ? "account" : "device";
  const onAccount = where === "account";

  const { data } = useQuery({
    queryKey: qk.savedIds(where),
    queryFn: onAccount
      ? async ({ signal }) => {
          try {
            const ids = await readAccountSavedIds(signal);
            forgetDeviceReads(client);
            return ids;
          } catch (error) {
            if (isSignedOutError(error)) sessionEnded(client);
            throw error;
          }
        }
      : () => deviceSavedStore.listSavedIds(),
    /*
      The device is written by nothing but this tab, so its answer never goes
      stale. The account is written by every device the traveller signs in on,
      so it is asked again after a minute and whenever the tab comes back.
    */
    staleTime: onAccount ? CACHE.accountSaved.staleTime : Infinity,
    gcTime: onAccount ? CACHE.accountSaved.gcTime : Infinity,
    refetchOnWindowFocus: onAccount,
    /*
      `placeholderData`, not `initialData`, and the difference is the whole
      point.

      A feed must render before storage or the API answers, and `[]` is the
      honest starting point: nothing is KNOWN to be saved, and no card claims
      otherwise. But that is a placeholder, not data. `initialData` would be
      written into the cache as though it were a real answer, and `pnpm qa`
      refuses it without an `initialDataUpdatedAt` for exactly that reason.
      `placeholderData` is never cached, never suppresses the read, and
      disappears the moment the real answer lands.
    */
    placeholderData: NONE,
  });

  /* `NONE`, never a fresh `[]`: see its declaration. */
  const ids = data ?? NONE;

  const { mutate } = useSavedWrite();

  const isSaved = useCallback(
    (experienceId: string) => ids.includes(experienceId),
    [ids],
  );

  /*
    The SLUG is required, and that is the point of it.

    On the device, an id alone cannot be resolved to an experience: the API
    fetches by slug and offers no id filter. Taking it here means a device
    save is renderable the moment it is made, and a caller that does not have
    a slug is a compile error rather than a row the list silently cannot show.
  */
  const toggleSaved = useCallback(
    (experienceId: string, slug: string) => {
      const next = !ids.includes(experienceId);
      mutate({ id: experienceId, slug, next, where });
      return next;
    },
    [ids, mutate, where],
  );

  return { savedIds: ids, isSaved, toggleSaved };
}

/** One save or removal, wherever it goes. */
export interface SavedWrite {
  id: string;
  /** The listing's slug. What makes a device save renderable. */
  slug: string;
  /** True to save, false to remove. */
  next: boolean;
  where: SavedWhere;
  /**
   * Device only, and for UNDO only: puts a restored save back where it was
   * rather than at the front. The account has no such call; see the list
   * screen.
   */
  savedAt?: number;
  /**
   * Account only: the saved card, so an undo can paint the tile before the
   * refetch that confirms it.
   */
  item?: SavedExperience;
}

/** The set with this write applied. `undefined` stays `undefined`: see below. */
function applyToIds(current: string[] | undefined, write: SavedWrite) {
  /*
    Nothing read yet means nothing to be optimistic about. Writing `[id]` here
    would be cached as a REAL answer, and on the device, where the answer never
    goes stale, every other save would stay hidden until the write settled.
  */
  if (!current) return current;
  if (write.next) {
    return current.includes(write.id) ? current : [...current, write.id];
  }
  return current.filter((id) => id !== write.id);
}

/** Newest first, with migrated v1 entries (`savedAt: 0`) last. */
function byNewest(a: SavedEntry, b: SavedEntry): number {
  return b.savedAt - a.savedAt;
}

function applyToEntries(data: SavedEntry[] | undefined, write: SavedWrite) {
  if (!data) return data;
  if (!write.next) return data.filter((entry) => entry.id !== write.id);
  if (data.some((entry) => entry.id === write.id)) return data;
  return [
    ...data,
    {
      id: write.id,
      slug: write.slug || null,
      savedAt: write.savedAt ?? Date.now(),
    },
  ].sort(byNewest);
}

function applyToPages(
  data: InfiniteData<SavedPage, string | undefined> | undefined,
  write: SavedWrite,
) {
  if (!data) return data;
  if (!write.next) {
    return {
      ...data,
      pages: data.pages.map((page) => ({
        ...page,
        items: page.items.filter((item) => item.id !== write.id),
      })),
    };
  }
  const item = write.item;
  if (!item || data.pages.length === 0) return data;
  if (data.pages.some((page) => page.items.some((i) => i.id === write.id))) {
    return data;
  }
  // A new save is the newest, and the account lists newest first.
  const [first, ...rest] = data.pages;
  return {
    ...data,
    pages: [{ ...first, items: [item, ...first.items] }, ...rest],
  };
}

/**
 * Save or remove one experience, from anywhere, in order.
 *
 * `onSettled` reconciles with the store only once the queue has drained. A
 * refetch after the FIRST of two queued writes would answer with the state
 * between them, and the bookmark would flicker to it and back.
 */
export function useSavedWrite() {
  const client = useQueryClient();

  return useMutation({
    mutationKey: WRITE_KEY,
    scope: WRITE_SCOPE,
    mutationFn: async (write: SavedWrite) => {
      if (write.where === "account") {
        if (write.next) await saveToAccount(write.id);
        else await removeFromAccount(write.id);
        return;
      }
      if (write.next) {
        await deviceSavedStore.addSaved(write.id, write.slug, write.savedAt);
      } else {
        await deviceSavedStore.removeSaved(write.id);
      }
    },
    onMutate: async (write) => {
      const idsKey = qk.savedIds(write.where);
      const listKey = qk.savedList(write.where);
      /* Stop an in-flight read from landing on top of the optimistic set. */
      await client.cancelQueries({ queryKey: idsKey });
      await client.cancelQueries({ queryKey: listKey });

      const previous = {
        ids: client.getQueryData<string[]>(idsKey),
        list: client.getQueryData(listKey),
      };

      client.setQueryData<string[]>(idsKey, (current) =>
        applyToIds(current, write),
      );
      if (write.where === "account") {
        client.setQueryData<InfiniteData<SavedPage, string | undefined>>(
          listKey,
          (data) => applyToPages(data, write),
        );
      } else {
        client.setQueryData<SavedEntry[]>(listKey, (data) =>
          applyToEntries(data, write),
        );
      }
      return previous;
    },
    onError: (error, write, previous) => {
      if (previous) {
        client.setQueryData(qk.savedIds(write.where), previous.ids);
        client.setQueryData(qk.savedList(write.where), previous.list);
      }
      if (isSignedOutError(error)) sessionEnded(client);
    },
    onSettled: (_data, _error, write) => {
      /*
        This write still counts as in flight during its own `onSettled`, so
        one means the queue is empty after it.
      */
      if (client.isMutating({ mutationKey: WRITE_KEY }) > 1) return;
      /*
        Re-read after either outcome. The optimistic value is a guess about
        what the store did, and this is the only thing that makes the control
        agree with what is actually persisted.
      */
      void client.invalidateQueries({ queryKey: qk.savedIds(write.where) });
      void client.invalidateQueries({ queryKey: qk.savedList(write.where) });
    },
  });
}

/**
 * Every save on this device with enough to render it, newest first.
 *
 * Separate hook because only one screen needs it, and a feed that imported it
 * would pay for a read it never looks at.
 */
export function useDeviceSavedList() {
  return useQuery({
    queryKey: qk.savedList("device"),
    queryFn: () => deviceSavedStore.listSaved(),
    staleTime: Infinity,
    gcTime: Infinity,
    /*
      No placeholder, unlike the feed's ids. A placeholder puts the query in
      `success` before storage has answered, so this screen drew "Nothing
      saved yet" for a frame over somebody's list. The feed has to render
      before storage answers; this screen can show a skeleton instead.
    */
  });
}

/**
 * The account's saves, a page at a time, newest first (`GET /me/saved`).
 *
 * Bodies come with the page, so there is no request per tile, and a listing
 * that was unpublished after it was saved still comes back with the summary
 * it had then and `bookable: false`. The owner chose that on 16 Sep: a save
 * that vanished because an operator paused would read as the app losing it.
 *
 * The first page adopts the device's saves before it reads, for the reason
 * the feed does: the list has to include what this phone held before sign in.
 */
export function useAccountSavedList(enabled: boolean) {
  const client = useQueryClient();

  return useInfiniteQuery({
    queryKey: qk.savedList("account"),
    enabled,
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam, signal }) => {
      try {
        if (!pageParam) {
          try {
            await adoptDeviceSavesOnce();
            forgetDeviceReads(client);
          } catch (error) {
            // Anything but a finished session: show what the account holds,
            // and leave the device's saves where they are for next time.
            if (isSignedOutError(error)) throw error;
          }
        }
        return await fetchAccountSavedPage(pageParam, signal);
      } catch (error) {
        if (isSignedOutError(error)) sessionEnded(client);
        throw error;
      }
    },
    /*
      `complete` is the contract's own "stop"; `nextCursor` is only read when
      it says there is more. Either alone would do today, and relying on both
      means a page that says "more" with no cursor cannot loop.
    */
    getNextPageParam: (last) =>
      last.complete ? undefined : (last.nextCursor ?? undefined),
    staleTime: CACHE.accountSaved.staleTime,
    gcTime: CACHE.accountSaved.gcTime,
    refetchOnWindowFocus: true,
  });
}
