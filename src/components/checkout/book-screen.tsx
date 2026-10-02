"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { api } from "@/lib/api/client";
import { CACHE, qk } from "@/lib/query/policy";
import {
  marketToday,
  marketDateRange,
  CALENDAR_WINDOW_DAYS,
} from "@/lib/booking/availability-window";
import { clockOffsetMs } from "@/lib/booking/clock";
import { fetchAvailability } from "@/lib/booking/availability-query";
import { paymentLine } from "@/lib/booking/listing-lines";
import {
  daysFromSlots,
  firstOpenDay,
  type DayAvailability,
} from "@/lib/booking/day-availability";
import { monthStart } from "@/lib/search/month-grid";
import { civilFromDate, civilInZone, weekdayDayMonth } from "@/lib/format/date";
import { CheckoutForm } from "@/components/checkout/checkout-form";
import { DatePicker } from "./date-picker";
import { slotIsOpen } from "@/lib/booking/slot-open";
import { TimePicker } from "./time-picker";
import { ErrorState, LoadingState, Skeleton } from "@/components/states";
import { Screen } from "@/components/chrome/screen";
import { Panel } from "@/components/ui/panel";
import type { components } from "@/lib/api/schema.gen";

type Slot = components["schemas"]["Slot"];

/**
 * Checkout: day, time, party and details, on one page (yuvoy-app#62).
 *
 * ## It no longer needs a departure to open
 *
 * This screen used to require `?slot=` and refused to render without one,
 * because the listing page chose the departure and handed it over. The owner
 * moved that choice here on 14 September: "Tapping it opens no date pop-up. It
 * goes straight to the checkout page."
 *
 * So the listing has one sticky button with no query on it, and everything a
 * traveller decides happens on this page, in the order they decide it.
 *
 * ## The URL keeps the choices, and `replace` is why
 *
 * `?date=&slot=&guests=` is written with `router.replace`, not `push`. A
 * `push` would put every tap of a calendar square in the history, so Back
 * would walk a traveller through their own deliberation instead of returning
 * to the listing. The issue asks for both: choices survive a refresh, and
 * "Back returns to the listing page".
 *
 * An old `?slot=&guests=` link still opens with that departure chosen, which
 * is what makes every bookmark and every link in the wild from before this
 * change keep working.
 *
 * ## The slot is read fresh, always
 *
 * Never carried through navigation state. A seat count from the previous
 * screen is a seat count that was true when that screen rendered, and checkout
 * is the one place that distinction costs money.
 */
export function BookScreen({ slug }: { slug: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  /*
    "the listing", not "this experience". `checkoutRefusal` renders its own
    "Back to this experience" link inside the form, and two links with one
    accessible name on the same screen is ambiguous to anybody navigating by
    name. Playwright found it as a strict-mode violation, which is the same
    fact stated by a machine.
  */
  const back = { href: `/e/${slug}`, label: "the listing" };

  const urlDate = params.get("date");
  const urlSlot = params.get("slot");
  const urlGuests = Number(params.get("guests"));
  const initialGuests =
    Number.isInteger(urlGuests) && urlGuests > 0 ? urlGuests : 1;

  const [date, setDate] = useState<string | null>(urlDate);
  const [slotId, setSlotId] = useState<string | null>(urlSlot);
  const range = useMemo(() => marketDateRange(CALENDAR_WINDOW_DAYS), []);
  const [guests, setGuests] = useState(initialGuests);
  /** Shown above the calendar after the API refuses a reservation. */
  const [refusal, setRefusal] = useState<string | null>(null);

  const experience = useQuery({
    queryKey: qk.experience(slug),
    queryFn: async ({ signal }) => {
      const { data, error } = await api.GET("/experiences/{slug}", {
        params: { path: { slug } },
        signal,
      });
      if (error) throw error;
      return data;
    },
    ...CACHE.getExperience,
  });

  /*
    ONE request for the whole window, not one per month.

    90 inclusive days is the API's own ceiling and exactly the span a traveller
    may choose, so a single call answers every month the arrows can reach. See
    `CALENDAR_WINDOW_DAYS` for the three reasons that beats fetching per month;
    the load-bearing one is that "the month of the first open day" is not
    knowable per month without a search loop.
  */
  const availability = useQuery({
    queryKey: qk.availability(slug, range.from, range.to),
    queryFn: ({ signal }) => fetchAvailability(slug, range, signal),
    ...CACHE.getAvailability,
  });

  /*
    The SERVER's clock at the moment these seats were read, not the device's.
    Whether a departure is past its cutoff decides whether a square can be
    tapped, and a phone with a skewed clock would grey out open departures or
    offer closed ones.
  */
  /*
    TODAY IS THE SERVER'S, NOT THE DEVICE'S.

    `marketToday()` reads the device clock through `Intl`, and every square in
    the calendar is greyed or offered by comparing against it. A phone a day
    behind would grey out a day the server is still selling, and one a day
    ahead would offer a day it has closed.

    `availabilityAsOf` is the moment the API answered, so it is the clock that
    decided which departures are in that payload at all. Reading the day out of
    it in the market's own zone makes the calendar agree with the data it is
    drawing, by construction rather than by luck.

    It also made this testable. Every fixture is dated relative to a fixed
    `FIXTURE_NOW`, so against a device clock months later the whole calendar was
    in the past and no square could be pressed. That is the same trap in a
    different costume: a fixture pinned to a literal meeting a component that
    reads the real clock.

    Falls back to the device while the first read is in flight, which is only
    ever the skeleton.
  */
  const asOf = availability.data?.availabilityAsOf;
  const today = useMemo(() => {
    if (!asOf) return marketToday();
    const civil = civilInZone(
      asOf,
      availability.data?.marketTimezone ?? "Asia/Kolkata",
    );
    return civil
      ? `${civil.year}-${String(civil.month).padStart(2, "0")}-${String(civil.day).padStart(2, "0")}`
      : marketToday();
  }, [asOf, availability.data?.marketTimezone]);

  const now = availability.dataUpdatedAt + clockOffsetMs();
  const days = useMemo(
    () => daysFromSlots(availability.data?.slots, now),
    [availability.data, now],
  );

  /*
    Where the calendar opens, DERIVED rather than set in an effect.

    "First month shown: the month of the first open day." A calendar that opens
    on today for a listing whose next departure is five weeks out shows a month
    of grey and asks the traveller to work out that they should press the arrow.

    The first version of this did it in an effect and `react-hooks/
    set-state-in-effect` refused it, correctly: this is derived state, and an
    effect that sets it renders once with the wrong month and then corrects
    itself. `userAnchor` is null until the traveller steps a month themselves,
    and from then on it wins, so nothing can pull them back.
  */
  const [userAnchor, setUserAnchor] = useState<string | null>(
    urlDate ? monthStart(urlDate) : null,
  );
  const anchor =
    userAnchor ?? monthStart(firstOpenDay(days) ?? urlDate ?? today);

  const chosenDay: DayAvailability | undefined = date
    ? days.get(date)
    : undefined;

  /*
    One open departure that day is not a choice, it is the answer. Derived
    rather than set in an effect, for the reason above: an effect would render
    one frame with no departure chosen and the rest of checkout hidden, then
    pop it in.

    The chips still render, so the traveller can see what they have.
  */
  const openThatDay = chosenDay
    ? chosenDay.slots.filter((s) => !s.soldOut && slotIsOpen(s, now))
    : [];
  const effectiveSlotId =
    slotId ?? (openThatDay.length === 1 ? openThatDay[0].id : null);
  const slot: Slot | null =
    chosenDay?.slots.find((s) => s.id === effectiveSlotId) ?? null;

  /*
    The URL follows the choices. `replace`, so Back leaves the page rather than
    walking back through a traveller's own deliberation.

    It writes `effectiveSlotId`, not `slotId`, and the difference is a real
    one: a day with a single open departure selects it without the traveller
    tapping, so `slotId` is still null while a departure IS chosen. Writing the
    raw state left `?date=` alone in the URL, and a link copied at that moment
    would open with the day but no time.
  */
  useEffect(() => {
    const next = new URLSearchParams();
    if (date) next.set("date", date);
    if (effectiveSlotId) next.set("slot", effectiveSlotId);
    if (guests > 1) next.set("guests", String(guests));
    const query = next.toString();
    const target = query ? `${pathname}?${query}` : pathname;
    if (`${pathname}?${params.toString()}` !== target) {
      router.replace(target, { scroll: false });
    }
  }, [date, effectiveSlotId, guests, pathname, params, router]);

  if (experience.isPending) {
    return (
      <Screen back={back} stageLabel="Checkout">
        <LoadingState label="Loading checkout">
          <div className="space-y-4">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-48 w-full" />
          </div>
        </LoadingState>
      </Screen>
    );
  }

  if (experience.isError) {
    return (
      <Screen back={back} stageLabel="Checkout">
        <ErrorState
          error={experience.error}
          onRetry={() => void experience.refetch()}
        />
      </Screen>
    );
  }

  const chosenCivil = date ? civilFromDate(date) : null;

  return (
    <Screen back={back} stageLabel="Checkout">
      <p className="eyebrow text-terra-deep">{experience.data.title}</p>
      <h1 className="font-display tracking-display mt-3 text-3xl leading-tight">
        {chosenCivil && slot
          ? `${weekdayDayMonth(chosenCivil)} · ${(slot.localStartTime ?? "").slice(0, 5)}`
          : "When would you like to go?"}
      </h1>
      {/*
        Said before a day is chosen, not discovered at the pay step
        (yuvoy-app#110). The same line, from the same source, as the listing.
      */}
      <p className="text-forest/80 mt-2 text-sm">
        {paymentLine(experience.data)}
      </p>

      {/*
        The API's own sentence, above the calendar, after it refuses. Seats
        gone and a moved price are both "the calendar you were looking at is
        out of date", which is exactly where the traveller's eyes go next.
      */}
      {refusal ? (
        <Panel tone="alert" role="alert" className="mt-6">
          <p className="text-sm">{refusal}</p>
        </Panel>
      ) : null}

      <div className="mt-8">
        <DatePicker
          anchor={anchor}
          onAnchor={setUserAnchor}
          days={days}
          value={date}
          today={today}
          state={
            availability.isPending
              ? "pending"
              : availability.isError
                ? "error"
                : "ready"
          }
          onRetry={() => void availability.refetch()}
          onSelect={(picked) => {
            setDate(picked);
            setRefusal(null);
            /*
              The previous departure belongs to the previous day. Cleared here
              so the summary can never name a time from another date, and the
              single-open-departure rule above re-answers for the new day.
            */
            setSlotId(null);
          }}
        />
      </div>

      {chosenDay ? (
        <TimePicker
          slots={chosenDay.slots}
          value={effectiveSlotId}
          now={now}
          onSelect={(picked) => {
            setSlotId(picked.id);
            setRefusal(null);
          }}
        />
      ) : null}

      {/*
        The rest of checkout appears once there is a departure to check out of.
        Keyed by the slot so choosing a different one resets the party size and
        every answer: the cap is the departure's, and an answer given for one
        boat is not an answer for another.
      */}
      {slot ? (
        <div className="mt-8 flex flex-1 flex-col">
          <CheckoutForm
            key={slot.id}
            experience={experience.data}
            slot={slot}
            initialGuests={guests}
            onGuestsChange={setGuests}
            onRefused={(message) => {
              setRefusal(message);
              void availability.refetch();
            }}
          />
        </div>
      ) : null}
    </Screen>
  );
}
