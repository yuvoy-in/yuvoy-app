"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  listBookings,
  getSnapshot,
  bookingUrl,
} from "@/lib/booking/token-store";
import { formatAge } from "@/lib/format/time";
import { EmptyState, LoadingState, Skeleton } from "@/components/states";
import { cn } from "@/lib/cn";
import type { components } from "@/lib/api/schema.gen";

type BookingStatus = components["schemas"]["BookingStatus"];

interface Trip {
  reference: string;
  token: string;
  savedAt: string;
  status: BookingStatus | null;
  fetchedAt: string | null;
}

/**
 * The Trips tab.
 *
 * Reads from the DEVICE first, deliberately. Checkout is unauthenticated, so
 * there is no server-side "my bookings" for a guest — the status token is the
 * access, and this store is the only copy the traveller has. That makes this
 * screen work with no account and no signal, which is the point.
 *
 * Signed-in travellers get the same list from `/v1/me/bookings` merged on top;
 * that arrives with T11.
 */
export function TripsScreen() {
  const [trips, setTrips] = useState<Trip[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const stored = await listBookings();
      const withSnapshots = await Promise.all(
        stored.map(async (b) => {
          const snap = await getSnapshot(b.reference);
          return {
            reference: b.reference,
            token: b.token,
            savedAt: b.savedAt,
            status: snap?.status ?? null,
            fetchedAt: snap?.fetchedAt ?? null,
          } satisfies Trip;
        }),
      );
      if (!cancelled) setTrips(withSnapshots);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (trips === null) {
    return (
      <Shell>
        <LoadingState label="Loading your trips">
          <div className="space-y-3">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        </LoadingState>
      </Shell>
    );
  }

  if (trips.length === 0) {
    return (
      <Shell>
        <EmptyState
          title="Nothing booked yet"
          body="Bookings you make on this device show up here — no account needed. If you booked on another phone, open the link we sent you."
          action={
            <Link
              href="/"
              className="rounded-edge label bg-forest text-cream inline-flex h-11 items-center px-5 font-bold"
            >
              Find something
            </Link>
          }
        />
        <p className="text-forest/70 mt-8 text-center text-xs">
          Lost your link?{" "}
          <Link
            href="/trips/recover"
            className="text-terra-deep tap-target underline"
          >
            Get it back
          </Link>
        </p>
      </Shell>
    );
  }

  // Upcoming first, soonest first — somebody opening this on the morning of a
  // dive wants the dive, not the thing they did in March.
  const sorted = [...trips].sort((a, b) => {
    const aStart = a.status?.slot.startsAt ?? "";
    const bStart = b.status?.slot.startsAt ?? "";
    const now = new Date().toISOString();
    const aUp = aStart >= now;
    const bUp = bStart >= now;
    if (aUp !== bUp) return aUp ? -1 : 1;
    return aUp ? aStart.localeCompare(bStart) : bStart.localeCompare(aStart);
  });

  return (
    <Shell>
      <h1 className="font-display tracking-display text-3xl leading-tight">
        Your trips
      </h1>
      <p className="text-forest/70 mt-2 text-xs">
        Kept on this device. No account, and they work without signal.
      </p>

      <ul className="mt-6 space-y-3">
        {sorted.map((trip) => (
          <li key={trip.reference}>
            <Link
              href={bookingUrl(trip.token)}
              className="rounded-edge border-cream-line bg-cream-deep hover:border-forest/30 block border p-4 transition-colors"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-bold">
                    {trip.status?.experience.title ?? "Your booking"}
                  </p>
                  <p className="text-forest/70 mt-1 font-mono text-xs tracking-wider">
                    {trip.reference}
                  </p>
                </div>
                {trip.status ? <StateChip state={trip.status.state} /> : null}
              </div>

              {trip.status ? (
                <p className="text-forest/70 mt-3 text-sm">
                  {new Intl.DateTimeFormat("en-IN", {
                    timeZone: trip.status.slot.timezone,
                    weekday: "short",
                    day: "numeric",
                    month: "short",
                    hour: "2-digit",
                    minute: "2-digit",
                    hour12: false,
                  }).format(new Date(trip.status.slot.startsAt))}
                </p>
              ) : null}

              {/* Never presented as live. This is what we saved. */}
              {trip.fetchedAt ? (
                <p className="text-forest/70 mt-2 text-xs">
                  Last checked {formatAge(trip.fetchedAt)}
                </p>
              ) : null}
            </Link>
          </li>
        ))}
      </ul>

      <p className="text-forest/70 mt-8 text-center text-xs">
        Booked on another phone?{" "}
        <Link
          href="/trips/recover"
          className="text-terra-deep tap-target underline"
        >
          Get your link back
        </Link>
      </p>
    </Shell>
  );
}

function StateChip({ state }: { state: BookingStatus["state"] }) {
  const tone =
    state === "confirmed" || state === "completed"
      ? "text-terra-deep"
      : state === "cancelled" || state === "declined" || state === "expired"
        ? "text-forest/70"
        : "text-forest/75";

  const label: Record<BookingStatus["state"], string> = {
    holding: "Holding",
    awaiting_operator: "Asked",
    verifying: "Checking",
    confirmed: "Confirmed",
    declined: "Refunded",
    cancelled: "Cancelled",
    expired: "Expired",
    released: "Released",
    completed: "Done",
    no_show: "Not boarded",
  };

  return <span className={cn("label shrink-0", tone)}>{label[state]}</span>;
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-cream text-forest min-h-full">
      <div className="container-page max-w-xl py-6">{children}</div>
    </div>
  );
}
