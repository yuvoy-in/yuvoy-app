"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { YuvoyError } from "@/lib/api/errors";
import { useTravellerSession } from "@/lib/auth/use-traveller";
import {
  useInvitedTrip,
  useAnswerInvitedTrip,
  GUEST_TRIP_STATUS,
} from "@/lib/trips/use-invites";
import { civilFromDate, weekdayDayMonth } from "@/lib/format/date";
import { formatDuration } from "@/lib/format/time";
import { Screen } from "@/components/chrome/screen";
import { Button, ButtonLink } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { Panel } from "@/components/ui/panel";
import { Sheet } from "@/components/ui/sheet";
import { ErrorState, LoadingState, Skeleton } from "@/components/states";
import { CalendarIcon, MapPinIcon, ClockIcon } from "@/components/ui/icons";

const BACK = { href: "/trips", label: "your trips" };

/**
 * A trip somebody else booked (yuvoy-app#38 item 7).
 *
 * ## What is absent, and it is the design rather than an omission
 *
 * "Deliberately absent: the booking reference, any booking link, the price,
 * the payment, the refund position, and anything about the person who paid. A
 * guest cannot cancel or change the booking."
 *
 * None of it is on the response, so none of it can leak by accident. The
 * issue repeats the rule under "Do not build": no "Invited by", no price, no
 * payment on any invited trip.
 *
 * ## Join and Decline are offered only while there is something to answer
 *
 * `guestState` is `invited` or `joined`. Somebody who has already joined sees
 * the trip and who else is coming, and nothing to press: the contract has no
 * "leave", and a Decline that silently removed them would be a destructive
 * action dressed as a toggle.
 */
export function InvitedTripScreen({ id }: { id: string }) {
  const router = useRouter();
  const { signedIn } = useTravellerSession();
  const trip = useInvitedTrip(id, signedIn === true);
  const { accept, decline } = useAnswerInvitedTrip(id);
  const [confirming, setConfirming] = useState(false);

  /*
    Order matters here, and getting it wrong made the signed-out branch
    unreachable.

    `useInvitedTrip` is `enabled: signedIn === true`, and a DISABLED React
    Query reports `isPending`. So a combined `signedIn === undefined ||
    trip.isPending` guard rendered the skeleton forever for anybody signed
    out, which is exactly the visitor this screen has a sign-in prompt for.
    The session is settled first, then the query.
  */
  if (signedIn === undefined) {
    return (
      <Screen back={BACK}>
        <LoadingState label="Loading this trip">
          <Skeleton className="h-10 w-2/3" />
          <Skeleton className="mt-4 h-32 w-full" />
        </LoadingState>
      </Screen>
    );
  }

  if (!signedIn) {
    /*
      A guest's trip is keyed by their own number, so there is nothing to show
      a signed-out visitor and nothing useful to say beyond how to get in.
    */
    return (
      <Screen back={BACK}>
        <h1 className="font-display tracking-display text-3xl leading-tight">
          Sign in to see this trip
        </h1>
        <p className="text-forest/70 mt-3 text-sm">
          It is on the number that was invited. Sign in with that number and it
          is here.
        </p>
        <ButtonLink
          href={`/account?next=/trips/invited/${id}`}
          size="lg"
          className="mt-6"
        >
          Sign in
        </ButtonLink>
      </Screen>
    );
  }

  if (trip.isPending) {
    return (
      <Screen back={BACK}>
        <LoadingState label="Loading this trip">
          <Skeleton className="h-10 w-2/3" />
          <Skeleton className="mt-4 h-32 w-full" />
        </LoadingState>
      </Screen>
    );
  }

  if (trip.isError) {
    return (
      <Screen back={BACK}>
        <ErrorState error={trip.error} onRetry={() => void trip.refetch()} />
      </Screen>
    );
  }

  const data = trip.data;
  if (!data) return null;

  const day = civilFromDate(data.localDate);
  const when = day
    ? `${weekdayDayMonth(day)}${data.localTime ? ` · ${data.localTime.slice(0, 5)}` : ""}`
    : null;

  const answerable = data.guestState === "invited";
  const conflict =
    accept.error instanceof YuvoyError && accept.error.status === 409;

  return (
    <Screen back={BACK} stageLabel="A trip you were invited to">
      <div className="flex items-start justify-between gap-3">
        <h1 className="font-display tracking-display text-3xl leading-tight">
          <Link href={`/e/${data.experienceSlug}`} className="underline">
            {data.experience}
          </Link>
        </h1>
        <Chip
          size="sm"
          tone={data.status === "confirmed" ? "accent" : undefined}
        >
          {GUEST_TRIP_STATUS[data.status] ?? data.status}
        </Chip>
      </div>

      <p className="text-forest/80 mt-2 text-sm">{data.operator}</p>

      <Panel className="mt-6">
        {when ? (
          <p className="flex items-center gap-2 text-sm">
            <CalendarIcon className="text-forest/70 size-4 shrink-0" />
            {when}
          </p>
        ) : null}

        {data.meetingPoint ? (
          <p className="mt-3 flex items-start gap-2 text-sm">
            <MapPinIcon className="text-forest/70 mt-0.5 size-4 shrink-0" />
            <span>
              {data.meetingPoint}
              {data.landmark ? (
                <span className="text-forest/70 block">{data.landmark}</span>
              ) : null}
            </span>
          </p>
        ) : null}

        {formatDuration(data.durationMinutes) ? (
          <p className="mt-3 flex items-center gap-2 text-sm">
            <ClockIcon className="text-forest/70 size-4 shrink-0" />
            {formatDuration(data.durationMinutes)}
          </p>
        ) : null}

        {/*
          "No listing field carries this yet, so it is absent for now." Hidden
          rather than rendered as an empty heading, which is what an absent
          array would otherwise look like.
        */}
        {data.bring && data.bring.length > 0 ? (
          <div className="mt-4">
            <p className="label text-forest/75">What to bring</p>
            <ul className="mt-2 list-inside list-disc text-sm">
              {data.bring.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        ) : null}
      </Panel>

      {/*
        Who else is coming. "The booker is not listed; `partySize` counts them",
        so this is never presented as the whole party: it is the guests who
        have said yes, and "You" where one of them is the reader.
      */}
      {data.going.length > 0 ? (
        <div className="mt-6">
          <p className="label text-forest/75">Going</p>
          <ul className="mt-2 flex flex-wrap gap-2">
            {data.going.map((person, i) => (
              <li key={`${person.name}-${i}`}>
                <Chip size="sm" tone={person.you ? "accent" : undefined}>
                  {person.you ? "You" : person.name}
                </Chip>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {answerable ? (
        <div className="mt-8">
          <Button
            block
            size="lg"
            disabled={accept.isPending || decline.isPending}
            onClick={() => accept.mutate()}
          >
            {accept.isPending ? "Joining…" : "Join this trip"}
          </Button>

          <Button
            variant="ghost"
            block
            disabled={accept.isPending || decline.isPending}
            onClick={() => setConfirming(true)}
            className="mt-3"
          >
            Decline
          </Button>

          {accept.error ? (
            <p role="alert" className="text-terra-deep mt-3 text-sm">
              {conflict
                ? "This trip was cancelled, or it is your own booking."
                : accept.error instanceof YuvoyError
                  ? accept.error.message
                  : "That did not work. Try again."}
            </p>
          ) : null}
        </div>
      ) : null}

      {confirming ? (
        <Sheet
          open
          onClose={() => setConfirming(false)}
          title="Decline this trip?"
          footer={
            <div className="flex gap-3">
              <Button
                variant="outline"
                block
                onClick={() => setConfirming(false)}
              >
                Keep it
              </Button>
              <Button
                block
                disabled={decline.isPending}
                onClick={() =>
                  decline.mutate(undefined, {
                    onSuccess: () => router.push("/trips"),
                  })
                }
              >
                {decline.isPending ? "Declining…" : "Decline"}
              </Button>
            </div>
          }
        >
          {/*
            Confirmed because it is not undoable from here: the contract has no
            way back, and the place returns to the booker to offer again.
          */}
          <p className="text-sm">
            Your place goes back to whoever booked the trip. If you change your
            mind, ask them to invite you again.
          </p>
          {decline.error ? (
            <p role="alert" className="text-terra-deep mt-3 text-sm">
              That did not work. Try again.
            </p>
          ) : null}
        </Sheet>
      ) : null}
    </Screen>
  );
}
