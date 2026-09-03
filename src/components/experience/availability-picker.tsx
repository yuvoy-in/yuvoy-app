"use client";

import { useEffect, useMemo, useState } from "react";
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
import { Chip } from "@/components/ui/chip";
import { Panel } from "@/components/ui/panel";
import { CheckIcon } from "@/components/ui/icons";
import { cn } from "@/lib/cn";
import type { components } from "@/lib/api/schema.gen";
import { marketDateRange } from "@/lib/booking/availability-window";
import { cutoffPassed } from "@/lib/booking/slot-open";
import { clockOffsetMs } from "@/lib/booking/clock";

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
 *
 * The selection is CONTROLLED by the layer above, which owns the sticky bar
 * that carries it to checkout. The picker's one duty toward it is to hand a
 * selection back when the fresh answer says the departure is no longer open,
 * so the bar never offers a seat the server has just withdrawn.
 */
export function AvailabilityPicker({
  slug,
  bookingMode,
  selectedId,
  onSelect,
}: {
  slug: string;
  bookingMode: BookingMode;
  selectedId: string | null;
  onSelect: (slot: Slot | null) => void;
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

  /*
    "Now", as the SERVER sees it, at the moment the seats were read. The
    device clock is not consulted: a phone ten minutes fast would close every
    departure ten minutes early, and under mocking the world's clock is the
    fixture's. `dataUpdatedAt` is when this answer arrived; the offset is what
    the API's own `Date` header had taught the client by then.
  */
  const now = dataUpdatedAt + clockOffsetMs();

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

  // A fresh answer that no longer offers the chosen departure takes the
  // choice back, so the bar above cannot carry a dead slot into checkout.
  useEffect(() => {
    if (!selectedId || !data) return;
    const chosen = data.slots.find((s) => s.id === selectedId);
    if (!chosen || !isSelectable(chosen, now)) onSelect(null);
  }, [data, selectedId, now, onSelect]);

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
      <Panel className="mt-4">
        <p className="text-sm font-bold">No dates on sale right now</p>
        <p className="text-forest/70 mt-1.5 text-sm">
          {suppressed > 0
            ? `We are holding back ${suppressed} departure${suppressed === 1 ? "" : "s"} we could not confirm with the operator recently enough to sell. Ask us and we will check.`
            : "This operator has not put any departures on sale yet."}
        </p>
      </Panel>
    );
  }

  return (
    <div className="mt-4">
      {isFetching ? (
        <p className="label text-forest/70 mb-3" role="status">
          Checking seats…
        </p>
      ) : null}

      <div className="space-y-6">
        {days.map(([date, slots]) => (
          <div key={date}>
            <h3 className="label text-forest/75">{formatDayHeading(date)}</h3>
            <ul className="mt-2.5 space-y-2.5">
              {slots.map((slot) => (
                <li key={slot.id}>
                  <SlotRow
                    slot={slot}
                    now={now}
                    selected={selectedId === slot.id}
                    onSelect={() => onSelect(slot)}
                  />
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      {suppressed > 0 ? (
        <StaleNotice className="mt-5" onRefresh={() => void refetch()}>
          {suppressed} more departure{suppressed === 1 ? "" : "s"} exist that we
          could not confirm recently enough to sell.
        </StaleNotice>
      ) : null}

      <p className="text-forest/70 mt-5 text-xs">
        Seats last checked {formatAge(data.availabilityAsOf, new Date(now))}
        {bookingMode === "request"
          ? ". This operator confirms by hand, so nothing is held until they say yes."
          : "."}
      </p>
    </div>
  );
}

/** Whether a departure can still be chosen, by the same rules the row draws. */
function isSelectable(slot: Slot, now: number): boolean {
  const closed = slot.status !== "open" || cutoffPassed(slot, now);
  const full = slot.remainingDisplay === "Full";
  return !closed && !full;
}

/**
 * The chosen departure, in words, for the bar that carries it to checkout.
 * The same formatters the rows use, so the bar and the row never disagree.
 */
export function describeSlot(slot: Slot): {
  day: string;
  time: string;
  price: string | null;
} {
  return {
    day: formatDayHeading(slot.localDate),
    time: trimSeconds(slot.localStartTime),
    price: slot.price ? formatMoney(slot.price) : null,
  };
}

function SlotRow({
  slot,
  now,
  selected,
  onSelect,
}: {
  slot: Slot;
  now: number;
  selected: boolean;
  onSelect: () => void;
}) {
  // `bookingCutoffAt`: "After this instant the slot cannot be booked. Shown
  // disabled, never hidden." Read together with `status` — a slot the server
  // still calls open is closed the moment its cutoff passes.
  const closed = slot.status !== "open" || cutoffPassed(slot, now);
  const full = slot.remainingDisplay === "Full";
  const request = slot.bookingMode === "request";
  const stale = slot.availability?.stale === true;
  const disabled = closed || full;
  const chosen = selected && !disabled;
  const display = slot.remainingDisplay ?? (closed ? "Closed" : "");

  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={disabled}
      aria-pressed={selected}
      className={cn(
        "rounded-card ease-interaction w-full border p-4 text-left transition-[border-color,background-color,box-shadow] duration-200",
        disabled
          ? // Disabled, NOT hidden. Still legible: a greyed row a traveller
            // cannot read is the same as a hidden one.
            "border-cream-line bg-cream-deep/50 cursor-not-allowed opacity-70"
          : "border-cream-line bg-cream-deep hover:border-forest/40",
        chosen && "border-forest bg-cream ring-forest ring-1",
      )}
    >
      <span className="flex items-start justify-between gap-3">
        <span className="flex items-start gap-3">
          <span
            aria-hidden="true"
            className={cn(
              "ease-interaction mt-0.5 inline-flex size-6 shrink-0 items-center justify-center rounded-full border transition-colors duration-200",
              chosen
                ? "border-forest bg-forest text-cream"
                : "border-forest/25 bg-transparent",
            )}
          >
            {chosen ? <CheckIcon className="size-3.5" /> : null}
          </span>
          <span className="block">
            {/* The market's own formatted time. Never re-derived from startsAt. */}
            <span className="block text-base font-bold">
              {trimSeconds(slot.localStartTime)}
            </span>
            <span className="text-forest/70 mt-0.5 block text-xs">
              {durationLabel(slot)}
              {request ? " · operator confirms" : ""}
            </span>
          </span>
        </span>

        <span className="flex shrink-0 flex-col items-end gap-1.5">
          {slot.price ? (
            <span className="text-sm font-bold">{formatMoney(slot.price)}</span>
          ) : null}
          {/*
            THE string. Rendered, never re-derived. For request mode it is
            wording that promises an answer, never a seat.
          */}
          {display ? (
            <Chip
              size="sm"
              tone={full || closed ? "neutral" : "accent"}
              className={full || closed ? "text-forest/70" : undefined}
            >
              {display}
            </Chip>
          ) : null}
        </span>
      </span>

      {/*
        Stale: say when it was last checked and how. Showing less than we did
        yesterday, silently, is the wrong move — `asOf` and `verifiedVia` are
        on the response for exactly this.
      */}
      {stale && slot.availability ? (
        <span className="text-forest/70 border-cream-line mt-3 block border-t pt-2.5 text-xs">
          Seat count last confirmed {formatAge(slot.availability.asOf)}
          {slot.availability.verifiedVia
            ? ` (${verifiedViaLabel(slot.availability.verifiedVia)})`
            : ""}
          . We are showing the departure but not a number.
        </span>
      ) : null}

      {closed ? (
        <span className="text-forest/70 border-cream-line mt-3 block border-t pt-2.5 text-xs">
          Booking for this departure has closed.
        </span>
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
