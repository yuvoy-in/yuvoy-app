"use client";

import { useCallback, useState } from "react";
import Link from "@/components/ui/link";
import Image from "next/image";
import { useQueryClient } from "@tanstack/react-query";
import { qk } from "@/lib/query/policy";
import { deviceSavedStore, type SavedEntry } from "@/lib/feed/saved-store";
import { formatMoney } from "@/lib/format/money";
import {
  describeError,
  EmptyState,
  FailurePanel,
  LoadingState,
  Skeleton,
} from "@/components/states";
import { Screen } from "@/components/chrome/screen";
import { Button, ButtonLink } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { BookmarkFilledIcon } from "@/components/ui/icons";
import { ViewTransition } from "@/lib/motion/view-transition";
import { PICTURE_MOTION, pictureName } from "@/lib/motion/route-motion";
import { handOffPicture } from "@/lib/motion/picture-handoff";
import type { components } from "@/lib/api/schema.gen";

type Experience = components["schemas"]["Experience"];

/*
  Back follows the trail (the approved redesign, 3 Oct 2026): Saved is reached
  from Account and, signed out, from the sign-in screen, and Back returns to
  whichever it was. Account is the fallback.
*/
const BACK = { href: "/account", label: "your account", followTrail: true };

/** Where signing in returns to: here, with the saves now on the account. */
const SIGN_IN_HREF = `/account?next=${encodeURIComponent("/saved")}`;

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
  result: { data?: Experience; isPending: boolean };
  onRemove: (entry: SavedEntry) => void;
}) {
  const { data, isPending } = result;

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
  /*
    Only a listing that never came back. A refresh that fails keeps the tile
    it drew: a dropped connection used to call a saved listing "no longer on
    Yuvoy" and offer to remove it (6 Oct 2026).
  */
  if (!data) {
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
        pictureId={data.heroMedia?.id}
        bookable={data.bookable}
        fromPrice={data.fromPrice}
        unit={data.pricingUnitLabel}
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
  playFrom,
}: {
  children: React.ReactNode;
  count?: number;
  undoBar?: React.ReactNode;
  failure?: ReturnType<typeof describeError> | null;
  /**
   * The first save with a clip, when there is one: the grid's way into the
   * same saves as a reel (the approved redesign, 3 Oct 2026). The reel's Back
   * is the other half of that toggle.
   */
  playFrom?: string | null;
  /**
   * Signed out with saves on this device: say they are here only, and how to
   * keep them. Not said over an empty list, where there is nothing to lose.
   */
  device?: boolean;
}) {
  return (
    <Screen back={BACK} stageLabel="Saved" width="lg">
      <h1 className="font-display tracking-display leading-display text-3xl text-balance sm:text-4xl">
        Saved
      </h1>
      <p className="text-forest/70 text-body mt-3 max-w-prose text-pretty">
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
      {playFrom ? (
        <ButtonLink
          href={`/saved/r/${encodeURIComponent(playFrom)}`}
          variant="outline"
          size="sm"
          className="mt-4"
        >
          Play them
        </ButtonLink>
      ) : null}
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
  pictureId,
  bookable,
  fromPrice,
  unit,
  onRemove,
}: {
  slug: string;
  title: string;
  location?: string;
  posterUrl?: string;
  /** The picture's media id: the listing's gallery opens on it (T03 B). */
  pictureId?: string;
  bookable: boolean;
  fromPrice?: Experience["fromPrice"];
  /** The server's unit phrase, verbatim: "per person", "for the group". */
  unit?: string;
  onRemove: () => void;
}) {
  return (
    <>
      <Link
        href={`/e/${slug}`}
        className="group block"
        /*
          The picture flies from here to the listing's hero (T03 B), and the
          hero has to be showing it when the listing arrives: hand it over
          as the link is followed, on a client-side navigation only.
        */
        onNavigate={pictureId ? () => handOffPicture(pictureId) : undefined}
      >
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
        {posterUrl && pictureId ? (
          /*
            This picture and the listing's frame showing it are one object
            across the screen change (T03 B): it flies to the hero, and home
            again on Back.
          */
          <ViewTransition name={pictureName(pictureId)} {...PICTURE_MOTION}>
            <Poster url={posterUrl} />
          </ViewTransition>
        ) : (
          <Poster url={posterUrl} />
        )}
        <p className="voice-host mt-2 text-sm leading-snug text-balance">
          {title}
        </p>
        {location ? (
          <p className="text-forest/70 mt-0.5 text-xs">{location}</p>
        ) : null}
        <p className="mt-1 text-xs font-bold">
          {!bookable ? (
            "Not taking bookings"
          ) : fromPrice ? (
            <>
              {formatMoney(fromPrice)}
              {/*
                The unit, as the listing says it. Without it a whole-group
                charter read "₹18,000" here, as though it were per person
                (cited in the redesign's before page, 3 Oct 2026).
              */}
              {unit ? (
                <span className="text-forest/70 font-normal"> {unit}</span>
              ) : null}
            </>
          ) : (
            ""
          )}
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

/** The card's picture, on the skeleton's ground while it loads. */
function Poster({ url }: { url?: string }) {
  return (
    <div className="rounded-tile bg-paper-deep relative aspect-[4/5] overflow-hidden">
      {url ? (
        <Image
          src={url}
          alt=""
          fill
          sizes="(min-width: 640px) 240px, 45vw"
          className="object-cover transition-opacity duration-200 group-hover:opacity-90"
          unoptimized={url.startsWith("data:")}
        />
      ) : null}
    </div>
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
      <p className="text-forest/70 text-body text-pretty">
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

export {
  DeviceTile,
  Grid,
  LegacyNote,
  LoadingGrid,
  NothingSaved,
  SavedCard,
  Shell,
  SIGN_IN_HREF,
  UndoBar,
};
