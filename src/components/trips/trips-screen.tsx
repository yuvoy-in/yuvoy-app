"use client";

import { useState } from "react";
import Link from "next/link";
import {
  useTravellerSession,
  useMyBookings,
  useInvitedTrips,
  isDeadToken,
} from "@/lib/auth/use-traveller";
import {
  TRIP_TABS,
  TAB_LABEL,
  TAB_EMPTY,
  invitedTripTab,
  sortForTab,
  withinDateFilter,
  type TripTab,
  type InvitedTrip,
} from "@/lib/trips/tabs";
import {
  EmptyState,
  LoadingState,
  Skeleton,
  describeError,
} from "@/components/states";
import { Screen } from "@/components/chrome/screen";
import { Button, ButtonLink } from "@/components/ui/button";
import { ChipButton } from "@/components/ui/chip";
import { Panel } from "@/components/ui/panel";
import { TripCard, InvitedTripCard } from "./trip-card";
import { clockOffsetMs } from "@/lib/booking/clock";
import { marketDayOf } from "@/lib/booking/availability-window";
import {
  DateFilterSheet,
  DateFilterButton,
  type DateRange,
} from "./date-filter";

/**
 * The Trips tab: the account's trips, in tabs, paged, with a date filter.
 *
 * ## One source, which is the whole of yuvoy-app#60
 *
 * This screen used to read TWO lists and merge them: the signed-in number's
 * trips from the API, and a list of bookings saved in this device's IndexedDB.
 * The device list is gone. Trips now reads `GET /me/bookings?tab=` and
 * `GET /me/invited-trips` and nothing else, and shows nothing at all when
 * signed out.
 *
 * Three owner reports on 14 September, and they were one defect:
 *
 * 1. **Upcoming listed cancelled trips.** The API is right and excludes them
 *    from the `upcoming` page. The merge added them back: a device record the
 *    server had not listed on THIS page was treated as "not listed at all" and
 *    drawn under Upcoming, so a cancelled booking saved on the phone appeared
 *    under Upcoming precisely BECAUSE the API had correctly filed it under
 *    Cancelled. The rule was self-defeating for exactly the rows it mattered
 *    for.
 * 2. **Signing out still showed bookings.** The device list does not know about
 *    sessions. `signOut` clears the store now (`forgetAllBookings`), and this
 *    screen would show nothing either way.
 * 3. **The device list served no purpose offline**, because the app does not
 *    load without a network at all. It was paying for a guarantee it could not
 *    keep.
 *
 * Removing the device read fixes all three, which is why the issue asks for
 * the removal rather than for three fixes.
 *
 * ## Tabs, and who decides them
 *
 * The API decides the tab for a trip the traveller BOOKED, sends it as
 * `?tab=`, and guarantees the three "never overlap and together they are the
 * whole list". Nothing is re-derived here, including the rule that a `no_show`
 * is a PAST trip rather than a cancelled one: the boat went.
 *
 * An invited trip carries no tab and is not paged, so `invitedTripTab` places
 * it. That is the one piece of tab logic in this client and it is tested
 * without a screen.
 *
 * ## The booking page is unaffected
 *
 * Checkout still saves its status token, and a booking link still opens
 * offline from that saved copy. That is the booking PAGE's guarantee and it is
 * untouched. What changed is that Trips never reads the store, so the list is
 * the account's and only the account's.
 */
export function TripsScreen() {
  const [tab, setTab] = useState<TripTab>("upcoming");
  const [range, setRange] = useState<DateRange>({});
  const [dateSheet, setDateSheet] = useState(false);

  const { signedIn } = useTravellerSession();
  const server = useMyBookings(signedIn, { tab, ...range });
  const invited = useInvitedTrips(signedIn);

  /*
    `signedIn === undefined` is "the session has not been read yet", and it is
    a third state rather than a falsy one (yuvoy-app#57). Rendering through it
    would show the signed-out screen to somebody who IS signed in, for one
    frame on every visit, and that screen is now a sign-in prompt rather than a
    list, so the flash would be a much louder one than it used to be.
  */
  if (signedIn === undefined) {
    return (
      <Screen>
        <LoadingState label="Loading your trips">
          <div className="space-y-3">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        </LoadingState>
      </Screen>
    );
  }

  if (!signedIn) return <SignedOut />;

  const sessionDead = server.isError && isDeadToken(server.error);

  /*
    Every row across every page fetched so far. The API has already put each
    one in the right tab, so there is no filtering here at all: this list is
    what the server said the tab contains.
  */
  const bookings = server.data?.pages.flatMap((page) => page.bookings) ?? [];

  /*
    The market's day as the SERVER sees it (yuvoy-app#69).

    `invitedTripTab` defaults to `marketToday()`, which reads the device clock,
    and it decides whether a guest's trip is Upcoming or Past. A phone a day out
    files it under the tab they will not look in.

    Anchored to `dataUpdatedAt`, the instant this list resolved, corrected by the
    measured offset. NOT `Date.now() + clockOffsetMs()` read on first render:
    `clockOffsetMs` is recorded from response headers, so before any response has
    landed it is still 0, and a first-render read would use the uncorrected
    device clock on every load, which is the bug rather than the fix. Tying it to
    the response means the offset is known by definition, because the response
    that set `dataUpdatedAt` is the one that recorded it.

    No fallback for `dataUpdatedAt` being 0, and none is reachable: it is only 0
    before the query has ever resolved, and then `invited.data` is undefined, so
    the list this value places is empty and nothing reads it. A `Date.now()`
    fallback would also be an impure read during render, which the React
    compiler refuses.
  */
  const invitedToday = marketDayOf(invited.dataUpdatedAt + clockOffsetMs());

  const invitedForTab = sortForTab(
    (invited.data?.trips ?? [])
      .filter((trip) => invitedTripTab(trip, invitedToday) === tab)
      .filter((trip) => withinDateFilter(trip.localDate, range)),
    tab,
  );

  const empty = bookings.length === 0 && invitedForTab.length === 0;

  return (
    <Screen>
      <Header />

      <div className="mt-4 flex items-center gap-2 overflow-x-auto pb-1">
        <div role="tablist" aria-label="Which trips" className="flex gap-2">
          {TRIP_TABS.map((name) => (
            <ChipButton
              key={name}
              role="tab"
              aria-selected={tab === name}
              pressed={tab === name}
              onClick={() => setTab(name)}
            >
              {TAB_LABEL[name]}
            </ChipButton>
          ))}
        </div>
        <span className="ml-auto">
          <DateFilterButton
            range={range}
            onOpen={() => setDateSheet(true)}
            onClear={() => setRange({})}
          />
        </span>
      </div>

      {dateSheet ? (
        <DateFilterSheet
          range={range}
          onApply={setRange}
          onClose={() => setDateSheet(false)}
        />
      ) : null}

      {/*
        The server's failure is now the whole screen's failure, where it used to
        be a line over a list this device could still show. So it no longer
        promises that anything survived it: there is nothing left to survive.
        A dead session says so plainly, because `retry: false` means it will not
        resolve itself.
      */}
      {server.isError ? (
        <Panel role="alert" className="mt-4 px-4 py-3">
          <p className="text-sm font-bold">
            {sessionDead
              ? "Your sign-in has expired"
              : "We could not load your trips"}
          </p>
          <p className="text-forest/70 mt-1 text-sm">
            {sessionDead
              ? "Sign in again and every trip on your number comes back."
              : describeError(server.error).body}
          </p>
          {sessionDead ? (
            <ButtonLink
              href="/account"
              variant="outline"
              size="sm"
              className="mt-3"
            >
              Sign in again
            </ButtonLink>
          ) : null}
        </Panel>
      ) : null}

      {server.isPending ? (
        <LoadingState label="Loading your trips">
          <div className="mt-6 space-y-3">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        </LoadingState>
      ) : empty ? (
        <EmptyState
          title={TAB_EMPTY[tab]}
          body=""
          action={<ButtonLink href="/">Find something</ButtonLink>}
        />
      ) : (
        <>
          <ul className="mt-6 space-y-3">
            {bookings.map((trip) => (
              <li key={trip.reference || trip.reservationId}>
                <TripCard trip={trip} />
              </li>
            ))}
            {invitedForTab.map((trip) => (
              <li key={`inv:${trip.id}`}>
                <InvitedTripCard trip={trip} />
              </li>
            ))}
          </ul>

          {/*
            A button, not a sentinel. `GET /me/bookings` mints a fresh status
            token per row, so an observer that fetched on scroll would mint
            links nobody asked for.
          */}
          {server.hasNextPage ? (
            <div className="mt-6 flex justify-center">
              <Button
                variant="outline"
                disabled={server.isFetchingNextPage}
                onClick={() => void server.fetchNextPage()}
              >
                {server.isFetchingNextPage ? "Loading…" : "Show more"}
              </Button>
            </div>
          ) : null}

          {server.isFetchNextPageError ? (
            <p
              role="alert"
              className="text-terra-deep mt-3 text-center text-sm"
            >
              That page did not load. Try again.
            </p>
          ) : null}
        </>
      )}
    </Screen>
  );
}

function Header() {
  return (
    <>
      <h1 className="font-display tracking-display text-3xl leading-tight">
        Your trips
      </h1>
      <p className="text-forest/70 mt-2 text-xs">Every trip on your number.</p>
    </>
  );
}

/**
 * Signed out: no tabs, no trips, one way in.
 *
 * Not an empty LIST. There is no list to be empty, and "No upcoming trips"
 * shown to somebody who has booked three would be a false statement rather
 * than an empty state. The copy is the owner's, verbatim.
 *
 * Recovery stays as a quieter second route, because the two are genuinely
 * different: signing in works for a number that has never booked and revokes
 * nothing, while recovery mints one booking's link and rotates the old one.
 * Somebody who booked as a guest on a different phone needs the second.
 */
function SignedOut() {
  return (
    <Screen>
      <Header />
      <EmptyState
        title="Sign in to see your trips"
        body="Your bookings are kept in your account. Sign in with the WhatsApp number you booked with."
        action={<ButtonLink href="/account?next=/trips">Sign in</ButtonLink>}
      />
      <p className="text-forest/70 mt-6 text-center text-sm">
        <Link
          href="/trips/recover"
          className="text-terra-deep tap-target underline"
        >
          Lost your booking link?
        </Link>
      </p>
    </Screen>
  );
}

export type { InvitedTrip };
