"use client";

import { useCallback, useState } from "react";
import { useQueries } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import { CACHE, qk } from "@/lib/query/policy";
import type { SavedEntry } from "@/lib/feed/saved-store";
import {
  useAccountSavedList,
  useDeviceSavedList,
  useSaved,
  useSavedWhere,
  useSavedWrite,
} from "@/lib/feed/use-saved";
import {
  isSignedOutError,
  type SavedExperience,
} from "@/lib/feed/account-saved";
import {
  describeError,
  EmptyState,
  ErrorState,
  FailurePanel,
  StaleNotice,
} from "@/components/states";
import { Button, ButtonLink } from "@/components/ui/button";
import {
  DeviceTile,
  Grid,
  LegacyNote,
  LoadingGrid,
  NothingSaved,
  SavedCard,
  Shell,
  SIGN_IN_HREF,
  UndoBar,
} from "./saved-parts";

/**
 * The wishlist.
 *
 * ## Why it is not a tab
 *
 * The bottom navigation answers "where do I go most often", and this is not
 * that: it is somewhere you go when you already have saves and are ready to
 * decide. It hangs off Account, and `FOCUSED_ROUTE_PREFIXES` carries `/saved`
 * so the bar gets out of the way once you are in it. A fifth tab would cost
 * every traveller a permanent slot to serve a few.
 *
 * ## Two homes, and the screen says which
 *
 * Signed in, saves are on the account (yuvoy-api#192) and this is the same
 * list on every phone. Signed out, they are in this browser only, and the note
 * under the heading says so and offers the fix: signing in moves them onto the
 * account. The screen waits for the session answer before choosing, because
 * the device's empty list shown for a moment to somebody signed in would tell
 * a person with twenty saves they have none.
 */
export function SavedScreen() {
  const where = useSavedWhere();

  if (where === undefined) {
    return (
      <Shell>
        <LoadingGrid />
      </Shell>
    );
  }
  return where === "account" ? <AccountSaved /> : <DeviceSaved />;
}

/* ------------------------------------------------------------- account */

/**
 * The account's saves, bodies included, a page at a time.
 *
 * ## Undo, on the account
 *
 * On the device an undo puts a save back where it was, because the device
 * store takes the original `savedAt`. The account has no call that does that:
 * undo is a new save, and the account lists newest first, so the restored
 * save comes back at the top. The tile is painted there at once rather than
 * where it used to be, because painting it in its old place would only move it
 * on the next refetch, under the traveller's finger.
 */
function AccountSaved() {
  const list = useAccountSavedList(true);
  const { savedIds } = useSaved();
  const write = useSavedWrite();
  const [undo, setUndo] = useState<SavedExperience | null>(null);

  const remove = useCallback(
    (item: SavedExperience) => {
      setUndo(item);
      write.mutate(
        { id: item.id, slug: item.slug, next: false, where: "account" },
        {
          // The tile is back (the write rolled back), so an undo would be for
          // a removal that never happened.
          onError: () => setUndo(null),
        },
      );
    },
    [write],
  );

  const restore = useCallback(() => {
    if (!undo) return;
    write.mutate({
      id: undo.id,
      slug: undo.slug,
      next: true,
      where: "account",
      item: undo,
    });
    setUndo(null);
  }, [undo, write]);

  /*
    Each id once. The API pages on a keyset, so a save made on another device
    between two pages cannot repeat a row; this is the belt to that brace, and
    it keeps a duplicate from becoming a React key collision.
  */
  const seen = new Set<string>();
  const items = (list.data?.pages ?? [])
    .flatMap((page) => page.items)
    .filter((item) => !seen.has(item.id) && Boolean(seen.add(item.id)));

  /*
    The whole set's size, not the pages loaded so far: `GET /me/saved/ids`
    answers every id, so the heading can say "23" while the grid shows the
    first page. Falls back to what is on screen until it lands.
  */
  const count = Math.max(savedIds.length, items.length);
  const undoBar = undo ? <UndoBar onUndo={restore} /> : null;
  const writeFailure =
    write.error && !isSignedOutError(write.error)
      ? describeError(write.error)
      : null;

  if (list.isPending) {
    return (
      <Shell>
        {list.fetchStatus === "paused" ? (
          <EmptyState
            title="You are offline"
            body="Your saved experiences will load as soon as you have signal again."
          />
        ) : (
          <LoadingGrid />
        )}
      </Shell>
    );
  }

  /*
    The error screen only when there is nothing to show. TanStack keeps the
    last pages when a REFETCH fails and still reports `isError`, so testing
    the error alone replaced a list, or an empty list with its Undo bar, with
    "Try again" whenever a background refresh missed. `isLoadingError` is
    that rule by name, and the one every screen now uses.
  */
  if (list.isLoadingError) {
    return (
      <Shell>
        {isSignedOutError(list.error) ? (
          /*
            The session ended underneath the screen. The session answer is
            already being asked again, and it will flip this screen to the
            device; until it lands, the honest thing to say is the fix.
          */
          <EmptyState
            title="You have been signed out"
            body="Sign in again to see the experiences saved on your account."
            action={
              <ButtonLink href={SIGN_IN_HREF} variant="primary" size="md">
                Sign in
              </ButtonLink>
            }
          />
        ) : (
          <ErrorState error={list.error} onRetry={() => void list.refetch()} />
        )}
      </Shell>
    );
  }

  /*
    STALE, and said quietly. A refresh that failed leaves a list that was true
    a minute ago and is still useful, so it stays on screen; what changes is
    that the traveller is told it may be behind.
  */
  const stale =
    list.isRefetchError && !isSignedOutError(list.error) ? (
      <StaleNotice onRefresh={() => void list.refetch()} className="mb-6">
        We could not check for changes just now, so this list may be behind.
      </StaleNotice>
    ) : null;

  if (items.length === 0) {
    return (
      <Shell undoBar={undoBar} failure={writeFailure}>
        {stale}
        <NothingSaved />
      </Shell>
    );
  }

  return (
    <Shell
      count={count}
      undoBar={undoBar}
      failure={writeFailure}
      playFrom={items.find((item) => item.heroMedia)?.id ?? null}
    >
      {stale}
      <Grid>
        {items.map((item) => (
          <li key={item.id} className="relative">
            <SavedCard
              slug={item.slug}
              title={item.title}
              location={item.location}
              posterUrl={item.heroMedia?.posterUrl}
              pictureId={item.heroMedia?.id}
              bookable={item.bookable}
              fromPrice={item.fromPrice}
              unit={item.pricingUnitLabel}
              onRemove={() => remove(item)}
            />
          </li>
        ))}
      </Grid>

      {list.hasNextPage ? (
        <div className="mt-8 flex justify-center">
          <Button
            variant="outline"
            size="md"
            onClick={() => void list.fetchNextPage()}
            disabled={list.isFetchingNextPage}
          >
            {list.isFetchingNextPage ? "Loading more…" : "Show more"}
          </Button>
        </div>
      ) : null}
      {/*
        Not for a 401: the session ended, the session answer is already being
        asked again, and describeError reads a bare 401 as a wrong sign-in
        code ("That code did not work").
      */}
      {list.isFetchNextPageError && !isSignedOutError(list.error) ? (
        <FailurePanel failure={describeError(list.error)} className="mt-4" />
      ) : null}
    </Shell>
  );
}

/* -------------------------------------------------------------- device */

/**
 * This browser's saves, signed out.
 *
 * ## Fetched per save, deliberately
 *
 * The device holds ids and slugs, not bodies, and there is no endpoint that
 * takes a set of slugs, so this is one request per saved experience. That is
 * acceptable HERE and would not be on the feed: a wishlist is small, it is a
 * destination somebody chose, and every request shares `qk.experience(slug)`
 * with the detail page, so opening one afterwards is already warm. Signing in
 * moves the whole list onto the account, which serves bodies in pages.
 */
function DeviceSaved() {
  const { data: entries, isPending } = useDeviceSavedList();
  const write = useSavedWrite();
  const saved = entries ?? [];

  /*
    UNDO LIVES ABOVE THE LIST, NOT ON THE TILE, and that is a correction
    rather than a preference.

    It was on the tile first, and removing the LAST save unmounted the tile
    and took the undo away with it: the screen flipped to its empty state and
    the only way back was gone. A test caught it. The bar belongs above the
    list because it has to outlive any row.
  */
  const [undo, setUndo] = useState<SavedEntry | null>(null);

  const remove = useCallback(
    (entry: SavedEntry) => {
      setUndo(entry);
      write.mutate({
        id: entry.id,
        slug: entry.slug ?? "",
        next: false,
        where: "device",
      });
    },
    [write],
  );

  const restore = useCallback(() => {
    if (!undo) return;
    // `savedAt` is handed back so the row returns WHERE IT WAS. An undo that
    // moved it to the front would read as a second change, not a reversal.
    write.mutate({
      id: undo.id,
      slug: undo.slug ?? "",
      next: true,
      where: "device",
      savedAt: undo.savedAt,
    });
    setUndo(null);
  }, [undo, write]);

  /* The ones this app can actually resolve. See `SavedEntry.slug`. */
  const resolvable = saved.filter(
    (entry): entry is SavedEntry & { slug: string } => Boolean(entry.slug),
  );
  const unresolvable = saved.length - resolvable.length;

  const results = useQueries({
    queries: resolvable.map((entry) => ({
      queryKey: qk.experience(entry.slug),
      queryFn: async ({ signal }: { signal: AbortSignal }) => {
        const { data, error } = await api.GET("/experiences/{slug}", {
          params: { path: { slug: entry.slug } },
          signal,
        });
        if (error) throw error;
        return data;
      },
      ...CACHE.getExperience,
    })),
  });

  const undoBar = undo ? <UndoBar onUndo={restore} /> : null;

  if (isPending) {
    return (
      <Shell>
        <LoadingGrid />
      </Shell>
    );
  }

  if (saved.length === 0) {
    return (
      <Shell undoBar={undoBar}>
        <NothingSaved signedOut />
      </Shell>
    );
  }

  // The first save whose listing has arrived with a clip to play.
  const playFrom =
    results.find((result) => result.data?.heroMedia)?.data?.id ?? null;

  return (
    <Shell count={saved.length} undoBar={undoBar} device playFrom={playFrom}>
      <Grid>
        {resolvable.map((entry, i) => (
          <DeviceTile
            key={entry.id}
            entry={entry}
            /*
              `useQueries` returns results positionally, so this index is the
              same index as `resolvable`. It is read rather than looked up by
              slug because a duplicate slug would otherwise collapse two tiles
              onto one result.
            */
            result={results[i]}
            onRemove={remove}
          />
        ))}
      </Grid>

      {unresolvable > 0 ? <LegacyNote count={unresolvable} /> : null}
    </Shell>
  );
}
