"use client";

import { useState, type ReactNode } from "react";
import { AvailabilityPicker, describeSlot } from "./availability-picker";
import { AskSheet } from "./ask-sheet";
import { Sheet } from "@/components/ui/sheet";
import { StickyBar } from "@/components/ui/sticky-bar";
import { Panel } from "@/components/ui/panel";
import { PartyStepper } from "@/components/ui/party-stepper";
import { Button, ButtonArrow, ButtonLink } from "@/components/ui/button";
import { CalendarIcon } from "@/components/ui/icons";
import type { components } from "@/lib/api/schema.gen";

type Experience = components["schemas"]["Experience"];
type Slot = components["schemas"]["Slot"];

/**
 * Choosing a departure and a party size, and the bar that carries them.
 *
 * ## The 14-day list became a pop-up — yuvoy-app#32
 *
 * Every day in the window was stacked on the page. The owner walked it and
 * called it an endless scroll: "make this simple sweet." "Pick a day" is a
 * button now, and the pop-up holds a row of days and that day's departures.
 *
 * ## Party size moved here from checkout
 *
 * "I should book for my family, friends, right?" The only party control was at
 * checkout, so a traveller had to commit to a departure before they could say
 * there were four of them. The same `PartyStepper` the checkout form uses, so
 * the two cannot disagree about the cap, and the count travels to checkout in
 * the URL.
 *
 * ## Request mode never leaves the page
 *
 * A request charges nothing and holds nothing until the operator answers, so
 * a whole checkout page for three fields was a screen between a traveller and
 * a question they had already decided to ask. Allotment mode still goes to
 * `/e/{slug}/book`: that one takes money, and money gets a page.
 *
 * It wraps the WHOLE sheet body, because a sticky element sticks only while
 * its parent is on screen — so the bar has to belong to a box that reaches the
 * end of the page. The sections the server renders come through `before` and
 * `after` and are placed around the picker without being re-rendered here.
 */
export function BookingLayer({
  experience,
  bookable,
  before,
  after,
}: {
  experience: Experience;
  /**
   * Whether this listing can be sold right now — yuvoy-app#19 §1.
   *
   * False when the operator is not selling, a kill switch is engaged, the
   * listing has no price, or a credential their market and activity category
   * require is missing, unverified or expired.
   *
   * **It carries no reason and this screen invents none.** Why a business has
   * stopped selling is a supply judgement about them and does not belong on a
   * traveller endpoint, so the copy says the state and stops. It also must not
   * imply the operator is gone — the page is still a 200 precisely because the
   * traveller arrived by a link, a bookmark or a search result, and "this does
   * not exist" would be worse than "not right now".
   */
  bookable: boolean;
  before?: ReactNode;
  after?: ReactNode;
}) {
  const slug = experience.slug;
  const [selected, setSelected] = useState<Slot | null>(null);
  const [day, setDay] = useState<string | null>(null);
  const [guests, setGuests] = useState(1);
  const [datesOpen, setDatesOpen] = useState(false);
  const [askOpen, setAskOpen] = useState(false);

  const chosen = selected ? describeSlot(selected) : null;
  const isRequest = experience.bookingMode === "request";
  /*
    The cap the API enforces. A departure may narrow the listing's own, so the
    departure wins when both are there — asking for more than one boat holds is
    refused with `capacity_unavailable` whatever the listing says.
  */
  const maxParty = selected?.maxPartySize ?? experience.maxPartySize ?? 10;

  return (
    <>
      {before}

      <section
        id="dates"
        className="mt-10 scroll-mt-6"
        aria-labelledby="dates-heading"
      >
        <h2
          id="dates-heading"
          className="font-display tracking-display text-2xl"
        >
          Pick a day
        </h2>

        {bookable ? (
          <>
            <Panel className="mt-4">
              <button
                type="button"
                onClick={() => setDatesOpen(true)}
                className="flex w-full items-center gap-3 text-left"
              >
                <CalendarIcon className="text-forest/70 size-5 shrink-0" />
                <span className="min-w-0 flex-1">
                  {chosen ? (
                    <>
                      <span className="block text-base font-bold">
                        {chosen.day}
                      </span>
                      <span className="text-forest/70 mt-0.5 block text-sm">
                        {chosen.time}
                      </span>
                    </>
                  ) : (
                    <span className="block text-base font-bold">
                      Choose a departure
                    </span>
                  )}
                </span>
                <span className="text-forest/70 shrink-0 text-sm underline underline-offset-4">
                  {chosen ? "Change" : "See days"}
                </span>
              </button>
            </Panel>

            {/*
              Party size BEFORE asking, which is the whole point of moving it
              off checkout. Capped at the departure's own `maxPartySize` once
              one is chosen, and at the listing's until then.
            */}
            <PartyStepper
              className="mt-6"
              value={guests}
              onChange={setGuests}
              max={maxParty}
            />
          </>
        ) : (
          /*
            No picker at all, rather than a picker that will always be empty.

            `bookable: false` always comes with `slots: []`, so rendering the
            picker would show the ordinary "no dates in this window" state —
            which is a different thing and would send somebody looking for
            another month that does not exist either.

            Neutral, and no reason. See the prop's own note.
          */
          <p className="text-forest/80 mt-4 max-w-prose text-base">
            This experience is not available to book right now. Everything else
            on Yuvoy is still bookable.
          </p>
        )}
      </section>

      {after}

      {datesOpen ? (
        <Sheet open onClose={() => setDatesOpen(false)} title="Pick a day">
          <AvailabilityPicker
            slug={slug}
            bookingMode={experience.bookingMode}
            selectedId={selected?.id ?? null}
            onSelect={(slot) => {
              setSelected(slot);
              // Choosing is the whole reason the sheet is open. Staying would
              // make a traveller find the close control to see what they did.
              if (slot) setDatesOpen(false);
            }}
            day={day}
            onDay={setDay}
          />
        </Sheet>
      ) : null}

      {askOpen && selected ? (
        <AskSheet
          experience={experience}
          slot={selected}
          guests={guests}
          onClose={() => setAskOpen(false)}
        />
      ) : null}

      {/*
        The bar is unreachable when `bookable` is false — nothing can be
        selected without a picker — but the condition is written anyway. A
        sticky Book button is the single most expensive thing on this page to
        get wrong, and it should not depend on a sibling's rendering to stay
        correct.

        NO PRICE, as asked. It was beside the time, and the sticky bar is the
        last thing a traveller reads before committing: a per-person figure
        there reads as the total, and the total is on the screen that takes the
        money. The chosen day and time stay, because that is what the bar is
        confirming.
      */}
      {bookable && selected && chosen ? (
        <StickyBar>
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="label text-forest/75">{chosen.day}</p>
              <p className="mt-0.5 truncate text-base font-bold">
                {chosen.time}
              </p>
            </div>
            {isRequest ? (
              <Button
                size="lg"
                className="shrink-0"
                onClick={() => setAskOpen(true)}
              >
                Ask the operator
                <ButtonArrow />
              </Button>
            ) : (
              <ButtonLink
                href={`/e/${slug}/book?slot=${encodeURIComponent(selected.id)}&guests=${guests}`}
                size="lg"
                className="shrink-0"
              >
                Continue
                <ButtonArrow />
              </ButtonLink>
            )}
          </div>
        </StickyBar>
      ) : null}
    </>
  );
}
