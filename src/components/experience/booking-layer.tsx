"use client";

import { useState, type ReactNode } from "react";
import { AvailabilityPicker, describeSlot } from "./availability-picker";
import { StickyBar } from "@/components/ui/sticky-bar";
import { ButtonArrow, ButtonLink } from "@/components/ui/button";
import type { components } from "@/lib/api/schema.gen";

type Slot = components["schemas"]["Slot"];
type BookingMode = components["schemas"]["BookingMode"];

/**
 * The layer that turns a chosen departure into the sticky bar at the foot of
 * the detail page — the one action every reference detail screen carries.
 *
 * It wraps the WHOLE sheet body. A sticky element sticks only while its
 * parent is on screen, so the bar has to belong to a box that reaches the
 * end of the page; the sections the server renders come through `before`
 * and `after` and are placed around the picker without being re-rendered on
 * the client.
 */
export function BookingLayer({
  slug,
  bookingMode,
  bookable,
  before,
  after,
}: {
  slug: string;
  bookingMode: BookingMode;
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
  const [selected, setSelected] = useState<Slot | null>(null);
  const chosen = selected ? describeSlot(selected) : null;

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
          <AvailabilityPicker
            slug={slug}
            bookingMode={bookingMode}
            selectedId={selected?.id ?? null}
            onSelect={setSelected}
          />
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

      {/*
        The bar is unreachable when `bookable` is false — nothing can be
        selected without a picker — but the condition is written anyway. A
        sticky Book button is the single most expensive thing on this page to
        get wrong, and it should not depend on a sibling's rendering to stay
        correct.
      */}
      {bookable && selected && chosen ? (
        <StickyBar>
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="label text-forest/75">{chosen.day}</p>
              <p className="mt-0.5 truncate text-base font-bold">
                {chosen.time}
                {chosen.price ? (
                  <span className="text-forest/70 font-normal">
                    {" "}
                    · {chosen.price}
                  </span>
                ) : null}
              </p>
            </div>
            <ButtonLink
              href={`/e/${slug}/book?slot=${encodeURIComponent(selected.id)}`}
              size="lg"
              className="shrink-0"
            >
              {bookingMode === "request" ? "Ask the operator" : "Continue"}
              <ButtonArrow />
            </ButtonLink>
          </div>
        </StickyBar>
      ) : null}
    </>
  );
}
