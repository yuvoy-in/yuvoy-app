"use client";

import { useState } from "react";
import Link from "@/components/ui/link";
import { useMyBookings } from "@/lib/auth/use-traveller";
import {
  marketDayOf,
  marketToday,
  marketDaysFrom,
} from "@/lib/booking/availability-window";
import { clockOffsetMs } from "@/lib/booking/clock";
import { bookingUrl } from "@/lib/booking/token-store";
import { dateLabel } from "@/lib/search/labels";
import { filtersToParams } from "@/lib/search/filters";
import {
  MAX_STAY_DAYS,
  planDays,
  stayLength,
  type Stay,
} from "@/lib/trips/stay";
import { useStay } from "@/lib/trips/use-stay";
import { StateChip } from "@/components/booking/state-chip";
import { LoadingState, Skeleton } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Panel } from "@/components/ui/panel";
import { Sheet, SheetPresence } from "@/components/ui/sheet";

/**
 * Your island days (the approved redesign: traveller A with C's day plan in
 * Trips, 3 Oct 2026).
 *
 * A traveller says which days they are here, and Trips lays them out: each
 * day with what they booked or asked for on it, and the free ones with a way
 * into what runs that day. The question a list of bookings cannot answer at a
 * glance is "what am I doing on Saturday, and is Sunday free".
 *
 * ## What it does not claim
 *
 * "Nothing booked" is said only about a day this screen has actually read.
 * The bookings come from the stay's own range (`GET /me/bookings` with `from`
 * and `to`), and if there are more than one page of them the days past the
 * last one read say so instead. A free day links to Search on that day
 * (`bookableOn`), one request when it is opened; showing what fits across the
 * whole stay at once waits on a range filter (yuvoy-api#258).
 *
 * ## Where the dates live
 *
 * On this phone, until the account can keep them (yuvoy-api#257), and the
 * section says so in as many words.
 */
export function IslandDays({ signedIn }: { signedIn: boolean }) {
  const { stay, save } = useStay();
  const [editing, setEditing] = useState(false);
  const value = stay.data ?? null;

  // The stay's own trips: the whole range, on its own query.
  const trips = useMyBookings(value ? signedIn : false, {
    tab: "upcoming",
    from: value?.from,
    to: value?.to,
  });

  /*
    Keyed, so it is the same sheet in whichever panel below draws it: saving
    can change which one that is while the sheet is still leaving.
  */
  const sheet = (
    <SheetPresence key="stay-sheet" open={editing}>
      <StaySheet
        stay={value}
        onSave={(next) => save.mutate(next)}
        onClose={() => setEditing(false)}
      />
    </SheetPresence>
  );

  // The device store answers in a moment; nothing is drawn until it has.
  if (stay.isPending) return null;

  if (!value) {
    return (
      <Panel className="mt-6">
        <section aria-labelledby="island-days">
          <h2 id="island-days" className="text-base font-bold text-balance">
            Your island days
          </h2>
          <p className="text-forest/70 text-body mt-1.5 text-pretty">
            Tell us the days you are here, and Trips lays them out with what you
            have booked on each, and what runs on the free ones.
          </p>
          <Button className="mt-4" onClick={() => setEditing(true)}>
            Set your days
          </Button>
          <p className="text-forest/70 mt-3 text-xs">
            Your dates are kept on this phone.
          </p>
        </section>
        {sheet}
      </Panel>
    );
  }

  const header = (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <h2 id="island-days" className="text-base font-bold text-balance">
          Your island days
        </h2>
        <p className="text-forest/70 mt-0.5 text-sm tabular-nums">
          {dateLabel(value.from)} to {dateLabel(value.to)}
        </p>
      </div>
      <Button variant="ghost" size="sm" onClick={() => setEditing(true)}>
        Change
      </Button>
    </div>
  );

  if (trips.isPending) {
    return (
      <Panel className="mt-6">
        <section aria-labelledby="island-days">
          {header}
          <LoadingState label="Laying out your days">
            <div className="mt-4 space-y-3">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          </LoadingState>
        </section>
        {sheet}
      </Panel>
    );
  }

  if (trips.isError) {
    return (
      <Panel className="mt-6">
        <section aria-labelledby="island-days">
          {header}
          <p role="alert" className="text-forest/80 mt-4 text-sm">
            What you have booked on these days did not load. Your trips are
            still listed below.
          </p>
          <Button
            variant="outline"
            size="sm"
            className="mt-3"
            onClick={() => void trips.refetch()}
          >
            Try again
          </Button>
        </section>
        {sheet}
      </Panel>
    );
  }

  const rows = trips.data.pages.flatMap((page) => page.bookings);
  // The market's day by the server's clock, the instant these rows resolved.
  const today = marketDayOf(trips.dataUpdatedAt + clockOffsetMs());
  const plan = planDays(value, rows, today);
  /*
    The latest day this screen has read every booking for. With more than a
    page in the stay, a day past the last row read is not known to be free.
  */
  const readThrough = trips.hasNextPage ? rows.at(-1)?.localDate : undefined;

  if (plan.state === "over") {
    return (
      <Panel className="mt-6">
        <section aria-labelledby="island-days">
          <h2 id="island-days" className="text-base font-bold text-balance">
            Your island days
          </h2>
          <p className="text-forest/70 text-body mt-1.5 text-pretty">
            They ended on {dateLabel(value.to)}. Coming back? Set your new days.
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <Button onClick={() => setEditing(true)}>Set new days</Button>
            <Button variant="outline" onClick={() => save.mutate(null)}>
              Clear them
            </Button>
          </div>
        </section>
        {sheet}
      </Panel>
    );
  }

  return (
    <Panel className="mt-6">
      <section aria-labelledby="island-days">
        {header}
        <ol className="divide-paper-line mt-3 divide-y">
          {plan.days.map((day) => (
            <li key={day.date} className="py-3">
              <p className="text-sm font-bold tabular-nums">{day.label}</p>
              {day.trips.length > 0 ? (
                <ul className="mt-1.5 space-y-1.5">
                  {day.trips.map((trip) => (
                    <li
                      key={trip.reference || trip.reservationId}
                      className="flex flex-wrap items-center gap-2 text-sm"
                    >
                      <Link
                        href={bookingUrl(trip.statusToken)}
                        className="tap-target underline"
                      >
                        {/*
                          Real spaces, not margins: a link's name is built from its text
                          without layout, and margins alone read as "07:00Try-dive" to a
                          screen reader.
                        */}
                        <span className="tabular-nums">{trip.localTime}</span>{" "}
                        <span aria-hidden="true">·</span>{" "}
                        <span className="voice-host">{trip.experience}</span>
                      </Link>
                      {trip.state === "pending_request" ? (
                        <StateChip state={trip.state} />
                      ) : null}
                    </li>
                  ))}
                </ul>
              ) : readThrough !== undefined && day.date > readThrough ? (
                <p className="text-forest/70 mt-1 text-sm">
                  More trips than shown here: see your trips below.
                </p>
              ) : (
                <p className="text-forest/70 mt-1 flex flex-wrap items-center gap-x-2 text-sm">
                  Nothing booked.
                  <Link
                    href={`/search?${filtersToParams({ bookableOn: day.date }).toString()}`}
                    className="text-terra-deep tap-target font-bold underline"
                  >
                    See what runs
                  </Link>
                </p>
              )}
            </li>
          ))}
        </ol>
        <p className="text-forest/70 mt-2 text-xs">
          Your dates are kept on this phone.
        </p>
      </section>
      {sheet}
    </Panel>
  );
}

/**
 * Setting the days. Two date inputs, as the Trips date filter uses, for the
 * same reason: the platform's own picker is the right shape for a span. The
 * first day is today or later, the last is not before the first, and a stay
 * is at most `MAX_STAY_DAYS` long, held by `min` and `max` and checked again,
 * because `min` on a date input is advisory.
 */
function StaySheet({
  stay,
  onSave,
  onClose,
}: {
  stay: Stay | null;
  onSave: (next: Stay | null) => void;
  onClose: () => void;
}) {
  const [today] = useState(marketToday);
  const [from, setFrom] = useState(stay?.from ?? "");
  const [to, setTo] = useState(stay?.to ?? "");

  const latest = from ? marketDaysFrom(from, MAX_STAY_DAYS).at(-1) : undefined;
  const backwards = Boolean(from && to && to < from);
  const tooLong =
    Boolean(from && to && !backwards) &&
    stayLength({ from, to }) > MAX_STAY_DAYS;
  const past = Boolean(to && to < today);
  const ready = Boolean(from && to) && !backwards && !tooLong && !past;

  return (
    <Sheet
      open
      onClose={onClose}
      title="Your island days"
      footer={
        <div className="flex gap-3">
          {stay ? (
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => {
                onSave(null);
                onClose();
              }}
            >
              Clear
            </Button>
          ) : null}
          <Button
            className="flex-1"
            disabled={!ready}
            onClick={() => {
              onSave({ from, to });
              onClose();
            }}
          >
            Save
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <Field
          label="Arriving"
          type="date"
          value={from}
          min={today}
          max={to || undefined}
          onChange={(e) => setFrom(e.target.value)}
        />
        <Field
          label="Leaving"
          type="date"
          value={to}
          min={from || today}
          max={latest}
          onChange={(e) => setTo(e.target.value)}
          error={
            backwards
              ? "That is before the day you arrive."
              : tooLong
                ? `That is more than ${MAX_STAY_DAYS} days.`
                : past
                  ? "That day has gone."
                  : undefined
          }
        />
        <p className="text-forest/70 text-xs">
          Kept on this phone. Nothing is booked by setting them.
        </p>
      </div>
    </Sheet>
  );
}
