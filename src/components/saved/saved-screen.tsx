"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useQueries, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import { CACHE, qk } from "@/lib/query/policy";
import { savedStore, type SavedEntry } from "@/lib/feed/saved-store";
import { useSavedList } from "@/lib/feed/use-saved";
import { formatMoney } from "@/lib/format/money";
import { EmptyState, LoadingState, Skeleton } from "@/components/states";
import { Screen } from "@/components/chrome/screen";
import { Button, ButtonLink } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { BookmarkFilledIcon } from "@/components/ui/icons";
import type { components } from "@/lib/api/schema.gen";

type Experience = components["schemas"]["Experience"];

const BACK = { href: "/account", label: "your account" };

/**
 * The wishlist, and the first screen saving has ever had.
 *
 * ## Why this exists
 *
 * The bookmark on the feed has been writing to storage with nowhere to read it
 * back. Every save was a tap into a void: a traveller could hold four things
 * while deciding and then had no way to find any of them. A control that goes
 * nowhere is shipped-broken, which is why this is a P0 rather than a feature.
 *
 * ## Why it is not a tab
 *
 * The bottom navigation answers "where do I go most often", and this is not
 * that: it is somewhere you go when you already have saves and are ready to
 * decide. It hangs off Account, and `FOCUSED_ROUTE_PREFIXES` carries `/saved`
 * so the bar gets out of the way once you are in it. A fifth tab would cost
 * every traveller a permanent slot to serve a few.
 *
 * ## One device, and the copy says so
 *
 * Saves live in this browser until yuvoy-api#192 puts them on the account.
 * That is a real limitation and the note under the heading states it rather
 * than letting somebody discover it by switching phones. It is one line and it
 * disappears with the backend, not with a copy change.
 *
 * ## Fetched per save, deliberately
 *
 * There is no endpoint that takes a set of ids or slugs, so this is one
 * request per saved experience. That is acceptable HERE and would not be on
 * the feed: a wishlist is small, it is a destination somebody chose, and every
 * request shares `qk.experience(slug)` with the detail page, so opening one
 * afterwards is already warm. If a list ever grows past a screen or two, that
 * is the moment to ask #192 for bodies rather than to paginate this.
 */
export function SavedScreen() {
  const { data: entries, isPending } = useSavedList();
  const client = useQueryClient();
  const saved = entries ?? [];

  /*
    UNDO LIVES HERE, NOT ON THE TILE, and that is a correction rather than a
    preference.

    It was on the tile first, and removing the LAST save unmounted the tile
    and took the undo away with it: the screen flipped to its empty state and
    the only way back was gone. A test caught it. The bar belongs above the
    list because it has to outlive any row.
  */
  const [undo, setUndo] = useState<SavedEntry | null>(null);

  const refresh = useCallback(() => {
    void client.invalidateQueries({ queryKey: ["savedExperiences"] });
    void client.invalidateQueries({ queryKey: ["savedExperienceIds"] });
  }, [client]);

  const remove = useCallback(
    async (entry: SavedEntry) => {
      await savedStore.removeSaved(entry.id);
      setUndo(entry);
      refresh();
    },
    [refresh],
  );

  const restore = useCallback(async () => {
    if (!undo) return;
    // `savedAt` is handed back so the row returns WHERE IT WAS. An undo that
    // moved it to the front would read as a second change, not a reversal.
    await savedStore.addSaved(undo.id, undo.slug ?? "", undo.savedAt);
    setUndo(null);
    refresh();
  }, [undo, refresh]);

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

  const undoBar = undo ? <UndoBar onUndo={() => void restore()} /> : null;

  if (isPending) {
    return (
      <Shell>
        <LoadingState label="Loading your saved experiences">
          <Grid>
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="aspect-[4/5] w-full" />
            ))}
          </Grid>
        </LoadingState>
      </Shell>
    );
  }

  if (saved.length === 0) {
    return (
      <Shell undoBar={undoBar}>
        <EmptyState
          title="Nothing saved yet"
          body="Tap the bookmark on any experience to hold it here while you decide."
          action={
            <ButtonLink href="/" variant="primary" size="md">
              Find something to do
            </ButtonLink>
          }
        />
      </Shell>
    );
  }

  return (
    <Shell count={saved.length} undoBar={undoBar}>
      <Grid>
        {resolvable.map((entry, i) => (
          <SavedTile
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

/** The chrome, defined once so every branch above agrees on it. */
function Shell({
  children,
  count,
  undoBar,
}: {
  children: React.ReactNode;
  count?: number;
  undoBar?: React.ReactNode;
}) {
  return (
    <Screen back={BACK} stageLabel="Saved" width="lg">
      <h1 className="font-display tracking-display text-3xl leading-tight sm:text-4xl">
        Saved
      </h1>
      <p className="text-forest/70 mt-3 max-w-prose text-sm">
        {count
          ? `${count} ${count === 1 ? "experience" : "experiences"} you are holding on to. Saved in this browser only, so they will not follow you to another phone.`
          : "Experiences you are holding on to."}
      </p>
      {undoBar}
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

/**
 * One saved experience, in whichever of its four states it is in.
 *
 * Loading, gone, not selling, and bookable. The middle two are the ones that
 * make this more than a grid of links: a wishlist is held for weeks, and a
 * listing can be withdrawn or sold out underneath it. Both are rendered rather
 * than filtered out, because a row vanishing with no explanation reads as the
 * app having lost it.
 */
function SavedTile({
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

  const poster = data.heroMedia?.posterUrl;

  return (
    <li className="relative">
      <Link href={`/e/${data.slug}`} className="group block">
        {/*
          `paper-deep`, NOT `abyss`, and the design law is right to insist.

          `abyss` behind a poster is sanctioned on the media grounds and in the
          four sheet files that stand in for media, so adding a fifth was an
          option. It is the wrong one here: this grid sits on a white sheet and
          the ground is only ever visible while a poster loads, so the choice
          is between a near-black rectangle flashing on white and a placeholder
          that matches `Skeleton`. It is also one less exception on a list
          whose own comment warns against signing blank cheques.
        */}
        <div className="rounded-tile bg-paper-deep relative aspect-[4/5] overflow-hidden">
          {poster ? (
            <Image
              src={poster}
              alt=""
              fill
              sizes="(min-width: 640px) 240px, 45vw"
              className="object-cover transition-opacity duration-200 group-hover:opacity-90"
              unoptimized={poster.startsWith("data:")}
            />
          ) : null}
        </div>
        <p className="mt-2 text-sm leading-snug font-bold">{data.title}</p>
        {data.location ? (
          <p className="text-forest/70 mt-0.5 text-xs">{data.location}</p>
        ) : null}
        <p className="mt-1 text-xs font-bold">
          {/*
            NOT SELLING is said here rather than as a badge over the poster.
            `bookable: false` is a 200 and the listing is still worth looking
            at; it is the price line that stops being true, so that is the line
            that changes. See the field's own note in the contract.
          */}
          {!data.bookable
            ? "Not taking bookings"
            : data.fromPrice
              ? formatMoney(data.fromPrice)
              : ""}
        </p>
      </Link>

      {/*
        The same filled bookmark the feed uses, meaning the same thing: this is
        held, tap to stop holding it. A cross would be a second vocabulary for
        one gesture.
      */}
      {/*
        The same filled bookmark the feed uses, meaning the same thing: this is
        held, tap to stop holding it. A cross would be a second vocabulary for
        one gesture.
      */}
      <div className="absolute top-2 right-2">
        <IconButton
          label={`Remove ${data.title} from saved`}
          variant="onDark"
          size="sm"
          onClick={() => onRemove(entry)}
        >
          <BookmarkFilledIcon />
        </IconButton>
      </div>
    </li>
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
 * Saves made before an entry carried a slug, which cannot be shown.
 *
 * Counted rather than hidden. These are real rows: the bookmark on the feed
 * still reads as filled for them, so quietly showing a shorter list would make
 * the feed and this screen disagree with no way to tell which was right. One
 * line, one action, and it stops existing once somebody clears them or saves
 * them again from the feed.
 */
function LegacyNote({ count }: { count: number }) {
  const client = useQueryClient();
  const [clearing, setClearing] = useState(false);

  const clear = useCallback(async () => {
    setClearing(true);
    const all = await savedStore.listSaved();
    await Promise.all(
      all.filter((e) => !e.slug).map((e) => savedStore.removeSaved(e.id)),
    );
    void client.invalidateQueries({ queryKey: ["savedExperiences"] });
    void client.invalidateQueries({ queryKey: ["savedExperienceIds"] });
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
