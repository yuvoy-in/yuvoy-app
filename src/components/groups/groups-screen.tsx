"use client";

import { useMemo, useState } from "react";
import { useTravellerSession } from "@/lib/auth/use-traveller";
import { usePlaceList } from "@/lib/site/use-place";
import type { PlaceDestination } from "@/lib/site/place-choice";
import { CLUB_WORDS } from "@/lib/groups/club-words";
import { clubPlaces } from "@/lib/groups/clubs";
import { useClubs } from "@/lib/groups/use-clubs";
import { Screen } from "@/components/chrome/screen";
import { ButtonLink } from "@/components/ui/button";
import { ChipButton } from "@/components/ui/chip";
import {
  EmptyState,
  ErrorState,
  LoadingState,
  Skeleton,
} from "@/components/states";
import { ClubCard } from "./club-card";
import { NOT_FOUND_WORDS, isNotFound } from "./form-parts";

/** Until People has its Groups tab (yuvoy-app#222), back goes to the feed. */
const BACK = { href: "/", label: "the feed" };

function GroupsLoading() {
  return (
    <LoadingState label={CLUB_WORDS.loadingList}>
      <div className="flex flex-col gap-3">
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-28 w-full" />
      </div>
    </LoadingState>
  );
}

function NotFound() {
  return (
    <EmptyState
      title={NOT_FOUND_WORDS.title}
      body={NOT_FOUND_WORDS.body}
      action={<ButtonLink href="/">{NOT_FOUND_WORDS.action}</ButtonLink>}
    />
  );
}

/**
 * `/groups` (yuvoy-mobile#386): clubs and communities that meet in a place,
 * one place at a time. Place chips at the top, from the places list
 * (`/me/places` signed in, `/places` signed out) in its display order, with
 * the place last picked on the feed first (the `yv_place` cookie, as
 * `remembered`), or the one `?place=` names, selected. Then the intro, a card
 * per group in the API's order, and the footer.
 *
 * Read again each time it opens and on each chip: no copy of a list is kept
 * past its use. States: loading; no places; empty ("No groups listed for
 * {city} yet."); an error with a retry, never the empty line; and a 404,
 * which is what the API answers while People is closed to this reader, as
 * the app's not-found screen. Follow comes with yuvoy-mobile#392, not here.
 */
export function GroupsScreen({
  place,
  remembered,
}: {
  /** `?place=`: the place to open on, when the list has it. */
  place: string | null;
  /** The feed's remembered place, moved first in the chips. */
  remembered: string | null;
}) {
  const { signedIn } = useTravellerSession();
  const places = usePlaceList({
    initial: null,
    signedIn: signedIn === true,
    enabled: signedIn !== undefined,
  });
  const markets = places.data?.markets;
  const chips = useMemo(
    () =>
      clubPlaces(
        markets ?? [],
        remembered ? { destination: remembered } : null,
      ),
    [markets, remembered],
  );

  if (signedIn === undefined || places.isPending) {
    return (
      <Screen back={BACK}>
        <GroupsLoading />
      </Screen>
    );
  }
  if (!places.data) {
    return (
      <Screen back={BACK}>
        <ErrorState
          error={places.error}
          onRetry={() => void places.refetch()}
          retrying={places.isFetching}
        />
      </Screen>
    );
  }
  if (chips.length === 0) {
    return (
      <Screen back={BACK}>
        <EmptyState title={CLUB_WORDS.noPlaces} />
      </Screen>
    );
  }
  return <GroupsList chips={chips} first={place} />;
}

function GroupsList({
  chips,
  first,
}: {
  chips: PlaceDestination[];
  first: string | null;
}) {
  const [picked, setPicked] = useState<string | null>(first);
  const shown = chips.find((d) => d.key === picked) ?? chips[0]!;
  const list = useClubs(shown.key);

  // People closed to this reader answers 404 for every place: the app's
  // not-found screen, never an error that names People, never the empty line.
  if (isNotFound(list.error)) {
    return (
      <Screen back={BACK}>
        <NotFound />
      </Screen>
    );
  }

  const failed = !list.isPending && (!list.data || list.isRefetchError);
  const rows = list.isPending || failed ? [] : (list.data?.clubs ?? []);

  return (
    <Screen back={BACK}>
      <div className="flex flex-col gap-4 pt-2">
        <h1 className="font-display tracking-display leading-display text-3xl text-balance">
          {CLUB_WORDS.entry}
        </h1>
        <div
          role="group"
          aria-label={CLUB_WORDS.places}
          className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1"
        >
          {chips.map((d) => (
            <ChipButton
              key={d.key}
              pressed={d.key === shown.key}
              onClick={() => {
                if (d.key !== shown.key) setPicked(d.key);
              }}
            >
              {d.name}
            </ChipButton>
          ))}
        </div>
        <p className="text-body text-forest/80 text-pretty">
          {CLUB_WORDS.intro(shown.name)}
        </p>
      </div>

      <div className="mt-6">
        {list.isPending ? (
          <GroupsLoading />
        ) : failed ? (
          <ErrorState
            error={list.error}
            onRetry={() => void list.refetch()}
            retrying={list.isFetching}
          />
        ) : rows.length === 0 ? (
          <EmptyState title={CLUB_WORDS.empty(shown.name)} />
        ) : (
          <>
            <ul className="flex flex-col gap-3">
              {rows.map((club) => (
                <li key={club.clubId}>
                  <ClubCard club={club} />
                </li>
              ))}
            </ul>
            <p className="text-forest/70 mt-6 text-sm text-pretty">
              {CLUB_WORDS.footer}
            </p>
          </>
        )}
      </div>
    </Screen>
  );
}
