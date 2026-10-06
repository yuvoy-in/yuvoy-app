"use client";

import { useRef, useState } from "react";
import {
  useTravellerSession,
  useMyBookings,
  useInvitedTrips,
  isDeadToken,
} from "@/lib/auth/use-traveller";
import {
  TAB_EMPTY,
  invitedTripTab,
  sortForTab,
  withinDateFilter,
  type TripTab,
  type InvitedTrip,
  type ServerTrip,
} from "@/lib/trips/tabs";
import {
  EmptyState,
  LoadingState,
  Skeleton,
  describeError,
} from "@/components/states";
import { Screen } from "@/components/chrome/screen";
import { Button, ButtonLink } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";
import { TripCard, InvitedTripCard } from "./trip-card";
import { NextUpPass } from "./next-up-pass";
import { IslandDays } from "./island-days";
import { useStay } from "@/lib/trips/use-stay";
import { nextUpTrip } from "@/lib/trips/next-up";
import { clockOffsetMs } from "@/lib/booking/clock";
import { marketDayOf } from "@/lib/booking/availability-window";
import { SheetPresence } from "@/components/ui/sheet";
import { Crossfade } from "@/components/ui/crossfade";
import { useListMotion } from "@/lib/motion/use-list-motion";
import { useDelayedFlag } from "@/lib/motion/use-delayed-flag";
import { cn } from "@/lib/cn";
import { TripTabs } from "./trip-tabs";
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
  /*
    Whether a tab has been chosen since Trips opened. The first tab's wait is
    already on screen when its list mounts (the skeleton drawn while the
    session was read); a tab chosen after that is a new wait (`TabTrips`).
  */
  const [chosen, setChosen] = useState(false);
  const choose = (next: TripTab) => {
    if (next === tab) return;
    setChosen(true);
    setTab(next);
  };
  const [range, setRange] = useState<DateRange>({});
  const [dateSheet, setDateSheet] = useState(false);

  const { signedIn } = useTravellerSession();
  const server = useMyBookings(signedIn, { tab, ...range });
  const invited = useInvitedTrips(signedIn);
  /*
    The stay on this phone, asked for alongside the session rather than after
    it. Your island days only mount once the session has answered, so they
    used to ask the device then, and their panel arrived a moment after the
    screen, pushing everything under it down (stability audit, 6 Oct 2026).
    One query: the panel reads this same answer.
  */
  useStay();

  /*
    A tab's contents fade THROUGH to the next tab's (T07 A, approved 4 Oct
    2026): the list on screen fades out (100ms), then the new one fades in
    (150ms), so the swap under the tabs never lands in one frame and two
    lists are never seen at once. Each tab's contents are their own element
    (keyed by the tab) for exactly that.
  */
  const contents = useRef<HTMLDivElement | null>(null);
  useListMotion(contents, tab, { arrive: "fade", through: true });

  /*
    `signedIn === undefined` is "the session has not been read yet", and it is
    a third state rather than a falsy one (yuvoy-app#57). Rendering through it
    would show the signed-out screen to somebody who IS signed in, for one
    frame on every visit, and that screen is now a sign-in prompt rather than a
    list, so the flash would be a much louder one than it used to be.
  */
  if (signedIn === undefined) {
    /*
      The heading is the same whichever way the session answers, so it is
      drawn now: it used to arrive with the answer and push the blocks under
      it down by its own height. What follows it depends on the answer.
    */
    return (
      <Screen>
        <Header />
        <LoadingState label="Loading your trips">
          <div className="mt-6 space-y-3">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        </LoadingState>
      </Screen>
    );
  }

  if (!signedIn) return <SignedOut />;

  const sessionDead = isDeadToken(server.error);

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

  /*
    THE NEXT UP PASS (the approved redesign: traveller A with C's pass,
    3 Oct 2026). A trip leaving within the day is drawn whole above the list,
    and left out of the list below so it is not drawn twice. On Upcoming only:
    that is the tab whose rows are loaded, and the one opened on the morning.

    The server's clock, the way `invitedToday` above reads it: the instant the
    list resolved plus the measured offset. The cards read it too, for a held
    trip's pay-by words (yuvoy-app#156).
  */
  const serverNow = server.dataUpdatedAt + clockOffsetMs();
  const nextUp =
    tab === "upcoming" && server.dataUpdatedAt > 0
      ? nextUpTrip(bookings, serverNow)
      : null;
  const listed = nextUp ? bookings.filter((trip) => trip !== nextUp) : bookings;

  return (
    <Screen>
      <Header />

      <div className="mt-4 flex items-center gap-2 overflow-x-auto pb-1">
        <TripTabs tab={tab} onChange={choose} />
        <span className="ml-auto">
          <DateFilterButton
            range={range}
            onOpen={() => setDateSheet(true)}
            onClear={() => setRange({})}
          />
        </span>
      </div>

      <SheetPresence open={dateSheet}>
        <DateFilterSheet
          range={range}
          onApply={setRange}
          onClose={() => setDateSheet(false)}
        />
      </SheetPresence>

      {/*
        What is next, then the days, then the record. The pass is the trip
        leaving within the day; the island days are the stay laid out by day
        (C's day plan, approved 3 Oct 2026), drawn on Upcoming whether or not
        anything is booked yet, since an empty stay is where planning starts.
      */}
      <div ref={contents}>
        <div key={tab} data-motion-key={tab}>
          {nextUp ? (
            <NextUpPass
              key={nextUp.reference || nextUp.reservationId}
              trip={nextUp}
              now={serverNow}
            />
          ) : null}
          {tab === "upcoming" ? <IslandDays signedIn={signedIn} /> : null}

          {/*
            The server's failure is now the whole screen's failure, where it used to
            be a line over a list this device could still show. So it no longer
            promises that anything survived it: there is nothing left to survive.

            Only a list that never loaded, though (`isLoadingError`). A refresh
            or a "Show more" that fails keeps the trips already on screen, and
            the page that did not arrive says so under the list; this panel
            over the top of them said "We could not load your trips" about
            trips it was showing. A dead session is the exception, loaded or
            not: it will not come back by itself.
            A dead session says so plainly, because `retry: false` means it will not
            resolve itself.
          */}
          {sessionDead || server.isLoadingError ? (
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

          <TabTrips
            tab={tab}
            server={server}
            empty={empty}
            listed={listed}
            invited={invitedForTab}
            now={serverNow}
            waitOnScreen={!chosen}
          />
        </div>
      </div>
    </Screen>
  );
}

/**
 * A tab's trips, or the wait for them (the motion system §8, approved
 * 4 Oct 2026): nothing for 300ms, then the skeleton, which once shown stays
 * at least 300ms, and the list fades in over it when it lands.
 *
 * The skeleton used to be drawn the moment a tab was first opened. An answer
 * that took a quarter of a second then showed it for a few frames and took it
 * away again, which is the flash the 300ms rule exists to prevent; on
 * production's round trip, 300ms and more, every first visit to a tab did it.
 *
 * Drawn inside the tab's own element, so a new tab is a new wait: a skeleton
 * that had just appeared on one tab is not held on the next.
 */
function TabTrips({
  tab,
  server,
  empty,
  listed,
  invited,
  now,
  waitOnScreen,
}: {
  tab: TripTab;
  server: ReturnType<typeof useMyBookings>;
  empty: boolean;
  listed: ServerTrip[];
  invited: InvitedTrip[];
  now: number;
  /** The skeleton was already drawn when this mounted: keep it, do not blank it. */
  waitOnScreen: boolean;
}) {
  const shown = useDelayedFlag(server.isPending, {
    initial: waitOnScreen && server.isPending,
  });
  const view = shown
    ? "loading"
    : server.isPending
      ? "waiting"
      : empty
        ? "empty"
        : "list";

  return (
    <Crossfade view={view}>
      {view === "loading" || view === "waiting" ? (
        <div key={view} data-motion-key={view}>
          <LoadingState label="Loading your trips">
            {/*
              Not drawn until the wait has lasted 300ms, but holding the
              skeleton's room, so nothing under it moves when it is.
            */}
            <div
              className={cn(
                "mt-6 space-y-3",
                view === "waiting" && "invisible",
              )}
            >
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-24 w-full" />
            </div>
          </LoadingState>
        </div>
      ) : view === "empty" ? (
        <div key="empty" data-motion-key="empty">
          <EmptyState
            title={TAB_EMPTY[tab]}
            body=""
            action={<ButtonLink href="/">Find something</ButtonLink>}
          />
        </div>
      ) : (
        <div key="list" data-motion-key="list">
          <ul className="mt-6 space-y-3">
            {listed.map((trip) => (
              <li key={trip.reference || trip.reservationId}>
                <TripCard trip={trip} now={now} />
              </li>
            ))}
            {invited.map((trip) => (
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
        </div>
      )}
    </Crossfade>
  );
}

function Header() {
  return (
    <>
      <h1 className="font-display tracking-display leading-display text-3xl text-balance">
        Your trips
      </h1>
      <p className="text-forest/70 mt-2 text-xs">Every trip on your number.</p>
    </>
  );
}

/**
 * Signed out: no tabs, no trips, and two ways in, the guest's first.
 *
 * Not an empty LIST. There is no list to be empty, and "No upcoming trips"
 * shown to somebody who has booked three would be a false statement rather
 * than an empty state.
 *
 * ## Finding a booking leads (yuvoy-app#113)
 *
 * Checkout needs no account, so most people who land here signed out booked
 * as guests. This screen used to open on a sign-in wall and offer the way to
 * their booking as a small link underneath, so a guest had to work out that
 * signing in was not what they needed. Now the guest's route leads: the link
 * in their booking message, or `/trips/recover`, which sends a code to the
 * email on the number's latest booking and needs no account at all.
 *
 * Signing in stays, second and in the owner's words, verbatim. The two are
 * genuinely different: signing in works for a number that has never booked
 * and revokes nothing, while recovery mints one booking's link and rotates
 * the old one.
 */
function SignedOut() {
  return (
    <Screen>
      <Header />
      <Panel className="mt-6">
        <h2 className="text-base font-bold text-balance">Find my booking</h2>
        <p className="text-forest/70 text-body mt-1.5 text-pretty">
          Open the link in your booking message. No message to hand? Use the
          number you booked with, and a code goes to the email on your latest
          booking. No account needed.
        </p>
        <ButtonLink href="/trips/recover" className="mt-4">
          Find my booking
        </ButtonLink>
      </Panel>
      <EmptyState
        title="Sign in to see your trips"
        body="Your bookings are kept in your account. Sign in with the WhatsApp number you booked with."
        action={
          <ButtonLink href="/account?next=/trips" variant="outline">
            Sign in
          </ButtonLink>
        }
      />
    </Screen>
  );
}

export type { InvitedTrip };
