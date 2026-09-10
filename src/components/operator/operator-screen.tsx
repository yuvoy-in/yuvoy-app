"use client";

import Image from "next/image";
import Link from "next/link";
import { useOperator, useOperatorReels } from "@/lib/operator/use-operator";
import { formatFromPrice } from "@/lib/format/money";
import { ErrorState, LoadingState, Skeleton } from "@/components/states";
import { Screen } from "@/components/chrome/screen";
import { Button } from "@/components/ui/button";
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
 * ## What is NOT here yet
 *
 * The link INTO this page from a reel or a listing card. `OperatorSummary`
 * carries `id`, `name` and `verified` and no `slug`, so a card has nothing to
 * link with — confirmed against the live API as well as the document. Raised
 * on yuvoy-app#30; the page is reachable by slug today and the links land when
 * the field does.
 */
export function OperatorScreen({ slug }: { slug: string }) {
  const operator = useOperator(slug);
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
            Everything they run is below. It is worth checking back — this is
            usually a season or a boat out of the water rather than the end.
          </p>
        </Panel>
      ) : null}

      {/* ---------------------------------------------------- what they run */}
      {profile.listings.length > 0 ? (
        <section className="mt-8" aria-labelledby="what-they-run">
          <h2 id="what-they-run" className="label text-forest/75">
            What they run
          </h2>
          <ul className="mt-3 space-y-3">
            {profile.listings.map(({ experience, bookable }) => (
              <li key={experience.id}>
                <ListingCard experience={experience} bookable={bookable} />
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
            Three across at 9:16, newest first. Deliberately not the feed's
            ordering: the feed rotates operators so no business owns the
            scroll, and on one business's own page that rotation means nothing.
          */}
          <ul className="mt-3 grid grid-cols-3 gap-2">
            {clips.map((clip, i) => {
              const poster = clip.media?.posterUrl;
              const target = clip.experience?.slug;
              const title = clip.experience?.title ?? "";
              return (
                <li key={`${clip.media?.id ?? "clip"}-${i}`}>
                  {/*
                    A clip whose listing we do not know is still shown — it is
                    their work — but it is not a link to nowhere.
                  */}
                  {target ? (
                    <Link
                      href={`/e/${target}`}
                      className="rounded-tile bg-abyss ease-interaction relative block aspect-[9/16] overflow-hidden transition-opacity duration-200 hover:opacity-90"
                      aria-label={title || "Open this reel's listing"}
                    >
                      <Poster url={poster} />
                    </Link>
                  ) : (
                    <div className="rounded-tile bg-abyss relative block aspect-[9/16] overflow-hidden">
                      <Poster url={poster} />
                    </div>
                  )}
                </li>
              );
            })}
          </ul>

          {/*
            `complete` is told, not inferred — the contract is explicit: "do
            not stop the grid because a page came back short."

            `isFetchNextPageError` rather than `isError`: on an infinite query
            `isError` is true whenever the LAST fetch failed, which would
            replace a grid full of loaded clips with an error state the moment
            one extra page failed.
          */}
          {reels.hasNextPage ? (
            <div className="mt-4 text-center">
              <Button
                variant="outline"
                disabled={reels.isFetchingNextPage}
                onClick={() => void reels.fetchNextPage()}
              >
                {reels.isFetchingNextPage ? "Loading…" : "Show more"}
              </Button>
              {reels.isFetchNextPageError ? (
                <p role="alert" className="text-terra-deep mt-2 text-sm">
                  That did not load. The reels above are still here — tap again.
                </p>
              ) : null}
            </div>
          ) : null}
        </section>
      ) : null}
    </Screen>
  );
}

/** A poster, or the dark tile that stands in for one. */
function Poster({ url }: { url?: string }) {
  if (!url) return null;
  return (
    <Image
      src={url}
      alt=""
      fill
      sizes="(max-width: 640px) 33vw, 200px"
      className="object-cover"
      unoptimized={url.startsWith("data:")}
    />
  );
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

/**
 * One thing they run.
 *
 * `bookable: false` means **show it and say so**, never hide it: "somebody
 * followed a link looking for a specific thing they saw; an emptier page with
 * no explanation is worse than a card marked 'Not available right now'."
 */
function ListingCard({
  experience,
  bookable,
}: {
  experience: NonNullable<
    ReturnType<typeof useOperator>["data"]
  >["listings"][number]["experience"];
  bookable: boolean;
}) {
  const price = formatFromPrice(experience.fromPrice);

  return (
    <Link
      href={`/e/${experience.slug}`}
      className="rounded-card border-cream-line bg-cream-deep hover:border-forest/40 ease-interaction flex items-center gap-4 border p-3 pr-4 transition-colors duration-200"
    >
      <div className="rounded-tile bg-abyss relative h-24 w-18 shrink-0 overflow-hidden">
        <Poster url={experience.heroMedia?.posterUrl} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="font-bold">{experience.title}</p>
        <p className="text-forest/70 mt-1 text-xs">
          {experience.location ?? "Andaman"}
        </p>
        <p className="mt-2 text-sm font-bold">
          {price ?? (
            <span className="text-forest/70 font-normal">Price on request</span>
          )}
        </p>
        {/*
          `nextAvailable` absent means "no dates in the next 90 days", the same
          as on the feed. It is a meaningful value rather than a missing one,
          so it gets a sentence rather than a blank.
        */}
        <p className="text-forest/70 mt-1 text-xs">
          {!bookable
            ? "Not available right now"
            : (experience.nextAvailable ?? "No dates in the next 90 days")}
        </p>
      </div>
      <ChevronRightIcon className="text-forest/70 size-5 shrink-0" />
    </Link>
  );
}
