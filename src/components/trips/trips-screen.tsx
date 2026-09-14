"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  listBookings,
  getSnapshot,
  rememberBooking,
} from "@/lib/booking/token-store";
import { mergeTrips, type DeviceTrip } from "@/lib/booking/merge-trips";
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
import {
  DateFilterSheet,
  DateFilterButton,
  type DateRange,
} from "./date-filter";

/**
 * The Trips tab: tabs, paging and a date filter (yuvoy-app#38 items 1 and 2).
 *
 * ## Tabs, and who decides them
 *
 * The API decides the tab for a trip the traveller BOOKED, sends it as
 * `?tab=`, and guarantees the three "never overlap and together they are the
 * whole list". Nothing is re-derived here for those rows, including the rule
 * that a `no_show` is a PAST trip rather than a cancelled one: the boat went.
 *
 * An invited trip carries no tab and is not paged, so `invitedTripTab` places
 * it. That is the one piece of tab logic in this client and it is tested
 * without a screen.
 *
 * ## The device list is still read first, and still works alone
 *
 * Checkout is unauthenticated: the status token is the access, and the device
 * store is the only copy a guest has. That is what makes this screen work with
 * no account and no signal, and it does not change. Signed out there are no
 * tabs at all, because there is nothing to divide: the device holds what it
 * holds.
 *
 * ## Why the device trips sit in Upcoming
 *
 * A device record the server has not listed has no tab to be put in: often all
 * this phone knows is a token and a title. Hiding it until a tab could be
 * decided would lose the one thing the device list is for. Anything the server
 * DOES list is placed by the server.
 */
export function TripsScreen() {
  const [device, setDevice] = useState<DeviceTrip[] | null>(null);
  const [tab, setTab] = useState<TripTab>("upcoming");
  const [range, setRange] = useState<DateRange>({});
  const [dateSheet, setDateSheet] = useState(false);

  const { signedIn } = useTravellerSession();
  const server = useMyBookings(signedIn, { tab, ...range });
  const invited = useInvitedTrips(signedIn);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const stored = await listBookings();
      // Joined on the store's one key — the reference once known, the
      // reservation id until then — which is also what the snapshot is under.
      const withSnapshots = await Promise.all(
        stored.map(async (b) => {
          const snap = await getSnapshot(b.key);
          return {
            key: b.key,
            reference: b.reference ?? snap?.status.bookingReference ?? null,
            /*
              The STORE's id first, and the snapshot's only as a fallback.

              Checkout writes the record keyed by the reservation id, before any
              status has been fetched, which is exactly the state a waiting
              request is in. Reading only the snapshot left that record with no
              id to match on, so the server's row for the same request could not
              find it and the trip appeared twice, with two tokens.
            */
            reservationId:
              b.reservationId ?? snap?.status.reservationId ?? null,
            token: b.token,
            savedAt: b.savedAt,
            dead: Boolean(b.dead),
            status: snap?.status ?? null,
            fetchedAt: snap?.fetchedAt ?? null,
          } satisfies DeviceTrip;
        }),
      );
      if (!cancelled) setDevice(withSnapshots);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  /** Every server row across every page fetched so far. */
  const serverRows = useMemo(
    () => server.data?.pages.flatMap((page) => page.bookings) ?? null,
    [server.data],
  );

  /*
    Claim the server's trips onto this device.

    Each row's token is minted for that response and revokes nothing, so keeping
    it is what lets a trip booked on another phone open here later, offline,
    with no session. Keyed by the reference when there is one and by the
    reservation id when there is not, which is the same pair the merge uses and
    for the same reason: a waiting request has no reference to key by.
  */
  useEffect(() => {
    for (const row of serverRows ?? []) {
      if (!row.statusToken) continue;
      const reference = row.reference?.trim();
      void rememberBooking(
        reference
          ? { reference, token: row.statusToken }
          : { reservationId: row.reservationId, token: row.statusToken },
      );
    }
  }, [serverRows]);

  /*
    The device read is what the screen cannot render without. The server's is an
    addition, so its loading and its failure are lines rather than states.

    `signedIn === undefined` waits too (yuvoy-app#57). It reads as falsy
    everywhere below, so rendering through it would show the signed-out copy to
    somebody who IS signed in, for one frame on every visit.
  */
  if (device === null || signedIn === undefined) {
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

  const sessionDead = server.isError && isDeadToken(server.error);

  /*
    Signed out: no tabs, and the device list exactly as it was. There is nothing
    to divide, and three tabs over one phone's bookings would be two empty ones.
  */
  if (!signedIn) {
    const trips = mergeTrips(device, null);
    return (
      <Screen>
        <Header signedIn={false} />
        {trips.length === 0 ? (
          <EmptyState
            title="Nothing booked yet"
            body="Bookings you make on this device show up here. No account needed. Sign in and the ones booked on another phone join them."
            action={<ButtonLink href="/">Find something</ButtonLink>}
          />
        ) : (
          <ul className="mt-6 space-y-3">
            {trips.map((trip) => (
              <li key={trip.key}>
                <TripCard trip={trip} />
              </li>
            ))}
          </ul>
        )}
        <SignInPrompt />
      </Screen>
    );
  }

  const merged = mergeTrips(device, serverRows);

  /*
    A device record the server has not listed goes in Upcoming. It has no tab to
    be placed in, and hiding it would lose the one thing the device list is for.
  */
  const bookings =
    tab === "upcoming" ? merged : merged.filter((trip) => trip.onServer);

  const invitedForTab = sortForTab(
    (invited.data?.trips ?? [])
      .filter((trip) => invitedTripTab(trip) === tab)
      .filter((trip) => withinDateFilter(trip.localDate, range)),
    tab,
  );

  const empty = bookings.length === 0 && invitedForTab.length === 0;

  return (
    <Screen>
      <Header signedIn />

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
        The server's failure is a line, not a state: the device's trips are
        still true and still openable. A dead session says so plainly, because
        `retry: false` means it will not resolve itself.
      */}
      {server.isError ? (
        <Panel role="alert" className="mt-4 px-4 py-3">
          <p className="text-sm font-bold">
            {sessionDead
              ? "Your sign-in has expired"
              : "We could not check your other trips"}
          </p>
          <p className="text-forest/70 mt-1 text-sm">
            {sessionDead
              ? "Sign in again and every trip on your number comes back. Anything saved on this phone is unaffected."
              : `${describeError(server.error).body} Anything saved on this phone is still here.`}
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
              <li key={trip.key}>
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

function Header({ signedIn }: { signedIn: boolean }) {
  return (
    <>
      <h1 className="font-display tracking-display text-3xl leading-tight">
        Your trips
      </h1>
      <p className="text-forest/70 mt-2 text-xs">
        {signedIn
          ? "Every trip on your number, and the ones saved on this phone."
          : "Kept on this device. No account, and they work without signal."}
      </p>
    </>
  );
}

/**
 * The way to the rest of somebody's trips.
 *
 * It used to read "Booked on another phone? Get your link back", pointing at
 * recovery, which was the only route there was. Signing in is the route now: it
 * works for a number that has never booked, and it revokes nothing, where
 * recovery rotates the links already on this phone.
 */
function SignInPrompt() {
  return (
    <div className="border-cream-line mt-10 border-t pt-6">
      <p className="text-forest/70 text-sm">
        Sign in to see every trip on your number. Those booked on another phone
        join this list, nothing here changes, and there is no account to make.
      </p>
      <ButtonLink href="/account" variant="outline" size="sm" className="mt-3">
        Sign in with my number
      </ButtonLink>
      <p className="text-forest/70 mt-4 text-xs">
        Only lost the link to one booking?{" "}
        <Link
          href="/trips/recover"
          className="text-terra-deep tap-target underline"
        >
          Get a new one sent
        </Link>
        .
      </p>
    </div>
  );
}

export type { InvitedTrip };
