"use client";

import { useState } from "react";
import { YuvoyError } from "@/lib/api/errors";
import {
  useTripGuests,
  useInviteGuest,
  useRemoveGuest,
  GUEST_STATE_LABEL,
  type CreatedTripInvite,
} from "@/lib/trips/use-invites";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { Panel } from "@/components/ui/panel";
import { PhoneField, DEFAULT_DIAL_CODE } from "@/components/ui/phone-field";
import { LinkActions } from "@/components/ui/link-actions";
import { Skeleton } from "@/components/states";

/**
 * Inviting the people coming with you (yuvoy-app#38 items 6 and 12).
 *
 * ## Different from "Share with the people coming", on purpose
 *
 * Share mints a read-only link that reveals the meeting point and the time to
 * anybody it is pasted to. This offers a PLACE in the party: the person who
 * accepts signs in with their own number, appears in the guest list, and gets
 * their own view of the trip.
 *
 * ## The count rule is the server's, and it is read rather than derived
 *
 * "Live invitations (invited or joined) may not exceed the party size less the
 * booker." `maxGuests` is that number, sent with the list. Counting places
 * here from `guests` would be a second copy of a rule the API owns, and a
 * declined invitation does not use a place, which is exactly the kind of
 * detail a client-side count gets wrong.
 *
 * ## The link is returned ONCE
 *
 * "Returned once. Offer Copy and Share; do not print it." So the answer is
 * held in state rather than re-read: refetching the guest list does not bring
 * `inviteUrl` back, and a component that dropped it would leave the booker
 * with an invitation they have no way to deliver.
 */
export function InviteGuests({ token }: { token: string }) {
  const [phone, setPhone] = useState(DEFAULT_DIAL_CODE);
  const [invited, setInvited] = useState<CreatedTripInvite | null>(null);

  const list = useTripGuests(token);
  const invite = useInviteGuest(token);
  const remove = useRemoveGuest(token);

  const guests = list.data?.guests ?? [];
  const maxGuests = list.data?.maxGuests ?? 0;
  const live = guests.filter((g) => g.state !== "declined").length;
  const full = live >= maxGuests;

  const phoneGiven = phone.replace(/\D/g, "").length > 4;

  /*
    A party of one can invite nobody: `maxGuests` is the party size less the
    booker. Rendering an empty panel with a disabled field would be a control
    that can never be used, so the whole section stays off.
  */
  if (list.isSuccess && maxGuests === 0) return null;

  return (
    <section className="mt-8" aria-labelledby="invite-heading">
      <h2 id="invite-heading" className="label text-forest/75">
        The people coming with you
      </h2>

      <Panel className="mt-3">
        {list.isPending ? (
          <div className="space-y-2">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-2/3" />
          </div>
        ) : list.isError ? (
          /*
            Token-bearing, so a 401 here is the booking link dying rather than
            an invite problem. It is stated and nothing else on the page is
            blocked by it.
          */
          <p role="alert" className="text-forest/70 text-sm">
            We could not load who is coming. The rest of your booking is
            unaffected.
          </p>
        ) : (
          <>
            {guests.length > 0 ? (
              <ul className="mb-4 space-y-2">
                {guests.map((guest) => (
                  <li
                    key={guest.id}
                    className="flex items-center justify-between gap-3"
                  >
                    <span className="min-w-0 truncate text-sm">
                      {/*
                        "At most one of `name` and `phoneMasked`; a link nobody
                        accepted has neither." So a link waiting to be opened
                        says what it is rather than rendering an empty row.
                      */}
                      {guest.name ?? guest.phoneMasked ?? "A link you shared"}
                    </span>
                    <span className="flex shrink-0 items-center gap-2">
                      <Chip
                        size="sm"
                        tone={guest.state === "joined" ? "accent" : "neutral"}
                      >
                        {GUEST_STATE_LABEL[guest.state] ?? guest.state}
                      </Chip>
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={remove.isPending}
                        onClick={() => remove.mutate(guest.id)}
                      >
                        Remove
                      </Button>
                    </span>
                  </li>
                ))}
              </ul>
            ) : null}

            {full ? (
              <p className="text-forest/70 text-sm">
                Everyone in your party has a place.
              </p>
            ) : (
              <>
                <PhoneField
                  label="Invite by number"
                  value={phone}
                  onChange={setPhone}
                  hint="They sign in with this number to join."
                />
                <Button
                  variant="outline"
                  block
                  disabled={!phoneGiven || invite.isPending}
                  onClick={() =>
                    invite.mutate(phone, { onSuccess: setInvited })
                  }
                  className="mt-3"
                >
                  {invite.isPending ? "Inviting…" : "Invite"}
                </Button>
              </>
            )}

            {invited ? (
              <div className="border-paper-line mt-4 border-t pt-4">
                <p className="text-sm" role="status">
                  {/*
                    The contract's own three deliveries. `not_sent_no_channel`
                    is the one that is live today, because there is no WhatsApp
                    sender yet, and it is the one where the booker has to do
                    the delivering. Saying "Saved." and nothing else would leave
                    them assuming we had messaged somebody.
                  */}
                  {invited.delivery === "queued"
                    ? "Invited. We are messaging them on WhatsApp."
                    : "Saved. Send them this link, or ask them to sign in on app.yuvoy.in with that number to join."}
                </p>
                {/*
                  Never printed (item 8). The link is a credential: whoever
                  opens it takes the place.
                */}
                <LinkActions
                  url={invited.inviteUrl}
                  title="Come on this trip"
                  className="mt-3"
                />
              </div>
            ) : null}

            {invite.error ? (
              <p role="alert" className="text-terra-deep mt-3 text-sm">
                {invite.error instanceof YuvoyError
                  ? invite.error.message
                  : "That invitation did not send. Try again."}
              </p>
            ) : null}

            {remove.error ? (
              <p role="alert" className="text-terra-deep mt-3 text-sm">
                {remove.error instanceof YuvoyError
                  ? remove.error.message
                  : "We could not remove them. Try again."}
              </p>
            ) : null}
          </>
        )}
      </Panel>
    </section>
  );
}
