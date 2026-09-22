"use client";

import Image from "next/image";
import Link from "next/link";
import { bookingUrl } from "@/lib/booking/token-store";

import {
  tripPriceLine,
  partyLine,
  unreadLine,
  GUEST_STATUS_LABEL,
  type InvitedTrip,
  type ServerTrip,
} from "@/lib/trips/tabs";
import { dateLabel } from "@/lib/search/labels";
import { StateChip } from "@/components/booking/state-chip";
import { Chip } from "@/components/ui/chip";
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
 *
 * ## It takes the server's row, not a merged shape (yuvoy-app#60)
 *
 * This used to take a `Trip`, a union of what the API listed and what this
 * device had saved, which meant every field was nullable and the card carried
 * a whole second branch for a booking the server had never listed and whose
 * link had died. Trips reads one source now, so the row IS the card's props and
 * the branch is gone: a row the API returned always has a title, a date, a
 * party and a freshly minted `statusToken`.
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

export function TripCard({ trip }: { trip: ServerTrip }) {
  const price = tripPriceLine(trip);
  /*
    Read as optional whatever the contract says: see `unreadLine`. An older
    API sends no count, and the card then says what it said before.
  */
  const unread = unreadLine(trip.unreadCount);

  return (
    <Link
      href={bookingUrl(trip.statusToken)}
      className="rounded-card border-paper-line bg-paper-deep hover:border-forest/40 ease-interaction flex items-start gap-4 border p-4 transition-colors duration-200"
    >
      <HeroTile src={trip.heroImageUrl} alt="" />

      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-3">
          <p className="font-bold">{trip.experience}</p>
          <StateChip state={trip.state} />
        </div>

        {/*
          A REPLY HAS ARRIVED (yuvoy-api#207), under the name rather than at
          the foot of the card, because it is the one line here that changes
          while the trip does not.

          Before this the only way to learn the business had written was to
          open that exact trip and scroll to the conversation. The card is the
          link to that page, so the line is part of the link's name and a
          screen reader hears it with the trip it belongs to.

          `terra-deep`, the accent that is legible at body size on this card's
          `paper-deep` ground (5.49:1). The dot is decoration and hidden: the
          words carry the meaning.
        */}
        {unread ? (
          <p className="text-terra-deep mt-1.5 flex items-center gap-2 text-sm font-bold">
            <span
              aria-hidden="true"
              className="bg-terra-deep size-1.5 shrink-0 rounded-full"
            />
            {unread}
          </p>
        ) : null}

        <p className="text-forest/80 mt-2 flex items-center gap-2 text-sm">
          <CalendarIcon className="text-forest/70 size-4" />
          {whenLine(trip.localDate, trip.localTime)}
        </p>

        <p className="text-forest/70 mt-1 text-sm">{partyLine(trip.guests)}</p>

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
          has not answered has none, and the contract's absent case is an EMPTY
          STRING rather than a missing field, so this is a truthiness test and
          not `hasOwn`. An internal id styled as a reference is a number
          somebody will read out to no effect.
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
      className="rounded-card border-paper-line bg-paper-deep hover:border-forest/40 ease-interaction flex items-start gap-4 border p-4 transition-colors duration-200"
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
