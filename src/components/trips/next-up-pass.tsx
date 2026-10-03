"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { createApiClient } from "@/lib/api/client";
import { qk } from "@/lib/query/policy";
import { clockOffsetMs } from "@/lib/booking/clock";
import { bookingUrl } from "@/lib/booking/token-store";
import { formatMoney } from "@/lib/format/money";
import { untilPhrase } from "@/lib/trips/next-up";
import { partyLine, type ServerTrip } from "@/lib/trips/tabs";
import {
  UPDATE_LABEL,
  formatSentAt,
  tripWhen,
  updateKind,
} from "@/components/booking/trip-copy";
import { ArrowRightIcon } from "@/components/ui/icons";
import type { components } from "@/lib/api/schema.gen";

type BookingStatus = components["schemas"]["BookingStatus"];

/**
 * The trip that leaves within a day, drawn whole at the top of Trips (the
 * approved redesign: traveller A with C's Next up pass, 3 Oct 2026).
 *
 * A boarding pass rather than a card: when it leaves and how long that is, the
 * reference to read out at the jetty, where to meet, what the operator last
 * said, and what to bring. Everything for the morning without opening a page,
 * and the booking one tap away for the rest.
 *
 * Its own row carries most of it. The landmark and the operator's latest note
 * are on the booking itself, so this one trip's status is read once, quietly,
 * on the booking page's own query key (opening the booking afterwards is then
 * instant). The pass is complete without them: a status that is slow or fails
 * leaves those two lines out and says nothing about it.
 */
export function NextUpPass({ trip, now }: { trip: ServerTrip; now: number }) {
  /*
    The countdown, kept current while the screen is open. Read on an interval
    rather than during render, which would be an impure read the compiler
    refuses; the first value is the list's own server-clock instant.
  */
  const [clock, setClock] = useState(now);
  useEffect(() => {
    const id = setInterval(
      () => setClock(Date.now() + clockOffsetMs()),
      30_000,
    );
    return () => clearInterval(id);
  }, []);

  const status = useQuery({
    queryKey: qk.bookingStatus(trip.statusToken),
    queryFn: async ({ signal }) => {
      const client = createApiClient();
      const { data, error } = await client.GET("/bookings/status", {
        headers: { Authorization: `Bearer ${trip.statusToken}` },
        signal,
      });
      if (error) throw error;
      return data as BookingStatus;
    },
    staleTime: 60_000,
    retry: false,
  });
  // The extras only; a status that is still arriving or failed adds nothing.
  const extras = status.isPending || status.isError ? null : status.data;
  const landmark = extras?.meetingPoint?.landmark?.trim();
  const update = extras?.operatorUpdates?.[0];
  const updateAt = update?.sentAt
    ? formatSentAt(update.sentAt, trip.timezone)
    : null;

  const until = untilPhrase(trip.startsAt, clock);
  const when = tripWhen(
    { startsAt: trip.startsAt, timezone: trip.timezone },
    clock,
  );
  const cash =
    trip.payment?.method === "cash" && trip.payment.collected !== true
      ? formatMoney({
          amountMinor: trip.payment.amountPaise,
          currency: trip.price?.currency ?? "INR",
        })
      : null;
  const meeting = trip.meetingPoint?.trim();

  return (
    <section
      aria-labelledby="next-up-when"
      className="app-chrome rounded-card mt-4 overflow-hidden"
    >
      <div className="px-5 pt-5 pb-4">
        <p className="label text-terra-soft flex items-center justify-between gap-3">
          <span>Next up</span>
          {until ? <span className="text-paper/80">{until}</span> : null}
        </p>
        <h2
          id="next-up-when"
          className="font-display tracking-display mt-2 text-3xl leading-tight"
        >
          {when ?? trip.localTime}
        </h2>
        <p className="text-paper/80 mt-1 text-sm">
          {trip.experience} · {partyLine(trip.guests)}
        </p>
        {trip.reference ? (
          <div className="border-paper/15 mt-4 border-t pt-3">
            <p className="label text-paper/70">Read this out at the jetty</p>
            <p className="mt-1 text-xl font-bold tracking-wider slashed-zero tabular-nums">
              {trip.reference}
            </p>
          </div>
        ) : null}
      </div>

      <dl className="border-paper/15 space-y-3 border-t px-5 py-4 text-sm">
        {meeting || landmark ? (
          <div>
            <dt className="label text-paper/70">Where you meet</dt>
            <dd className="mt-1">
              {meeting}
              {landmark ? (
                <span className="text-paper/80 block text-xs">{landmark}</span>
              ) : null}
            </dd>
          </div>
        ) : null}
        {cash ? (
          <div>
            <dt className="label text-paper/70">Bring</dt>
            <dd className="mt-1 font-bold">{cash} in cash</dd>
          </div>
        ) : null}
        {update ? (
          <div>
            <dt className="label text-paper/70">
              From the operator{updateAt ? `, ${updateAt}` : ""}
            </dt>
            <dd className="mt-1">
              <span className="font-bold">
                {UPDATE_LABEL[updateKind(update)] ?? "Update"}
                {update.detail ? `: ${update.detail}` : ""}
              </span>
              {update.note ? (
                <span className="text-paper/80 block">{update.note}</span>
              ) : null}
            </dd>
          </div>
        ) : null}
        {trip.unreadCount > 0 ? (
          <div>
            <dt className="label text-paper/70">Messages</dt>
            <dd className="mt-1">
              {trip.unreadCount === 1
                ? "1 new from the operator"
                : `${trip.unreadCount} new from the operator`}
            </dd>
          </div>
        ) : null}
      </dl>

      <div className="border-paper/15 border-t px-5 py-4">
        <Link
          href={bookingUrl(trip.statusToken)}
          className="label text-paper hover:text-paper/80 inline-flex min-h-11 items-center gap-2 font-bold"
        >
          Everything for the morning
          <ArrowRightIcon className="size-4" />
        </Link>
      </div>
    </section>
  );
}
