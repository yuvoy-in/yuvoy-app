"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  listBookings,
  getSnapshot,
  rememberBooking,
  bookingUrl,
} from "@/lib/booking/token-store";
import {
  mergeTrips,
  type DeviceTrip,
  type Trip,
} from "@/lib/booking/merge-trips";
import {
  useTravellerSession,
  useMyBookings,
  isDeadToken,
} from "@/lib/auth/use-traveller";
import { formatAge } from "@/lib/format/time";
import {
  EmptyState,
  LoadingState,
  Skeleton,
  describeError,
} from "@/components/states";
import { Screen } from "@/components/chrome/screen";
import { ButtonLink } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { Panel } from "@/components/ui/panel";
import { StateChip } from "@/components/booking/state-chip";
import { CalendarIcon, ChevronRightIcon } from "@/components/ui/icons";

/**
 * The Trips tab — one list, from the device and from the number.
 *
 * ## It said it merged them, and it read only the device
 *
 * This file's own comment promised "signed-in travellers get the same list
 * from `/v1/me/bookings` merged on top; that arrives with T11." It never did,
 * and T11 shipped on the Account tab instead — so a signed-in traveller had
 * two lists of overlapping bookings, in two places, with different cards
 * (yuvoy-app#34).
 *
 * They are one list now, here, and the Account tab is what its name says.
 *
 * ## The device is still read FIRST, and still works alone
 *
 * Checkout is unauthenticated: the status token is the access, and this store
 * is the only copy a guest has. That is what makes this screen work with no
 * account and no signal, which is the point and does not change. The server's
 * list is merged on top when there is a session; without one, nothing about
 * this screen is different from before.
 *
 * ## Requests that are still waiting now appear
 *
 * `GET /me/bookings` lists them with `state: pending_request` and an empty
 * reference. Matching therefore falls back to `reservationId` — see
 * `mergeTrips`, where getting that wrong shows every waiting request twice.
 */
export function TripsScreen() {
  const [device, setDevice] = useState<DeviceTrip[] | null>(null);
  const { token } = useTravellerSession();
  const server = useMyBookings(token);

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

              Checkout writes the record keyed by the reservation id, before
              any status has been fetched — which is exactly the state a
              waiting request is in. Reading only the snapshot left that record
              with no id to match on, so the server's row for the same request
              could not find it and the trip appeared twice, with two tokens.
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

  /*
    Claim the server's trips onto this device.

    Each row's token is minted for that response and revokes nothing, so
    keeping it is what lets a trip booked on another phone open here later,
    offline, with no session. Keyed by the reference when there is one and by
    the reservation id when there is not — the same two keys the merge uses,
    for the same reason: a waiting request has no reference to key by.
  */
  useEffect(() => {
    for (const row of server.data?.bookings ?? []) {
      if (!row.statusToken) continue;
      const reference = row.reference?.trim();
      void rememberBooking(
        reference
          ? { reference, token: row.statusToken }
          : { reservationId: row.reservationId, token: row.statusToken },
      );
    }
  }, [server.data]);

  // The device read is what the screen cannot render without. The server's is
  // an addition, so its loading and its failure are lines rather than states.
  if (device === null) {
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

  const trips = mergeTrips(device, server.data?.bookings ?? null);
  const signedIn = Boolean(token);
  /*
    A session that has died server-side. Said plainly, because the alternative
    is a Trips tab quietly missing half of somebody's bookings — and `retry:
    false` means it will not resolve itself.
  */
  const sessionDead = server.isError && isDeadToken(server.error);

  if (trips.length === 0) {
    return (
      <Screen>
        <EmptyState
          title="Nothing booked yet"
          body={
            signedIn
              ? "Nothing on this number, and nothing saved on this phone."
              : "Bookings you make on this device show up here. No account needed. Sign in and the ones booked on another phone join them."
          }
          action={<ButtonLink href="/">Find something</ButtonLink>}
        />
        {signedIn ? null : <SignInPrompt />}
      </Screen>
    );
  }

  return (
    <Screen>
      <h1 className="font-display tracking-display text-3xl leading-tight">
        Your trips
      </h1>
      <p className="text-forest/70 mt-2 text-xs">
        {signedIn
          ? "Every trip on your number, and the ones saved on this phone."
          : "Kept on this device. No account, and they work without signal."}
      </p>

      {server.isPending && signedIn ? (
        <p role="status" className="text-forest/70 mt-3 text-xs">
          Checking for trips booked on your other phones…
        </p>
      ) : null}

      {server.isError ? (
        <Panel role="alert" className="mt-4 px-4 py-3">
          <p className="text-sm font-bold">
            {sessionDead
              ? "Your sign-in has expired"
              : "We could not check your other trips"}
          </p>
          <p className="text-forest/70 mt-1 text-sm">
            {sessionDead
              ? "Sign in again and every trip on your number comes back. The ones below are saved on this phone and are unaffected."
              : `${describeError(server.error).body} The ones below are saved on this phone.`}
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

      <ul className="mt-6 space-y-3">
        {trips.map((trip) => (
          <li key={trip.key}>
            <TripCard trip={trip} />
          </li>
        ))}
      </ul>

      {signedIn ? null : <SignInPrompt />}
    </Screen>
  );
}

/**
 * The way to the rest of somebody's trips.
 *
 * It used to read "Booked on another phone? Get your link back", pointing at
 * recovery — the only route there was. Signing in is the route now: it works
 * for a number that has never booked, and it **revokes nothing**, where
 * recovery rotates the links already on this phone. Recovery is still offered,
 * and still described as the thing it is.
 */
function SignInPrompt() {
  return (
    <div className="border-cream-line mt-10 border-t pt-6">
      <p className="text-forest/70 text-sm">
        Booked on another phone? Sign in with your number and those trips join
        this list. Nothing here changes, and there is no account to make.
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

function TripCard({ trip }: { trip: Trip }) {
  if (trip.dead) {
    /*
      A link the server has finished with, and the number's list does not
      carry this trip either. It stays listed — the trip is real — but tapping
      it would open a dead page, so the card says what happened and offers the
      two things that help. Signing in is offered first now: it fetches a fresh
      token for every trip at once, where recovery rotates one.
    */
    return (
      <Panel>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="font-bold">{trip.title}</p>
            {trip.reference ? (
              <p className="text-forest/70 mt-1 font-mono text-xs tracking-wider">
                {trip.reference}
              </p>
            ) : null}
          </div>
          <Chip size="sm" tone="accent">
            Link expired
          </Chip>
        </div>
        <p className="text-forest/70 mt-3 text-sm">
          This link no longer opens the booking. Signing in with the number you
          booked with brings it back, along with everything else on it.
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <ButtonLink href="/account" variant="outline" size="sm">
            Sign in
          </ButtonLink>
          <ButtonLink href="/trips/recover" variant="outline" size="sm">
            Get a new link
          </ButtonLink>
        </div>
      </Panel>
    );
  }

  return (
    <Link
      href={bookingUrl(trip.token)}
      className="rounded-card border-cream-line bg-cream-deep hover:border-forest/40 ease-interaction flex items-center gap-4 border p-5 transition-colors duration-200"
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-3">
          <p className="font-bold">{trip.title}</p>
          {trip.state ? <StateChip state={trip.state} /> : null}
        </div>

        {/*
          The reference is what gets read out at a jetty. A request the
          operator has not answered has none — the server sends it empty on
          purpose — and an internal id styled as one is a number somebody will
          read out to no effect. So the line says what is true of a request
          instead.
        */}
        <p className="text-forest/70 mt-1 font-mono text-xs tracking-wider">
          {trip.reference ??
            (trip.state === "pending_request"
              ? "Waiting for the operator"
              : "Not yet confirmed")}
        </p>

        {trip.startsAt ? (
          <p className="text-forest/80 mt-3 flex items-center gap-2 text-sm">
            <CalendarIcon className="text-forest/70 size-4" />
            {formatWhen(trip)}
          </p>
        ) : null}

        {/* Never presented as live. This is what we saved. */}
        {trip.fetchedAt ? (
          <p className="text-forest/70 mt-2 text-xs">
            Last checked {formatAge(trip.fetchedAt)}
          </p>
        ) : null}
      </div>
      <ChevronRightIcon className="text-forest/70 size-5 shrink-0" />
    </Link>
  );
}

/**
 * When the trip is, from whichever source knew.
 *
 * A device snapshot carries a real instant and the market's zone; a server row
 * carries the market's local date and time with no zone at all. The second is
 * printed as it arrived rather than parsed: reading "06:30 on the 14th" as an
 * instant would move a dawn dive to the previous afternoon for anybody east of
 * Greenwich, which is everybody here.
 */
function formatWhen(trip: Trip): string {
  if (!trip.startsAt) return "";

  if (trip.timezone) {
    return new Intl.DateTimeFormat("en-IN", {
      timeZone: trip.timezone,
      weekday: "short",
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(new Date(trip.startsAt));
  }

  const [date, time = ""] = trip.startsAt.split("T");
  const day = new Intl.DateTimeFormat("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "Asia/Kolkata",
  }).format(new Date(`${date}T12:00:00+05:30`));
  return time ? `${day}, ${time.slice(0, 5)}` : day;
}
