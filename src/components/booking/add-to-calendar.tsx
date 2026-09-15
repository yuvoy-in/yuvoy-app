"use client";

import { useState } from "react";
import { createApiClient } from "@/lib/api/client";
import { buildIcs, icsFilename } from "@/lib/booking/calendar";
import { Button } from "@/components/ui/button";
import { CalendarIcon } from "@/components/ui/icons";
import type { components } from "@/lib/api/schema.gen";

type BookingStatus = components["schemas"]["BookingStatus"];

/** How long to wait for a finishing time before writing the file without one. */
const DURATION_BUDGET_MS = 1500;

/**
 * The trip, in the traveller's own calendar (yuvoy-app#38 item 5).
 *
 * ## The duration is fetched on the TAP, not on mount
 *
 * Everything the file needs comes off the booking except one field.
 * `durationMinutes` lives on the listing, so `DTEND` needs
 * `GET /experiences/{slug}`.
 *
 * Fetching that when the screen mounts would put a second request on the page
 * a traveller opens on the morning of a trip, on island signal, for a button
 * most of them will not press. It is also why this is not a `useQuery`: a
 * query on mount owes the reader a loading state and an error state, and
 * `pnpm qa` is right to insist on both. The honest answer was not to weaken
 * that rule but to stop querying on mount.
 *
 * ## The fetch is allowed to fail, and allowed to be slow
 *
 * The issue is explicit that the duration is "left out if that call fails", so
 * a failure is silent. A 1.5 second budget makes SLOW the same as failed: a
 * traveller who taps a button and gets nothing for eight seconds assumes it is
 * broken and taps again, and an event with no end is a short block in the
 * calendar, which is honest about not knowing rather than wrong.
 *
 * `Promise.race` rather than an `AbortController` because the outcome here is
 * the same either way and the request is harmless if it lands late. Nothing is
 * waiting on it by then.
 *
 * ## Hidden where there is nothing to add
 *
 * Cancelled, declined, expired, released. A calendar entry for a trip that is
 * not happening is worse than none: it survives in the traveller's phone long
 * after this page is closed, and nothing here will ever remove it.
 */
const NOT_HAPPENING = ["cancelled", "declined", "expired", "released"];

export function AddToCalendar({ status }: { status: BookingStatus }) {
  const [working, setWorking] = useState(false);

  if (NOT_HAPPENING.includes(status.state)) return null;
  if (!status.slot?.startsAt || !status.experience?.title) return null;

  const title = status.experience.title;
  const slug = status.experience.slug;

  /*
    The meeting point, with its landmark when there is one. Joined with a
    comma, which `buildIcs` escapes: a comma separates values in this format,
    so an unescaped one would truncate the location at the landmark.
  */
  const place = [status.meetingPoint?.text, status.meetingPoint?.landmark]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(", ");

  async function durationMinutes(): Promise<number | null> {
    if (!slug) return null;
    try {
      const ask = (async () => {
        const client = createApiClient();
        const { data } = await client.GET("/experiences/{slug}", {
          params: { path: { slug } },
        });
        return data?.durationMinutes ?? null;
      })();
      const budget = new Promise<null>((resolve) =>
        setTimeout(() => resolve(null), DURATION_BUDGET_MS),
      );
      return await Promise.race([ask, budget]);
    } catch {
      return null;
    }
  }

  const download = async () => {
    if (working) return;
    setWorking(true);
    try {
      const ics = buildIcs({
        /*
          Stable per booking, so a traveller who taps twice updates the entry
          they already have rather than getting a second one. The reference
          where there is one, since that is what survives; the reservation id
          for a request the operator has not answered, which has none yet.
        */
        uid: `${status.bookingReference ?? status.reservationId}@yuvoy.in`,
        title,
        startsAt: status.slot.startsAt,
        durationMinutes: await durationMinutes(),
        location: place || null,
        description: status.bookingReference
          ? `Booking ${status.bookingReference}`
          : null,
      });

      /*
        A Blob and a synthetic click, which is how a browser is handed a file
        it did not fetch. `text/calendar` is what makes iOS and Android offer
        the calendar app rather than a text viewer.

        A programmatic download after an `await` is permitted, unlike a
        programmatic `window.open`, which is why the budget above can be
        awaited at all.

        The object URL is revoked on the next tick rather than in the same
        frame: revoking immediately races the download in WebKit, and the cost
        of waiting is one object for one frame.
      */
      const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
      const href = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = href;
      link.download = icsFilename(title);
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(href), 0);
    } catch {
      /*
        `buildIcs` throws only on an instant it cannot read, which means the
        server sent something this screen has already rendered a date from. It
        is caught so a malformed field cannot take the booking page to an error
        boundary over a convenience button.
      */
    } finally {
      setWorking(false);
    }
  };

  return (
    <Button
      variant="outline"
      block
      disabled={working}
      onClick={() => void download()}
      className="mt-3"
    >
      <CalendarIcon className="size-4" />
      Add to calendar
    </Button>
  );
}
