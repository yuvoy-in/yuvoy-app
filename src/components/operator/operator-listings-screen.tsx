"use client";

import { useOperator, type OperatorProfile } from "@/lib/operator/use-operator";
import {
  ErrorState,
  LoadingState,
  EmptyState,
  Skeleton,
} from "@/components/states";
import { Screen } from "@/components/chrome/screen";
import { ListingCard } from "./listing-card";

/**
 * What a business runs — `/o/{slug}/listings`, yuvoy-app#33.
 *
 * The owner liked the profile and asked for one change to it: this list stops
 * being a section between the story and the reels and becomes a proper page.
 * On a business with eight listings the section pushed their footage below two
 * screens of rows, on a page whose whole argument is the footage.
 *
 * `GET /operators/{slug}` already returns `listings[]`, so this is the same
 * request the profile makes and the same cache entry — arriving here from the
 * profile costs nothing, and arriving cold is one request.
 *
 * A focused screen: it carries its own way back to the profile rather than the
 * tab bar, because it is a place a traveller goes INTO from one screen and
 * returns from.
 */
export function OperatorListingsScreen({
  slug,
  initial,
}: {
  slug: string;
  initial?: OperatorProfile;
}) {
  const operator = useOperator(slug, initial);
  const back = { href: `/o/${slug}`, label: "the business" };

  if (operator.isPending) {
    return (
      <Screen back={back}>
        <LoadingState label="Loading what they run">
          <div className="space-y-3">
            <Skeleton className="h-28 w-full" />
            <Skeleton className="h-28 w-full" />
          </div>
        </LoadingState>
      </Screen>
    );
  }

  if (operator.isError) {
    return (
      <Screen back={back}>
        <ErrorState
          error={operator.error}
          onRetry={() => void operator.refetch()}
        />
      </Screen>
    );
  }

  const profile = operator.data;

  return (
    <Screen back={{ href: `/o/${slug}`, label: profile.name }}>
      <h1 className="font-display tracking-display text-3xl leading-tight">
        What they run
      </h1>
      <p className="text-forest/70 mt-2 text-sm">{profile.name}</p>

      {profile.listings.length === 0 ? (
        /*
          A business with nothing on sale. Reachable: the profile only shows
          the door when there is something behind it, but this address can be
          typed, shared, or opened from a stale page. It says what is true
          rather than showing an empty list.
        */
        <div className="mt-8">
          <EmptyState
            title="Nothing on sale right now"
            body="This business has not put anything up for the moment. Their reels are on their page."
          />
        </div>
      ) : (
        <ul className="mt-6 space-y-3">
          {profile.listings.map(({ experience, bookable }) => (
            <li key={experience.id}>
              <ListingCard experience={experience} bookable={bookable} />
            </li>
          ))}
        </ul>
      )}
    </Screen>
  );
}
