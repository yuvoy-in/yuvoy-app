"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import { CACHE, qk } from "@/lib/query/policy";
import { formatMoney } from "@/lib/format/money";
import { formatAge } from "@/lib/format/time";
import {
  ErrorState,
  Skeleton,
  LoadingState,
  StaleNotice,
} from "@/components/states";
import { cn } from "@/lib/cn";
import type { components } from "@/lib/api/schema.gen";
import { marketDateRange } from "@/lib/booking/availability-window";

type Slot = components["schemas"]["Slot"];
type BookingMode = components["schemas"]["BookingMode"];

/**
 * T4 — dates and slots. The authority on seats.
 *
 * Four rules from the contract are enforced here, and each one has a real cost
 * attached if it is broken:
 *
 *   1. RENDER `remainingDisplay`. Never re-derive it from `remainingSeats`.
 *      It is a string, already correct, and re-deriving makes the two
 *      disagree the moment the rule changes — which has already happened once.
 *   2. A closed slot is shown DISABLED, never hidden. Hide it and the
 *      traveller concludes the day does not exist.
 *   3. `stale: true` means say WHEN it was last checked. Showing less than
 *      yesterday, silently, is the wrong move.
 *   4. Request mode publishes no seat count at all.
 *
 * `staleTime: 0` and `refetchOnWindowFocus` are deliberate: a traveller who
 * comes back to this tab after ten minutes must not be looking at a seat count
 * from before they left.
 */
export function AvailabilityPicker({
  slug,
  bookingMode,
}: {
  slug: string;
  bookingMode: BookingMode;
}) {
  // Computed once per mount. Recomputing per render would change the query
  // key at midnight mid-session and silently refetch.
  const [range] = useState(() => marketDateRange());

  const {
    data,
    error,
    isPending,
    isError,
    refetch,
    isFetching,
    dataUpdatedAt,
  } = useQuery({
    queryKey: qk.availability(slug, range.from, range.to),
    queryFn: async ({ signal }) => {
      const { data, error } = await api.GET(
        "/experiences/{slug}/availability",
        { params: { path: { slug }, query: range }, signal },
      );
      if (error) throw error;
      return data;
    },
    refetchOnWindowFocus: true,
    ...CACHE.getAvailability,
  });

  const [selected, setSelected] = useState<string | null>(null);

  // Group by the MARKET's local date, never the device's. A 7am dive grouped
  // under "yesterday" because the phone is on GMT is a missed boat.
  const days = useMemo(() => {
    const map = new Map<string, Slot[]>();
    for (const slot of data?.slots ?? []) {
      const list = map.get(slot.localDate) ?? [];
      list.push(slot);
      map.set(slot.localDate, list);
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [data?.slots]);

  if (isPending) {
    return (
      <LoadingState label="Loading dates">
        <div className="mt-4 space-y-3">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </div>
      </LoadingState>
    );
  }

  if (isError) {
    return (
      <div className="mt-4">
        <ErrorState error={error} onRetry={() => void refetch()} />
      </div>
    );
  }

  const suppressed = data.staleSlotsSuppressed;

  // Empty and "we withheld some" are different things, and the traveller is
  // owed the difference.
  if (days.length === 0) {
    return (
      <div className="rounded-edge border-cream-line bg-cream-deep mt-4 border p-5">
        <p className="text-sm font-bold">No dates on sale right now</p>
        <p className="text-forest/70 mt-1.5 text-sm">
          {suppressed > 0
            ? `We are holding back ${suppressed} departure${suppressed === 1 ? "" : "s"} we could not confirm with the operator recently enough to sell. Ask us and we will check.`
            : "This operator has not put any departures on sale yet."}
        </p>
      </div>
    );
  }

  return (
    <div className="mt-4">
      {isFetching ? (
        <p className="label text-forest/60 mb-3" role="status">
          Checking seats…
        </p>
      ) : null}

      <div className="space-y-6">
        {days.map(([date, slots]) => (
          <div key={date}>
            <h3 className="label text-forest/75">{formatDayHeading(date)}</h3>
            <ul className="mt-2.5 space-y-2">
              {slots.map((slot) => (
                <li key={slot.id}>
                  <SlotRow
                    slot={slot}
                    selected={selected === slot.id}
                    onSelect={() => setSelected(slot.id)}
                  />
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      {selected ? (
        <Link
          href={`/e/${slug}/book?slot=${encodeURIComponent(selected)}`}
          className="rounded-edge label bg-forest text-cream mt-5 flex h-13 items-center justify-center font-bold transition-transform active:scale-[0.99]"
        >
          {bookingMode === "request" ? "Ask the operator" : "Continue"}
        </Link>
      ) : null}

      {suppressed > 0 ? (
        <StaleNotice className="mt-5" onRefresh={() => void refetch()}>
          {suppressed} more departure{suppressed === 1 ? "" : "s"} exist that we
          could not confirm recently enough to sell.
        </StaleNotice>
      ) : null}

      <p className="text-forest/50 mt-5 text-xs">
        Seats last checked{" "}
        {formatAge(data.availabilityAsOf, new Date(dataUpdatedAt))}
        {bookingMode === "request"
          ? ". This operator confirms by hand, so nothing is held until they say yes."
          : "."}
      </p>
    </div>
  );
}

function SlotRow({
  slot,
  selected,
  onSelect,
}: {
  slot: Slot;
  selected: boolean;
  onSelect: () => void;
}) {
  const closed = slot.status !== "open";
  const full = slot.remainingDisplay === "Full";
  const request = slot.bookingMode === "request";
  const stale = slot.availability?.stale === true;
  const disabled = closed || full;

  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={disabled}
      aria-pressed={selected}
      className={cn(
        "rounded-edge w-full border p-4 text-left transition-colors",
        disabled
          ? // Disabled, NOT hidden. Still legible: a greyed row a traveller
            // cannot read is the same as a hidden one.
            "border-cream-line bg-cream-deep/50 cursor-not-allowed opacity-70"
          : "border-cream-line bg-cream-deep hover:border-forest/30",
        selected && !disabled && "border-terra-deep",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          {/* The market's own formatted time. Never re-derived from startsAt. */}
          <p className="text-base font-bold">
            {trimSeconds(slot.localStartTime)}
          </p>
          <p className="text-forest/60 mt-0.5 text-xs">
            {durationLabel(slot)}
            {request ? " · operator confirms" : ""}
          </p>
        </div>

        <div className="text-right">
          {slot.price ? (
            <p className="text-sm font-bold">{formatMoney(slot.price)}</p>
          ) : null}
          {/*
            THE string. Rendered, never re-derived. For request mode it is
            wording that promises an answer, never a seat.
          */}
          <p
            className={cn(
              "label mt-1",
              full || closed ? "text-forest/60" : "text-terra-deep",
            )}
          >
            {slot.remainingDisplay ?? (closed ? "Closed" : "")}
          </p>
        </div>
      </div>

      {/*
        Stale: say when it was last checked and how. Showing less than we did
        yesterday, silently, is the wrong move — `asOf` and `verifiedVia` are
        on the response for exactly this.
      */}
      {stale && slot.availability ? (
        <p className="text-forest/60 border-cream-line mt-3 border-t pt-2.5 text-xs">
          Seat count last confirmed {formatAge(slot.availability.asOf)}
          {slot.availability.verifiedVia
            ? ` (${verifiedViaLabel(slot.availability.verifiedVia)})`
            : ""}
          . We are showing the departure but not a number.
        </p>
      ) : null}

      {closed ? (
        <p className="text-forest/60 border-cream-line mt-3 border-t pt-2.5 text-xs">
          Booking for this departure has closed.
        </p>
      ) : null}
    </button>
  );
}

/* ------------------------------------------------------------------ labels */

function trimSeconds(hms: string): string {
  return hms.slice(0, 5);
}

function durationLabel(slot: Slot): string {
  const mins = Math.round(
    (new Date(slot.endsAt).getTime() - new Date(slot.startsAt).getTime()) /
      60000,
  );
  if (!Number.isFinite(mins) || mins <= 0) return "";
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h ? `${h}h${m ? ` ${m}m` : ""}` : `${m}m`;
}

function formatDayHeading(localDate: string): string {
  // The date is already the market's own; parse it at the market offset so it
  // cannot slip a day on a device west of IST.
  return new Intl.DateTimeFormat("en-IN", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "Asia/Kolkata",
  }).format(new Date(`${localDate}T12:00:00+05:30`));
}

function verifiedViaLabel(via: string): string {
  switch (via) {
    case "manifest_call":
      return "by phone";
    case "operator_message":
      return "by message";
    case "operator_portal":
      return "by the operator";
    case "ops_correction":
      return "corrected by us";
    default:
      return via;
  }
}
