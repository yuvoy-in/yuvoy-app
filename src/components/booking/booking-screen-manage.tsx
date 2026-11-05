"use client";

import { Button } from "@/components/ui/button";
import type { components } from "@/lib/api/schema.gen";
import { ShareButton } from "./share-button";
import { InviteGuests } from "./invite-guests";
import { AddToCalendar } from "./add-to-calendar";
import { KeepBooking } from "./keep-booking";

type BookingStatus = components["schemas"]["BookingStatus"];

/**
 * The "Manage this trip" region of the booking page (share, invite,
 * calendar, keep a copy and cancel), lifted word for word out of StatusBody
 * (booking-screen-body.tsx).
 */
export function ManageTrip({
  status,
  token,
  upcoming,
  hasTripActions,
  cancelling,
  setCancelling,
}: {
  status: BookingStatus;
  token?: string | null;
  upcoming: boolean;
  hasTripActions: boolean;
  cancelling: boolean;
  setCancelling: React.Dispatch<React.SetStateAction<boolean>>;
}) {
  return (
    <>
      {/*
        MANAGE THIS TRIP: one region, not five stacked panels.

        Share, invite, calendar, keep a copy and cancel were five siblings in a
        vertical stack of about twenty-two surfaces, each with its own heading
        and its own weight, none of them more important than the meeting point
        above them. Everything was level one, which is the information
        architecture problem the revamp brief describes: hierarchy, not more
        text.

        They are one labelled region now. Each control keeps its own gate
        EXACTLY as it was, because every one of those conditions encodes a
        contract rule and several were bugs once: `upcoming` reads the server's
        clock, invitations follow the 409 the API would return anyway, and the
        calendar component owns its own exclusions because it is the one that
        knows what it would write.

        On an offline snapshot the token-gated controls are absent, exactly as
        before, and the calendar stays because it never needed the network.
        The region itself is gated on `hasTripActions`, so a trip with nothing
        left to manage draws no heading at all.
      */}
      {hasTripActions ? (
        <section aria-labelledby="manage-trip" className="mt-10">
          <h2 id="manage-trip" className="label text-forest/75">
            Manage this trip
          </h2>

          {token && upcoming ? <ShareButton token={token} /> : null}

          {/*
        Offering a PLACE, which is a different thing from sharing a link
        (#38 items 6 and 12). Share reveals the meeting point to anybody it is
        pasted to; this gives somebody their own seat in the party.

        "Invitations are taken for a trip that is confirmed, or a request still
        waiting on the operator, and that has not ended." `upcoming` covers the
        confirmed half and `awaiting_operator` the other, and the server
        refuses anything else with a 409 regardless.
      */}
          {token && (upcoming || status.state === "awaiting_operator") ? (
            <InviteGuests token={token} />
          ) : null}

          {/*
        The trip in the traveller's own calendar (#38 item 5).

        Not gated on `upcoming` like Share is. Share mints a link for people
        coming along, which is meaningless once a trip has left; adding a past
        trip to a calendar is merely pointless rather than wrong, and the real
        exclusions are the states where an entry would be a lie. The component
        owns that list, since it is the one that knows what it would write.
      */}
          <AddToCalendar status={status} />

          {/*
            Its own Share only where the one above is not drawn: both mint the
            same read-only `/trip/` link, and two Share buttons on one page
            read as two different things (cited 3 Oct 2026).
          */}
          {token ? (
            <KeepBooking
              status={status}
              token={token}
              offerShare={!(token && upcoming)}
            />
          ) : null}

          {token && upcoming && !cancelling ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCancelling(true)}
              className="mt-4"
            >
              I need to cancel
            </Button>
          ) : null}
        </section>
      ) : null}
    </>
  );
}
