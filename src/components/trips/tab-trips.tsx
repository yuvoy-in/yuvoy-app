"use client";

import type { useMyBookings } from "@/lib/auth/use-traveller";
import {
  TAB_EMPTY,
  type TripTab,
  type InvitedTrip,
  type ServerTrip,
} from "@/lib/trips/tabs";
import { EmptyState, LoadingState, Skeleton } from "@/components/states";
import { Button, ButtonLink } from "@/components/ui/button";
import { Crossfade } from "@/components/ui/crossfade";
import { useDelayedFlag } from "@/lib/motion/use-delayed-flag";
import { cn } from "@/lib/cn";
import { GetMyLink } from "@/components/creator/get-my-link";
import { TripCard, InvitedTripCard } from "./trip-card";

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
export function TabTrips({
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
                {/* A share link, for a trip that is over (yuvoy-app#207). */}
                {tab === "past" ? <GetMyLink trip={trip} /> : null}
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
