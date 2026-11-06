"use client";

import { useEffect, useState } from "react";
import { useHasMounted } from "@/lib/react/use-has-mounted";
import { useBookingStatus } from "@/lib/booking/use-booking-status";
import { overdueAtCeiling } from "@/lib/booking/poll";
import { useFragmentToken } from "@/lib/booking/use-fragment-token";
import { formatAge } from "@/lib/format/time";
import { isDeadToken } from "@/lib/api/errors";
import { ErrorState, LoadingState, Skeleton } from "@/components/states";
import { Screen } from "@/components/chrome/screen";
import { ButtonLink } from "@/components/ui/button";
import { arrivalPending, forgetArrival } from "@/lib/booking/arrival";
import type { components } from "@/lib/api/schema.gen";
import {
  PicturePlaceholder,
  PictureStrip,
} from "@/components/chrome/picture-strip";
import { HandOver } from "./trip-progress";
import { StatusBody } from "./booking-screen-body";

type BookingStatus = components["schemas"]["BookingStatus"];

const BACK = { href: "/trips", label: "your trips" };

/**
 * T9 and T10 — the confirmation, and the page a traveller returns to.
 *
 * Client-only, and not by preference: the status token lives in the URL
 * fragment, a fragment is never sent to a server, so a server component
 * structurally cannot read it.
 *
 * The state vocabulary is the contract's, computed server-side and never
 * derived here. The copy for each is the load-bearing part — particularly
 * `verifying`, which must never read as failure.
 */
export function BookingScreen() {
  // The URL is an external store; this reads it without an effect, and follows
  // a hashchange if a different booking link is pasted into the same tab.
  const token = useFragmentToken();
  const mounted = useHasMounted();

  // Before hydration the fragment is genuinely unknown, so render the loading
  // shape rather than "we need your link" and then flipping to the booking.
  if (!mounted)
    return (
      <Shell hero={<PicturePlaceholder />}>
        <Loading />
      </Shell>
    );

  if (token === null) {
    return (
      <Shell>
        <h1 className="font-display tracking-display leading-display text-3xl text-balance">
          We need your booking link
        </h1>
        <p className="text-forest/70 text-body mt-3 text-pretty">
          Your booking opens from the private link we gave you when you booked,
          and from the message we sent. It is the only way in. We cannot look it
          up from a name.
        </p>
        <ButtonLink href="/trips" className="mt-6">
          Go to my trips
        </ButtonLink>
      </Shell>
    );
  }

  /*
    One booking per mount. A link pasted into the same tab is another
    booking, and everything kept for the last one went with it: when its
    polling began and whether it had given up, so a second booking could
    hand over to a person at once, and the copy saved on the device, so a
    second booking that failed to load offline showed the first (stability
    audit, 6 Oct 2026). Keyed, it starts as a page opened on that link.
  */
  return <BookingFor key={token} token={token} />;
}

function BookingFor({ token }: { token: string }) {
  const { data, error, isPending, isLoadingError, gaveUp, snapshot, refetch } =
    useBookingStatus(token);

  /*
    Arrived at from the checkout that made this booking, this moment (T10 A):
    read once for this token, then forgotten, so a reload, a poll or a shared
    link opens the page as it is. Never replayed.
  */
  const [arrived] = useState(() => arrivalPending(token));
  useEffect(() => {
    if (arrived) forgetArrival(token);
  }, [arrived, token]);

  if (isPending)
    return (
      <Shell hero={<PicturePlaceholder />}>
        <Loading />
      </Shell>
    );

  // Nothing from the network, but we kept the last known payload. Show it,
  // clearly stamped. Never present a saved booking as a live one.
  if (isLoadingError && snapshot) {
    return (
      <Shell hero={pictureOf(snapshot.status)}>
        <div
          role="status"
          className="rounded-card border-paper-line bg-paper-deep mb-6 border px-4 py-3 text-xs"
        >
          You are offline. This is what we saved on your device, last checked{" "}
          {formatAge(snapshot.fetchedAt)}.
        </div>
        <StatusBody status={snapshot.status} live={false} />
      </Shell>
    );
  }

  // A dead link (expired, or replaced by a newer one) is answered with the
  // way to a fresh link, not a retry that can never work. `tokenBearing` is
  // what turns the 401 into that offer.
  //
  // Only a read that never came back, or a link the server has finished
  // with, takes the screen. The status polls, and one poll dropped on a
  // ferry used to swap the booking a traveller was reading for an error
  // page; the booking now stays, and the next poll brings it up to date
  // (6 Oct 2026).
  if (isLoadingError || isDeadToken(error)) {
    return (
      <Shell>
        <ErrorState error={error} onRetry={() => void refetch()} tokenBearing />
      </Shell>
    );
  }

  return (
    <Shell hero={pictureOf(data)}>
      <StatusBody
        status={data}
        live={!gaveUp}
        token={token}
        onChanged={() => void refetch()}
        arrived={arrived}
      />
      {/*
        Only a payment that has not settled is handed to a person
        (`overdueAtCeiling`). For every other unsettled state the polling
        stops quietly at the ceiling, and the page still catches up the moment
        the traveller comes back to it, because the status refetches on focus
        and on reconnect.
      */}
      {gaveUp && !data.final && overdueAtCeiling(data.state) ? (
        <HandOver status={data} />
      ) : null}
    </Shell>
  );
}

/* ---------------------------------------------------------- state copy */

function Loading() {
  return (
    <LoadingState label="Loading your booking">
      <div className="space-y-4">
        <Skeleton className="h-8 w-2/3 rounded-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    </LoadingState>
  );
}

function Shell({
  children,
  hero,
}: {
  children: React.ReactNode;
  /** The listing's picture over the top (the approved redesign, 3 Oct 2026). */
  hero?: React.ReactNode;
}) {
  return (
    <Screen back={BACK} stageLabel="Your booking" hero={hero}>
      {children}
    </Screen>
  );
}

/**
 * The booked listing's picture, or nothing. `heroImageUrl` is always sent and
 * `null` when the listing has none, and then the page keeps its plain header.
 */
function pictureOf(status: BookingStatus): React.ReactNode {
  const src = status.experience?.heroImageUrl;
  return src ? <PictureStrip src={src} /> : undefined;
}
