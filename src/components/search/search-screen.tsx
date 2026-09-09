"use client";

import { useState, useDeferredValue } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import type { components } from "@/lib/api/schema.gen";
import { CACHE, qk } from "@/lib/query/policy";
import { formatFromPrice } from "@/lib/format/money";
import {
  EmptyState,
  ErrorState,
  LoadingState,
  Skeleton,
} from "@/components/states";
import { Field } from "@/components/ui/field";
import { Screen } from "@/components/chrome/screen";
import { ButtonLink } from "@/components/ui/button";
import { ChipButton } from "@/components/ui/chip";
import { ChevronRightIcon, SearchIcon } from "@/components/ui/icons";
import { marketDays, marketToday } from "@/lib/booking/availability-window";
import {
  categoryFacets,
  destinationFacets,
  FACET_SAMPLE,
} from "@/lib/search/facets";

/**
 * The Search tab — date-first discovery.
 *
 * The day chips are the point, not the text box. Somebody with three days on
 * an island is asking "what can I do on Thursday", not "show me everything
 * that mentions diving". `bookableOn` answers exactly that: only what can
 * actually be booked that day, in the market's timezone.
 *
 * ## Nothing is asked until something is asked for
 *
 * The contract is explicit: an empty `q` **with no filters** returns nothing,
 * not everything — "'everything' is what the feed is for, and a search box
 * that shows the whole catalog when you clear it looks broken." For a month
 * this screen called `/search` with no `q` and no day the moment it mounted,
 * and rendered the catalogue it got back — from a mock that answered
 * "everything".
 *
 * So the default state is a prompt, and the query is enabled only once there
 * is a word, a day, a place or a kind to search by.
 *
 * ## The three chip groups, and why the filters work at all now
 *
 * "A day alone is a real question" was this file's stated design and it was
 * FALSE against the live API until 9 Sep 2026. `SearchExperiences` returned
 * before it read `bookableOn` or `destinationKey`, so every chip tapped
 * without text rendered "Nothing on that day" over real departures. Raised as
 * yuvoy-api#132 and fixed in yuvoy-api#133: text and filters are independent
 * now, either alone is a real search, and together they intersect.
 *
 * That fix also brought `category`, which is what makes the third group
 * possible (yuvoy-app#24).
 *
 * The chips themselves are DERIVED from the catalogue rather than hardcoded —
 * see `lib/search/facets.ts` for why, and for why a chip that would return
 * nothing is not shown at all.
 *
 * ## Arriving with a destination already chosen
 *
 * `/go/<code>` sends a traveller here with `?destinationKey=…` when the
 * printed card names a place (yuvoy-app#27). Read once as the initial state
 * rather than held in the URL: from that moment the chips are the truth, and
 * a URL that disagreed with them after the first tap would be worse than one
 * that never claimed to.
 */

type Category = components["schemas"]["Category"];

const DAYS_SHOWN = 10;

export function SearchScreen() {
  const params = useSearchParams();
  const [q, setQ] = useState("");
  const [bookableOn, setBookableOn] = useState<string | undefined>(undefined);
  /*
    Seeded from the URL once, by `useState`'s initialiser rather than an
    effect: a QR card that names a place should land on that place already
    chosen, without a frame of the unfiltered screen first.

    Not validated against the facet list here. The chips have not loaded yet
    on first render, and a key that matches nothing simply returns an empty
    page from the server — which is the honest answer for a card printed for a
    destination whose listings have since come down.
  */
  const [destinationKey, setDestinationKey] = useState<string | undefined>(
    () => params?.get("destinationKey")?.trim() || undefined,
  );
  const [category, setCategory] = useState<string | undefined>(undefined);
  // Keeps typing responsive on a mid-range Android without debounce timers.
  const deferredQ = useDeferredValue(q);

  const days = marketDays(DAYS_SHOWN);

  const term = deferredQ.trim();
  const asking =
    term.length > 0 ||
    bookableOn !== undefined ||
    destinationKey !== undefined ||
    category !== undefined;

  /*
    The chip source. One cheap read of the browse surface, cached for an hour
    like the catalog index it resembles — the set of places and kinds on offer
    changes when a listing is published, not between taps.

    Deliberately NOT gated on `asking`: the chips are how somebody starts, so
    waiting for them to type would show an empty rail under a prompt telling
    them to tap one.

    Soft-failing. If this read fails the chips are absent and the text box
    still searches; taking the whole screen to an error boundary over a chip
    rail would be the wrong trade, and it is the same call `/e/[slug]` makes
    about its gallery.
  */
  const facets = useQuery({
    queryKey: qk.searchFacets(),
    queryFn: async ({ signal }) => {
      const { data, error } = await api.GET("/experiences", {
        params: { query: { limit: FACET_SAMPLE } },
        signal,
      });
      if (error) throw error;
      return data.items;
    },
    ...CACHE.catalogIndex,
  });

  const places = destinationFacets(facets.data ?? []);
  const kinds = categoryFacets(facets.data ?? []);

  const search = useQuery({
    queryKey: qk.search(term, bookableOn, destinationKey, category),
    enabled: asking,
    queryFn: async ({ signal }) => {
      const { data, error } = await api.GET("/search", {
        params: {
          query: {
            ...(term ? { q: term } : {}),
            ...(bookableOn ? { bookableOn } : {}),
            ...(destinationKey ? { destinationKey } : {}),
            /*
              `category` is a CLOSED enum and an unknown value is a `400`, not
              an empty page — the contract is explicit that the two must be
              distinguishable. Every value sent here came off a published
              listing a moment ago, so a 400 would mean this build and the
              server disagree about the vocabulary. It surfaces as the error
              state rather than being swallowed, because that is a bug worth
              seeing.
            */
            ...(category
              ? { category: category as NonNullable<Category> }
              : {}),
          },
        },
        signal,
      });
      if (error) throw error;
      return data;
    },
    ...CACHE.search,
  });

  return (
    <Screen>
      <h1 className="font-display tracking-display text-3xl leading-tight">
        What is on
      </h1>

      <Field
        className="mt-5"
        label="Search experiences"
        labelHidden
        type="search"
        shape="pill"
        leading={<SearchIcon className="size-5" />}
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Diving, boats, Havelock…"
      />

      {/* Date first. The chips are the primary control. */}
      <div className="mt-5">
        <span className="label text-forest/75">Which day</span>
        <div
          className="-mx-6 mt-2.5 flex gap-2 overflow-x-auto px-6 pb-1 sm:-mx-10 sm:px-10"
          role="group"
          aria-label="Filter by day"
        >
          <ChipButton
            size="lg"
            pressed={bookableOn === undefined}
            onClick={() => setBookableOn(undefined)}
          >
            Any day
          </ChipButton>
          {days.map((d) => (
            <ChipButton
              key={d}
              size="lg"
              pressed={bookableOn === d}
              onClick={() => setBookableOn(d)}
            >
              {dayLabel(d)}
            </ChipButton>
          ))}
        </div>
      </div>

      {/*
        WHERE — yuvoy-app#24.

        Andaman is not one place: getting between Port Blair and Havelock is a
        ferry and most of a morning, so somebody staying on one island is
        browsing an island rather than a market, and every result from another
        one is noise they have to read and reject.

        Rendered only when there is more than one place to choose between. A
        single chip beside an "Anywhere" chip is a control that cannot change
        the answer, which is the same thing as no control and costs a row of
        the screen to say so.
      */}
      {places.length > 1 ? (
        <div className="mt-5">
          <span className="label text-forest/75">Where</span>
          <div
            className="-mx-6 mt-2.5 flex gap-2 overflow-x-auto px-6 pb-1 sm:-mx-10 sm:px-10"
            role="group"
            aria-label="Filter by place"
          >
            <ChipButton
              size="lg"
              pressed={destinationKey === undefined}
              onClick={() => setDestinationKey(undefined)}
            >
              Anywhere
            </ChipButton>
            {places.map((place) => (
              <ChipButton
                key={place.key}
                size="lg"
                pressed={destinationKey === place.key}
                onClick={() =>
                  setDestinationKey(
                    destinationKey === place.key ? undefined : place.key,
                  )
                }
              >
                {/* The server's display name, verbatim. "Havelock (Swaraj
                    Dweep)" is not something any title-casing of
                    `andaman/havelock` produces. */}
                {place.label}
              </ChipButton>
            ))}
          </div>
        </div>
      ) : null}

      {/*
        WHAT — the closed browse vocabulary, and only the parts of it a
        published listing actually carries. Twelve chips where ten return
        nothing is a worse screen than two that work.
      */}
      {kinds.length > 1 ? (
        <div className="mt-5">
          <span className="label text-forest/75">What kind of day</span>
          <div
            className="-mx-6 mt-2.5 flex gap-2 overflow-x-auto px-6 pb-1 sm:-mx-10 sm:px-10"
            role="group"
            aria-label="Filter by kind"
          >
            <ChipButton
              size="lg"
              pressed={category === undefined}
              onClick={() => setCategory(undefined)}
            >
              Anything
            </ChipButton>
            {kinds.map((kind) => (
              <ChipButton
                key={kind.key}
                size="lg"
                pressed={category === kind.key}
                onClick={() =>
                  setCategory(category === kind.key ? undefined : kind.key)
                }
              >
                {kind.label}
              </ChipButton>
            ))}
          </div>
        </div>
      ) : null}

      <div className="mt-8">
        {!asking ? (
          <EmptyState
            title="Pick a day or a place, or type what you want to do"
            body="Search finds one thing. Everything that is on is in the feed."
            action={
              <>
                <ButtonLink href="/">Browse the feed</ButtonLink>
                <ButtonLink href="/guides" variant="outline">
                  Read the guides
                </ButtonLink>
              </>
            }
          />
        ) : search.isPending ? (
          <LoadingState label="Searching">
            <div className="space-y-3">
              <Skeleton className="h-28 w-full" />
              <Skeleton className="h-28 w-full" />
            </div>
          </LoadingState>
        ) : search.isError ? (
          <ErrorState
            error={search.error}
            onRetry={() => void search.refetch()}
          />
        ) : search.data.items.length === 0 ? (
          /*
            The empty state names the filter most likely to be the cause.

            The day is checked first because it is the narrowest — ten dates
            against three islands — and because "Nothing on that day" is a
            claim about supply that the traveller can act on by moving one
            chip. Naming the wrong one sends them to re-word a search that was
            never the problem.

            "the chips only show what is genuinely bookable" came off the day
            branch: it was never true of the day chips, which are ten calendar
            dates, and it is now true of the OTHER two rails, which is where
            it is said instead.
          */
          <EmptyState
            title={
              bookableOn
                ? "Nothing on that day"
                : destinationKey || category
                  ? "Nothing there yet"
                  : "Nothing matches"
            }
            body={
              bookableOn
                ? "No operator has a departure we can sell for that date. Try another day, or widen the other filters."
                : destinationKey || category
                  ? "Nothing matches all of those together. Take one filter off and see."
                  : "Try a shorter word, or tap a day or a place instead."
            }
          />
        ) : (
          <ul className="space-y-3">
            {search.data.items.map((e) => {
              const price = formatFromPrice(e.fromPrice);
              return (
                <li key={e.id}>
                  <Link
                    href={`/e/${e.slug}`}
                    className="rounded-card border-cream-line bg-cream-deep hover:border-forest/40 ease-interaction flex items-center gap-4 border p-3 pr-4 transition-colors duration-200"
                  >
                    {/* The poster, at the card's inner radius. */}
                    <div className="rounded-tile bg-abyss relative h-24 w-18 shrink-0 overflow-hidden">
                      {e.heroMedia ? (
                        <Image
                          src={e.heroMedia.posterUrl}
                          alt=""
                          fill
                          sizes="72px"
                          className="object-cover"
                          unoptimized={e.heroMedia.posterUrl.startsWith(
                            "data:",
                          )}
                        />
                      ) : null}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-bold">{e.title}</p>
                      <p className="text-forest/70 mt-1 text-xs">
                        {e.location ?? "Andaman"} ·{" "}
                        {e.bookingMode === "allotment"
                          ? "Instant book"
                          : "Operator confirms"}
                      </p>
                      <p className="mt-2 text-sm font-bold">
                        {price ?? (
                          <span className="text-forest/70 font-normal">
                            Price on request
                          </span>
                        )}
                      </p>
                    </div>
                    <ChevronRightIcon className="text-forest/70 size-5 shrink-0" />
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </Screen>
  );
}

function dayLabel(date: string): string {
  const d = new Date(`${date}T12:00:00+05:30`);
  const today = marketToday();
  if (date === today) return "Today";
  return new Intl.DateTimeFormat("en-IN", {
    weekday: "short",
    day: "numeric",
    timeZone: "Asia/Kolkata",
  }).format(d);
}
