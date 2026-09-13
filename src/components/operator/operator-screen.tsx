"use client";

import Image from "next/image";
import Link from "next/link";
import {
  useOperator,
  useOperatorReels,
  type OperatorProfile,
} from "@/lib/operator/use-operator";
import { paragraphsOf } from "@/lib/format/paragraphs";
import { ErrorState, LoadingState, Skeleton } from "@/components/states";
import { Screen } from "@/components/chrome/screen";
import { ReelGrid } from "@/components/feed/reel-grid";
import { Panel } from "@/components/ui/panel";
import { ChevronRightIcon } from "@/components/ui/icons";

/**
 * T-op — a business, and everything it sells (yuvoy-app#30).
 *
 * ```
 * reel  →  listing  →  OPERATOR  →  everything they have
 * ```
 *
 * The last arrow did not exist. There was no public operator endpoint of any
 * kind, so every business was a name and a logo that went nowhere, and the
 * other clips they had shot were reachable only by scrolling the feed until
 * one came round again.
 *
 * ## How a traveller gets here
 *
 * From the operator's name on a reel card, and from "Who runs this" on a
 * listing — both by `OperatorSummary.slug` (yuvoy-api#152). The page shipped a
 * day before that field did, reachable by URL and from nowhere a traveller
 * actually was.
 *
 * ## Three real facts, and no invented ones
 *
 * Instagram's profile adapted to a business that sells trips rather than
 * posts — with the numbers that would make the header feel full deliberately
 * missing:
 *
 *   - **`verified` is not a rating.** It means every mandatory credential is
 *     on file, verified and unexpired: a statement about evidence we hold. A
 *     tick is right; stars are not.
 *   - **There is no rating and no follower count, and there will not be.**
 *     Reviews do not exist until real completed bookings produce them, and a
 *     number nobody earned is a fabricated claim. An honest header with three
 *     real facts beats a full one with two invented ones.
 *
 * ## What the business says about itself — yuvoy-operator#41
 *
 * `about`, `languages` and `photos` are the operator's own. `operatingSince`
 * and `findThemAt` change only through Yuvoy, because a traveller reads a year
 * and a street as things somebody checked. All five are absent until written,
 * and an absent one draws NOTHING — never a heading over a blank, which on a
 * trust surface reads as a business that could not be bothered rather than
 * one that has not got to it yet.
 */
export function OperatorScreen({
  slug,
  initial,
}: {
  slug: string;
  /**
   * The profile the route already fetched. Seeded so the first paint is
   * server-rendered — this page is indexable, and a body that only exists
   * once JavaScript runs is not indexable content.
   */
  initial?: OperatorProfile;
}) {
  const operator = useOperator(slug, initial);
  const reels = useOperatorReels(
    slug,
    operator.data?.reels ?? null,
    // When the profile answered. Not the clock — see the hook.
    operator.dataUpdatedAt,
  );

  if (operator.isPending) {
    return (
      <Screen>
        <LoadingState label="Loading this business">
          <div className="space-y-4">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-40 w-full" />
          </div>
        </LoadingState>
      </Screen>
    );
  }

  if (operator.isError) {
    return (
      <Screen>
        <ErrorState
          error={operator.error}
          onRetry={() => void operator.refetch()}
        />
      </Screen>
    );
  }

  const profile = operator.data;
  const story = storyOf(profile);
  const pages = reels.data?.pages ?? [];
  const clips = pages.flatMap((p) => p.items ?? []);

  return (
    <Screen>
      {/* ------------------------------------------------------ the header */}
      <header className="flex items-center gap-4">
        {/*
          `logoUrl` is absent when they have not set one, so this falls back to
          a mark of our own rather than rendering a broken image.
        */}
        <div className="rounded-tile bg-cream-deep border-cream-line relative size-20 shrink-0 overflow-hidden border">
          {profile.logoUrl ? (
            <Image
              src={profile.logoUrl}
              alt=""
              fill
              sizes="80px"
              className="object-cover"
              unoptimized={profile.logoUrl.startsWith("data:")}
            />
          ) : (
            /* `/70` is the documented floor for text on cream. This glyph is
               nearly decorative — the business's name is the h1 beside it —
               but it is still text, and the ladder has no exception for
               "large". */
            <span
              aria-hidden="true"
              className="font-display text-forest/70 flex h-full items-center justify-center text-2xl"
            >
              {profile.name.slice(0, 1)}
            </span>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <h1 className="font-display tracking-display flex items-center gap-2 text-3xl leading-tight">
            <span className="min-w-0 break-words">{profile.name}</span>
            {/*
              A tick, never stars. It says every mandatory credential is on
              file, verified and unexpired — evidence we hold, not an opinion
              anybody formed.
            */}
            {profile.verified ? (
              <span
                className="bg-forest text-cream inline-flex size-5 shrink-0 items-center justify-center rounded-full text-xs"
                role="img"
                aria-label="Credentials verified by Yuvoy"
              >
                ✓
              </span>
            ) : null}
          </h1>
          {profile.locations?.length ? (
            <p className="text-forest/70 mt-1 text-sm">
              {profile.locations.join(" · ")}
            </p>
          ) : null}
          {/*
            The year they started, up here beside the tick rather than down
            with what they wrote: a traveller reads it as something Yuvoy
            checked, which is why an operator cannot restate it in place — it
            changes through review.
          */}
          {story.since ? (
            <p className="text-forest/70 mt-1 text-sm">
              {/* One text node, so the served HTML reads as the sentence. */}
              {`Running since ${story.since}`}
            </p>
          ) : null}
        </div>
      </header>

      {/*
        Two counts, both real. No rating and no followers — see the module
        comment: a number nobody earned is a fabricated claim.
      */}
      <dl className="border-cream-line mt-6 flex gap-8 border-y py-4">
        <Count n={profile.listingCount} one="activity" many="activities" />
        <Count n={profile.reelCount} one="reel" many="reels" />
      </dl>

      {/*
        The whole business is paused. Rendered rather than error-ed: somebody
        was sent this link, and one honest line is better than a page that
        looks broken.
      */}
      {!profile.bookable ? (
        <Panel className="mt-6" role="status">
          <p className="text-sm font-bold">
            {profile.name} is not taking bookings right now
          </p>
          <p className="text-forest/70 mt-1.5 text-sm">
            Everything they run is below. It is worth checking back. This is
            usually a season or a boat out of the water rather than the end.
          </p>
        </Panel>
      ) : null}

      {/* ------------------------------------------------- in their words */}
      {story.about.length > 0 ? (
        <section className="mt-8" aria-labelledby="about-them">
          <h2 id="about-them" className="label text-forest/75">
            About
          </h2>
          {/* Paragraphs, because they typed newlines — see `paragraphsOf`. */}
          <div className="text-forest/70 mt-3 max-w-prose space-y-3 text-sm">
            {story.about.map((paragraph, i) => (
              <p key={`${i}-${paragraph.slice(0, 24)}`}>{paragraph}</p>
            ))}
          </div>
        </section>
      ) : null}

      {story.findThemAt || story.languages.length > 0 ? (
        <dl className="mt-6 grid gap-4 sm:grid-cols-2">
          {story.findThemAt ? (
            <div>
              {/*
                Where a traveller physically goes. "Not the registered
                address" — that is compliance data, and often an accountant's
                office on another island — and not a listing's meeting point,
                which can differ per experience.
              */}
              <dt className="label text-forest/75">Find them at</dt>
              <dd className="mt-1 text-sm">{story.findThemAt}</dd>
            </div>
          ) : null}
          {story.languages.length > 0 ? (
            <div>
              {/* "Often the deciding fact for a traveller who is nervous in
                  the water." */}
              <dt className="label text-forest/75">Languages</dt>
              <dd className="mt-1 text-sm">{story.languages.join(" · ")}</dd>
            </div>
          ) : null}
        </dl>
      ) : null}

      {/* ---------------------------------------------------- what they run */}
      {/*
        A DOOR, not the list — yuvoy-app#33. The owner liked this page and
        asked for one change to it: "What they run" is a proper page of its
        own at `/o/{slug}/listings`, so the profile stays a profile.

        It was a stack of full listing cards between the story and the reels,
        which on a business with eight listings pushed their footage below two
        screens of rows — on a page whose whole argument is the footage. The
        count is stated on the door so the tap is informed rather than hopeful.
      */}
      {profile.listings.length > 0 ? (
        <Link
          href={`/o/${profile.slug}/listings`}
          className="rounded-card border-cream-line bg-cream-deep hover:border-forest/40 ease-interaction mt-8 flex items-center gap-4 border p-4 transition-colors duration-200"
        >
          <div className="min-w-0 flex-1">
            <p className="font-bold">What they run</p>
            {/*
              A sentence, not a `<Count>`. `Count` is a `<dt>`/`<dd>` pair and
              only means anything inside the header's `<dl>`; used here it was
              a description list item with no list, which axe calls a serious
              structure violation and a screen reader reads as a stray term.
              Caught by the accessibility suite on the deployed shape rather
              than by looking, which is the whole reason that suite runs on
              every route.
            */}
            <p className="text-forest/70 mt-1 text-sm">
              {profile.listings.length}{" "}
              {profile.listings.length === 1 ? "experience" : "experiences"}
            </p>
          </div>
          <ChevronRightIcon className="text-forest/70 size-5 shrink-0" />
        </Link>
      ) : null}

      {/* ------------------------------------------------------- the photos */}
      {story.photos.length > 0 ? (
        <section className="mt-10" aria-labelledby="their-photos">
          <h2 id="their-photos" className="label text-forest/75">
            Photos
          </h2>
          {/*
            The boat, the shop, the crew — "deliberately not the experience:
            that is what the reels are, and a gallery standing in for footage
            is the failure a video-first feed exists to prevent." So they come
            after what the business runs, never ahead of it.

            No caption travels with a photograph, and a description written
            here would be a claim about a picture nobody here has seen. Whose
            it is, and which of how many, is true of every one.
          */}
          <ul className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
            {story.photos.map((url, i) => (
              <li
                key={`${i}-${url}`}
                className="rounded-tile bg-abyss relative aspect-4/3 overflow-hidden"
              >
                <Image
                  src={url}
                  alt={`${profile.name}, photo ${i + 1} of ${story.photos.length}`}
                  fill
                  sizes="(max-width: 640px) 50vw, 256px"
                  className="object-cover"
                  unoptimized={url.startsWith("data:")}
                />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* --------------------------------------------------- the reel grid */}
      {clips.length > 0 ? (
        <section className="mt-10" aria-labelledby="their-reels">
          <h2 id="their-reels" className="label text-forest/75">
            Their reels
          </h2>
          {/*
            Tapping a tile PLAYS that reel — yuvoy-app#33. It used to open the
            reel's listing, which is the one thing a poster does not promise:
            somebody tapping a clip means the clip.

            Swiping from there moves through this business's reels only, in
            this same order, and back returns here. The order is the server's
            and is deliberately not the feed's: the feed rotates operators so
            no business owns the scroll, and on one business's own page that
            rotation means nothing.
          */}
          <ReelGrid
            className="mt-3"
            label={`Reels by ${profile.name}`}
            items={clips}
            hrefFor={(reel) =>
              reel.media?.id ? `/o/${profile.slug}/r/${reel.media.id}` : null
            }
            hasNextPage={reels.hasNextPage}
            isFetchingNextPage={reels.isFetchingNextPage}
            isFetchNextPageError={reels.isFetchNextPageError}
            fetchNextPage={() => void reels.fetchNextPage()}
          />
        </section>
      ) : null}
    </Screen>
  );
}

/**
 * What the business has told travellers, read so that "not written" has
 * exactly one shape.
 *
 * The contract promises absent-when-empty, and the live API keeps it. Read
 * defensively all the same, because every miss is the same visible defect — a
 * heading over a blank: whitespace-only prose, a `null` from a column that
 * lost its `omitempty`, an empty string inside `languages`.
 */
function storyOf(profile: OperatorProfile) {
  const since = profile.operatingSince;
  return {
    about: paragraphsOf(profile.about),
    since: typeof since === "number" && Number.isInteger(since) ? since : null,
    findThemAt: textOf(profile.findThemAt),
    languages: listOf(profile.languages),
    photos: listOf(profile.photos),
  };
}

/** A trimmed, non-empty string, or nothing. */
function textOf(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/** The non-empty strings of something that may not even be a list. */
function listOf(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map(textOf).filter((v): v is string => v !== null);
}

/**
 * One real number about this business.
 *
 * The word is the `<dt>` and the number the `<dd>`, which is what a
 * description list means — and it stops the label being said twice. A first
 * draft carried the word in an `sr-only` `<dt>` AND visibly in the `<dd>`, so
 * a screen reader read "activities activities".
 *
 * Visually the number leads, which is the opposite of source order, so the
 * pair is reversed with flex rather than by putting the label in twice.
 */
function Count({ n, one, many }: { n: number; one: string; many: string }) {
  return (
    <div className="flex flex-row-reverse items-baseline justify-end gap-1.5">
      <dt className="text-forest/70 text-sm">{n === 1 ? one : many}</dt>
      <dd className="text-xl font-bold tabular-nums">{n}</dd>
    </div>
  );
}
