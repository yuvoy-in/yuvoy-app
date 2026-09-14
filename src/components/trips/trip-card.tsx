"use client";

import Image from "next/image";
import Link from "next/link";
import { bookingUrl } from "@/lib/booking/token-store";
import type { Trip } from "@/lib/booking/merge-trips";
import {
  tripPriceLine,
  partyLine,
  GUEST_STATUS_LABEL,
  type InvitedTrip,
} from "@/lib/trips/tabs";
import { dateLabel } from "@/lib/search/labels";
import { StateChip } from "@/components/booking/state-chip";
import { Chip } from "@/components/ui/chip";
import { Panel } from "@/components/ui/panel";
import { ButtonLink } from "@/components/ui/button";
import { CalendarIcon } from "@/components/ui/icons";

/**
 * One trip, as a card (yuvoy-app#38 item 2).
 *
 * Two shapes, and the difference between them is the point. A trip the
 * traveller BOOKED shows what it cost and what is still owed. A trip they were
 * INVITED to shows neither, because the API deliberately sends neither: the
 * contract lists the reference, the price, the payment, the refund and
 * "anything about the person who paid" as absent by design, and the issue's own
 * "do not build" repeats it.
 *
 * So a guest card cannot accidentally grow a price line: there is no field to
 * read one from, and the component that would render it is not this one.
 */

/** "Sat 20 Sep · 06:30", in the market's own day. */
function whenLine(localDate: string, localTime?: string): string {
  const time = localTime?.slice(0, 5);
  return time ? `${dateLabel(localDate)} · ${time}` : dateLabel(localDate);
}

/**
 * The picture, or the placeholder.
 *
 * `heroImageUrl` is `null` when the listing has none and is "always sent", so
 * absence is a real state rather than a loading one. A grey tile keeps the
 * card's shape, which stops the list reflowing as pictures land.
 */
function HeroTile({ src, alt }: { src?: string | null; alt: string }) {
  if (!src) {
    return (
      <span
        aria-hidden="true"
        className="bg-forest/10 size-16 shrink-0 rounded-xl"
      />
    );
  }
  return (
    <Image
      src={src}
      alt={alt}
      width={64}
      height={64}
      className="size-16 shrink-0 rounded-xl object-cover"
    />
  );
}

export function TripCard({ trip }: { trip: Trip }) {
  if (trip.dead) {
    /*
      A link the server has finished with, and the number's list does not carry
      this trip either. It stays listed, because the trip is real, but tapping
      it would open a dead page.
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

  const row = trip.server;
  const price = row ? tripPriceLine(row) : null;

  return (
    <Link
      href={bookingUrl(trip.token)}
      className="rounded-card border-cream-line bg-cream-deep hover:border-forest/40 ease-interaction flex items-start gap-4 border p-4 transition-colors duration-200"
    >
      <HeroTile src={row?.heroImageUrl} alt="" />

      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-3">
          <p className="font-bold">{trip.title}</p>
          {trip.state ? <StateChip state={trip.state} /> : null}
        </div>

        {row ? (
          <p className="text-forest/80 mt-2 flex items-center gap-2 text-sm">
            <CalendarIcon className="text-forest/70 size-4" />
            {whenLine(row.localDate, row.localTime)}
          </p>
        ) : null}

        <p className="text-forest/70 mt-1 text-sm">
          {row ? partyLine(row.guests) : null}
        </p>

        {/*
          One sentence about money, or none. `tripPriceLine` decides which, in
          a fixed order: a cash booking that is not yet collected is asked for
          BEFORE anything says "Paid", because the API reports such a booking as
          `confirmed` and reading the state alone is how production came to show
          "Paid ₹9,000" to travellers who had handed over nothing (#29).
        */}
        {price ? <p className="mt-1.5 text-sm font-bold">{price}</p> : null}

        {/*
          The reference is what gets read out at a jetty. A request the operator
          has not answered has none, and an internal id styled as one is a
          number somebody will read out to no effect.
        */}
        {trip.reference ? (
          <p className="text-forest/70 mt-2 font-mono text-xs tracking-wider">
            {trip.reference}
          </p>
        ) : null}
      </div>
    </Link>
  );
}

/**
 * A trip somebody else booked.
 *
 * No price, no payment, no reference, and no "invited by". The API sends none
 * of it and the issue forbids inventing any: "The API deliberately sends
 * nothing about the person who paid; the card shows Guest."
 */
export function InvitedTripCard({ trip }: { trip: InvitedTrip }) {
  return (
    <Link
      href={`/trips/invited/${trip.id}`}
      className="rounded-card border-cream-line bg-cream-deep hover:border-forest/40 ease-interaction flex items-start gap-4 border p-4 transition-colors duration-200"
    >
      <HeroTile alt="" />

      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-3">
          <p className="font-bold">{trip.experience}</p>
          <Chip size="sm">{GUEST_STATUS_LABEL[trip.status]}</Chip>
        </div>

        <p className="text-forest/80 mt-2 flex items-center gap-2 text-sm">
          <CalendarIcon className="text-forest/70 size-4" />
          {whenLine(trip.localDate, trip.localTime)}
        </p>

        {/*
          What they are on this trip. Not a price, not a party size that could
          be read as what they owe: one word saying somebody else booked it.
        */}
        <p className="mt-1.5">
          <Chip size="sm" tone="accent">
            Guest
          </Chip>
        </p>
      </div>
    </Link>
  );
}
