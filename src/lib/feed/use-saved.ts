"use client";

import { useCallback } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { savedStore, type SavedEntry } from "./saved-store";

/**
 * The saved set, and the one way to change it.
 *
 * ## Why the whole set rather than a boolean per card
 *
 * A feed page is twelve reels and every card asks the same question. Twelve
 * subscriptions to twelve one-bit queries is twelve cache entries, twelve
 * refetches and twelve re-renders on the screen that is the product. One query
 * holding a `Set` is one entry, and a card reads it synchronously.
 *
 * It is also the shape yuvoy-api#192 is specified to serve (`GET
 * /me/saved/ids`), for the same reason and on the same connection.
 *
 * ## Optimistic, and rolled back honestly
 *
 * Saving is a tap on a feed somebody is scrolling; waiting a round trip to
 * colour a control reads as the app not listening. So the set is updated
 * immediately and the write follows. If the write fails the previous set is put
 * back, which means the control can flip back under the traveller's finger.
 * That is the correct outcome: the alternative is a control that says something
 * is held when it is not, and a wishlist that quietly loses rows is worse than
 * one that admits it could not.
 */
const KEY = ["savedExperienceIds"] as const;

/**
 * The list screen's key, separate from the feed's.
 *
 * Two reads rather than one derived from the other, mirroring `#192`: the feed
 * wants ids and nothing else, twelve times a page. Sharing one key would make
 * every card's subscription re-render when the list screen refetched bodies.
 * Both are invalidated together on a write, which is what keeps them agreeing.
 */
const LIST_KEY = ["savedExperiences"] as const;

/** Shared empty list. Same reasoning as `NONE`. */
const NO_ENTRIES: SavedEntry[] = [];

/**
 * Every save with enough to render it, newest first.
 *
 * Separate hook because only one screen needs it, and a feed that imported it
 * would pay for a read it never looks at.
 */
export function useSavedList() {
  return useQuery({
    queryKey: LIST_KEY,
    queryFn: () => savedStore.listSaved(),
    staleTime: Infinity,
    gcTime: Infinity,
    placeholderData: NO_ENTRIES,
  });
}

/**
 * One array, shared by every card that has nothing saved yet.
 *
 * A fresh `[]` per render changes the identity of every callback built from it,
 * on every render of every card in the feed. This is the screen that is the
 * product, so the allocation matters less than the cascade.
 */
const NONE: string[] = [];

export function useSaved() {
  const client = useQueryClient();

  const { data } = useQuery({
    queryKey: KEY,
    queryFn: () => savedStore.listSavedIds(),
    /*
      The device is the source of truth while this is device-local, so there is
      nothing to go stale against and no window to refetch in. When #192 lands
      and this points at the network, these become the usual pair and the change
      is here rather than in any component.
    */
    staleTime: Infinity,
    gcTime: Infinity,
    /*
      `placeholderData`, not `initialData`, and the difference is the whole
      point.

      A feed must render before storage answers, and `[]` is the honest starting
      point: nothing is KNOWN to be saved, and no card claims otherwise. But
      that is a placeholder, not data. `initialData` would be written into the
      cache as though it were a real answer, and `pnpm qa` refuses it without an
      `initialDataUpdatedAt` for exactly that reason: seeded data with no
      timestamp is treated as infinitely stale and thrown away on hydration,
      which is a silent regression everywhere it matters.

      `placeholderData` is never cached, never suppresses the read, and
      disappears the moment the real answer lands.
    */
    placeholderData: NONE,
  });

  /* `NONE`, never a fresh `[]`: see its declaration. */
  const ids = data ?? NONE;

  const mutation = useMutation({
    mutationFn: async ({
      id,
      slug,
      next,
    }: {
      id: string;
      slug: string;
      next: boolean;
    }) => {
      if (next) await savedStore.addSaved(id, slug);
      else await savedStore.removeSaved(id);
    },
    onMutate: async ({ id, next }) => {
      /* Stop an in-flight read from landing on top of the optimistic set. */
      await client.cancelQueries({ queryKey: KEY });
      const previous = client.getQueryData<string[]>(KEY) ?? [];
      client.setQueryData<string[]>(KEY, (current) => {
        const set = current ?? [];
        if (next) return set.includes(id) ? set : [...set, id];
        return set.filter((x) => x !== id);
      });
      return { previous };
    },
    onError: (_error, _vars, context) => {
      if (context) client.setQueryData<string[]>(KEY, context.previous);
    },
    /*
      Re-read after either outcome. The optimistic value is a guess about what
      storage did, and this is the only thing that makes the control agree with
      what is actually persisted.
    */
    onSettled: () => {
      void client.invalidateQueries({ queryKey: KEY });
      /* The list screen reads the same storage through a different key, so a
         save made on the feed has to reach it too. Invalidated rather than
         written, because the list carries `savedAt` and a slug this call site
         has no reason to assemble. */
      void client.invalidateQueries({ queryKey: LIST_KEY });
    },
  });

  const { mutate } = mutation;

  const isSaved = useCallback(
    (experienceId: string) => ids.includes(experienceId),
    [ids],
  );

  /*
    The SLUG is required, and that is the point of it.

    The id alone cannot be resolved to an experience: the API fetches by slug
    and offers no id filter. Taking it here rather than looking it up later
    means a save is renderable the moment it is made, and a caller that does
    not have a slug is a compile error rather than a row the list silently
    cannot show. See `saved-store`.
  */
  const toggleSaved = useCallback(
    (experienceId: string, slug: string) => {
      const next = !ids.includes(experienceId);
      mutate({ id: experienceId, slug, next });
      return next;
    },
    [ids, mutate],
  );

  return { savedIds: ids, isSaved, toggleSaved };
}
