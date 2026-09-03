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
  before,
  after,
}: {
  slug: string;
  bookingMode: BookingMode;
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
        <AvailabilityPicker
          slug={slug}
          bookingMode={bookingMode}
          selectedId={selected?.id ?? null}
          onSelect={setSelected}
        />
      </section>

      {after}

      {selected && chosen ? (
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
