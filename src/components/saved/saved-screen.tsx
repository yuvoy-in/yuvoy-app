"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useQueries, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import { CACHE, qk } from "@/lib/query/policy";
import { deviceSavedStore, type SavedEntry } from "@/lib/feed/saved-store";
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
import { formatMoney } from "@/lib/format/money";
import {
  describeError,
  EmptyState,
  ErrorState,
  FailurePanel,
  LoadingState,
  Skeleton,
  StaleNotice,
} from "@/components/states";
import { Screen } from "@/components/chrome/screen";
import { Button, ButtonLink } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { BookmarkFilledIcon } from "@/components/ui/icons";
import type { components } from "@/lib/api/schema.gen";

type Experience = components["schemas"]["Experience"];

const BACK = { href: "/account", label: "your account" };

/** Where signing in returns to: here, with the saves now on the account. */
const SIGN_IN_HREF = `/account?next=${encodeURIComponent("/saved")}`;

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

  if (list.isError && items.length === 0) {
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

  if (items.length === 0) {
    return (
      <Shell undoBar={undoBar} failure={writeFailure}>
        <NothingSaved />
      </Shell>
    );
  }

  return (
    <Shell count={count} undoBar={undoBar} failure={writeFailure}>
      {/*
        STALE, and said quietly. A refresh that failed leaves a list that was
        true a minute ago and is still useful, so it stays on screen; what
        changes is that the traveller is told it may be behind.
      */}
      {list.isRefetchError && !isSignedOutError(list.error) ? (
        <StaleNotice onRefresh={() => void list.refetch()} className="mb-6">
          We could not check for changes just now, so this list may be behind.
        </StaleNotice>
      ) : null}
      <Grid>
        {items.map((item) => (
          <li key={item.id} className="relative">
            <SavedCard
              slug={item.slug}
              title={item.title}
              location={item.location}
              posterUrl={item.heroMedia?.posterUrl}
              bookable={item.bookable}
              fromPrice={item.fromPrice}
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
      {list.isFetchNextPageError ? (
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

  return (
    <Shell count={saved.length} undoBar={undoBar} device>
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

/**
 * One device save, in whichever of its four states it is in.
 *
 * Loading, gone, not selling, and bookable. The middle two are the ones that
 * make this more than a grid of links: a wishlist is held for weeks, and a
 * listing can be withdrawn or sold out underneath it. Both are rendered rather
 * than filtered out, because a row vanishing with no explanation reads as the
 * app having lost it.
 */
function DeviceTile({
  entry,
  result,
  onRemove,
}: {
  entry: SavedEntry & { slug: string };
  result: { data?: Experience; isPending: boolean; isError: boolean };
  onRemove: (entry: SavedEntry) => void;
}) {
  const { data, isPending, isError } = result;

  if (isPending) {
    return (
      <li>
        <Skeleton className="aspect-[4/5] w-full" />
      </li>
    );
  }

  /*
    GONE. A 404 is a listing that no longer exists, and the only useful thing
    left to do with it is stop holding it. The title is not known, so the tile
    says what it can and offers the one action that helps.
  */
  if (isError || !data) {
    return (
      <li className="border-paper-line rounded-tile flex aspect-[4/5] flex-col justify-between border border-dashed p-3">
        <p className="text-forest/70 text-xs">
          This experience is no longer on Yuvoy.
        </p>
        <Button variant="outline" size="sm" onClick={() => onRemove(entry)}>
          Remove
        </Button>
      </li>
    );
  }

  return (
    <li className="relative">
      <SavedCard
        slug={data.slug}
        title={data.title}
        location={data.location}
        posterUrl={data.heroMedia?.posterUrl}
        bookable={data.bookable}
        fromPrice={data.fromPrice}
        onRemove={() => onRemove(entry)}
      />
    </li>
  );
}

/* -------------------------------------------------------------- shared */

/** The chrome, defined once so every branch above agrees on it. */
function Shell({
  children,
  count,
  undoBar,
  failure,
  device = false,
}: {
  children: React.ReactNode;
  count?: number;
  undoBar?: React.ReactNode;
  failure?: ReturnType<typeof describeError> | null;
  /**
   * Signed out with saves on this device: say they are here only, and how to
   * keep them. Not said over an empty list, where there is nothing to lose.
   */
  device?: boolean;
}) {
  return (
    <Screen back={BACK} stageLabel="Saved" width="lg">
      <h1 className="font-display tracking-display text-3xl leading-tight sm:text-4xl">
        Saved
      </h1>
      <p className="text-forest/70 mt-3 max-w-prose text-sm">
        {count
          ? `${count} ${count === 1 ? "experience" : "experiences"} you are holding on to.`
          : "Experiences you are holding on to."}
        {device ? (
          <>
            {" "}
            Saved in this browser only.{" "}
            <Link
              href={SIGN_IN_HREF}
              className="text-terra-deep tap-target underline underline-offset-4"
            >
              Sign in
            </Link>{" "}
            to keep them on your account, on any phone.
          </>
        ) : null}
      </p>
      {undoBar}
      {failure ? <FailurePanel failure={failure} className="mt-6" /> : null}
      <div className="mt-8">{children}</div>
    </Screen>
  );
}

function Grid({ children }: { children: React.ReactNode }) {
  return (
    <ul className="grid grid-cols-2 gap-x-3 gap-y-6 sm:grid-cols-3">
      {children}
    </ul>
  );
}

function LoadingGrid() {
  return (
    <LoadingState label="Loading your saved experiences">
      <Grid>
        {[0, 1, 2, 3].map((i) => (
          <li key={i}>
            <Skeleton className="aspect-[4/5] w-full" />
          </li>
        ))}
      </Grid>
    </LoadingState>
  );
}

/**
 * The empty state teaches the gesture rather than apologising.
 *
 * Signed out it also offers the way to the account, because an empty browser
 * is not an empty wishlist: somebody who saved on their phone and opens a
 * laptop sees nothing here until they sign in, and should be told that rather
 * than left to conclude the list is gone.
 */
function NothingSaved({ signedOut = false }: { signedOut?: boolean }) {
  return (
    <EmptyState
      title="Nothing saved yet"
      body={
        signedOut
          ? "Tap the bookmark on any experience to hold it here while you decide. Saved some while signed in? Sign in to see them."
          : "Tap the bookmark on any experience to hold it here while you decide."
      }
      action={
        <>
          <ButtonLink href="/" variant="primary" size="md">
            Find something to do
          </ButtonLink>
          {signedOut ? (
            <ButtonLink href={SIGN_IN_HREF} variant="outline" size="md">
              Sign in
            </ButtonLink>
          ) : null}
        </>
      }
    />
  );
}

/**
 * One saved experience that can be shown, from either home.
 *
 * NOT SELLING is said on the price line rather than as a badge over the
 * poster. `bookable: false` is a listing still worth looking at; it is the
 * price that stops being true, so that is the line that changes.
 */
function SavedCard({
  slug,
  title,
  location,
  posterUrl,
  bookable,
  fromPrice,
  onRemove,
}: {
  slug: string;
  title: string;
  location?: string;
  posterUrl?: string;
  bookable: boolean;
  fromPrice?: Experience["fromPrice"];
  onRemove: () => void;
}) {
  return (
    <>
      <Link href={`/e/${slug}`} className="group block">
        {/*
          `paper-deep`, NOT `abyss`, and the design law is right to insist.

          `abyss` behind a poster is sanctioned on the media grounds and in the
          four sheet files that stand in for media, so adding a fifth was an
          option. It is the wrong one here: this grid sits on a white sheet and
          the ground is only ever visible while a poster loads (or, for a
          listing that is no longer public, where the account keeps no
          picture), so the choice is between a near-black rectangle on white
          and a placeholder that matches `Skeleton`.
        */}
        <div className="rounded-tile bg-paper-deep relative aspect-[4/5] overflow-hidden">
          {posterUrl ? (
            <Image
              src={posterUrl}
              alt=""
              fill
              sizes="(min-width: 640px) 240px, 45vw"
              className="object-cover transition-opacity duration-200 group-hover:opacity-90"
              unoptimized={posterUrl.startsWith("data:")}
            />
          ) : null}
        </div>
        <p className="mt-2 text-sm leading-snug font-bold">{title}</p>
        {location ? (
          <p className="text-forest/70 mt-0.5 text-xs">{location}</p>
        ) : null}
        <p className="mt-1 text-xs font-bold">
          {!bookable
            ? "Not taking bookings"
            : fromPrice
              ? formatMoney(fromPrice)
              : ""}
        </p>
      </Link>

      {/*
        The same filled bookmark the feed uses, meaning the same thing: this is
        held, tap to stop holding it. A cross would be a second vocabulary for
        one gesture.
      */}
      <div className="absolute top-2 right-2">
        <IconButton
          label={`Remove ${title} from saved`}
          variant="onDark"
          size="sm"
          onClick={onRemove}
        >
          <BookmarkFilledIcon />
        </IconButton>
      </div>
    </>
  );
}

/**
 * The way back from a removal.
 *
 * Not decoration: the control that removes sits on top of a poster that is
 * also a link, on a phone, in a grid, so a mis-tap is likely and what it
 * destroys is the only record that somebody wanted this.
 *
 * It sits above the list rather than on the row it undoes, because the row is
 * gone. Removing the last save flips the screen to its empty state, and an
 * undo that lived on a tile went with it.
 */
function UndoBar({ onUndo }: { onUndo: () => void }) {
  return (
    <div
      role="status"
      className="bg-forest text-paper rounded-card mt-6 flex items-center justify-between gap-3 px-4 py-3 text-sm"
    >
      <span>Removed from saved.</span>
      <Button variant="paper" size="sm" onClick={onUndo}>
        Undo
      </Button>
    </div>
  );
}

/**
 * Saves made before an entry carried a slug, which cannot be shown here.
 *
 * Counted rather than hidden. These are real rows: the bookmark on the feed
 * still reads as filled for them, so quietly showing a shorter list would make
 * the feed and this screen disagree with no way to tell which was right. One
 * line, one action, and it stops existing once somebody clears them, saves
 * them again from the feed, or signs in (the account can show them: it keeps
 * a summary per id).
 */
function LegacyNote({ count }: { count: number }) {
  const client = useQueryClient();
  const [clearing, setClearing] = useState(false);

  const clear = useCallback(async () => {
    setClearing(true);
    const all = await deviceSavedStore.listSaved();
    await deviceSavedStore.removeSavedIds(
      all.filter((e) => !e.slug).map((e) => e.id),
    );
    void client.invalidateQueries({ queryKey: qk.savedList("device") });
    void client.invalidateQueries({ queryKey: qk.savedIds("device") });
    setClearing(false);
  }, [client]);

  return (
    <div className="border-paper-line mt-10 border-t pt-6">
      <p className="text-forest/70 text-sm">
        {count} {count === 1 ? "save" : "saves"} from an older version of the
        app cannot be shown here. Saving {count === 1 ? "it" : "them"} again
        from the feed will fix {count === 1 ? "it" : "them"}.
      </p>
      <Button
        variant="outline"
        size="sm"
        onClick={() => void clear()}
        disabled={clearing}
        className="mt-3"
      >
        {clearing ? "Clearing…" : "Clear them"}
      </Button>
    </div>
  );
}
