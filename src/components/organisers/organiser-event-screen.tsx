"use client";

import { useState } from "react";
import { Screen } from "@/components/chrome/screen";
import { LoadingState, Skeleton } from "@/components/states";
import { Button, ButtonLink } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";
import { Sheet, SheetPresence } from "@/components/ui/sheet";
import { departmentName } from "@/lib/found/found-words";
import {
  canCancelEvent,
  canChangeEvent,
  canPost,
  eventChangeRefusal,
  eventDayLabel,
  eventPriceLine,
  eventStartLabel,
  eventStateLine,
  eventTimeLabel,
  lastWeekOn,
  writtenInIndia,
} from "@/lib/organisers/organisers";
import {
  organiserRefusal,
  type OrganiserRefusal,
} from "@/lib/organisers/refusal";
import type {
  Organiser,
  OrganiserEvent,
  OrganiserEventNumbers,
  OrganiserEventState,
} from "@/lib/organisers/types";
import {
  useCancelOrganiserEvent,
  useOrganiser,
  useOrganiserEventNumbers,
  useOrganiserEvents,
} from "@/lib/organisers/use-organisers";
import { ORGANISER_WORDS as W } from "@/lib/organisers/words";
import { useVocabulary } from "@/lib/search/use-search-reels";
import { usePlaceList } from "@/lib/site/use-place";
import { OrganiserRefusalBlock, OrganiserWriteError } from "./organiser-gate";
import {
  OrganiserHeading,
  OrganiserLoading,
  RefetchNotice,
  backToOrganiser,
} from "./organiser-parts";

/**
 * `/organiser/{id}/events/{postId}` (yuvoy-app#224, the phone's
 * `organiser-event-screen.tsx` on yuvoy-mobile dev): one event, for a member
 * of its organiser. Its state (Not accepted with the desk's reason), what was
 * posted, its numbers (counts only, never a name), "Change" while it can be
 * changed, "Cancel this event" with a confirm (in every organiser state, and
 * while paused), and "Open the card" once it has one.
 *
 * There is no read of one event, so it comes from the organiser's list.
 * `sent` is the form's hand-over after a post, for its thanks line; `saved`
 * after a change. Under `OrganiserGate`, so every read here is enabled.
 *
 * Left out from the phone: the door ("Check people in") and the event's
 * picture, which the web does not build.
 */

/** An event in a list by its post id, however the link spelled it. */
export function eventIn(
  list: readonly OrganiserEvent[] | undefined,
  postId: string,
): OrganiserEvent | undefined {
  const wanted = postId.toLowerCase();
  return list?.find((event) => event.id.toLowerCase() === wanted);
}

export function OrganiserEventScreen({
  id,
  postId,
  sent = null,
  saved = false,
}: {
  id: string;
  postId: string;
  sent?: OrganiserEventState | null;
  saved?: boolean;
}) {
  const back = backToOrganiser(id);
  const organiser = useOrganiser(id, true);
  const events = useOrganiserEvents(id, true);

  if (organiser.isPending || events.isPending) {
    return <OrganiserLoading label={W.loadingEvent} back={back} />;
  }
  for (const read of [organiser, events]) {
    if (read.data === undefined) {
      return (
        <Screen back={back}>
          <OrganiserRefusalBlock
            refusal={organiserRefusal(read.error)}
            onRetry={() => void read.refetch()}
          />
        </Screen>
      );
    }
  }
  const page = organiser.data;
  const event = eventIn(events.data, postId);
  if (!page) return null;
  if (!event) {
    // Just posted, and the list is still being read again: wait for it.
    if (events.isFetching) {
      return <OrganiserLoading label={W.loadingEvent} back={back} />;
    }
    return (
      <Screen back={back}>
        <Panel
          tone="outline"
          role="alert"
          className="mt-6 px-4 py-3"
          data-testid="organiser-event-missing"
        >
          <p className="text-forest/80 text-pretty">{W.eventNotFound}</p>
        </Panel>
      </Screen>
    );
  }

  return (
    <Screen back={back}>
      <OrganiserHeading>{event.title}</OrganiserHeading>
      <p
        className="label text-forest/75 mt-2 break-words"
        data-testid="organiser-event-state"
      >
        {eventStateLine(event)}
      </p>
      <RefetchNotice query={events} />
      {sent || saved ? (
        <Panel
          tone="outline"
          role="status"
          className="mt-4 px-4 py-3"
          data-testid="organiser-event-done"
        >
          <p className="text-pretty">{sent ? W.eventSent(sent) : W.saved}</p>
        </Panel>
      ) : null}
      <Posted event={event} />
      <Actions organiser={page} event={event} />
      <Numbers organiserId={id} event={event} />
    </Screen>
  );
}

/** What was posted, as last changed. An absent field shows nothing at all. */
function Posted({ event }: { event: OrganiserEvent }) {
  const places = usePlaceList({ initial: null, signedIn: true, enabled: true });
  const vocabulary = useVocabulary();
  const place = places.data?.markets
    .flatMap((market) => market.destinations)
    .find((destination) => destination.key === event.destinationKey)?.name;
  const rows: [string, string | null | undefined][] = [
    [
      "repeat",
      event.repeatsWeeklyUntil
        ? W.repeatsUntil(
            eventDayLabel(event.repeatsWeeklyUntil) || event.repeatsWeeklyUntil,
          )
        : null,
    ],
    [
      "department",
      departmentName(event.department, vocabulary.data?.categories),
    ],
    ["venue", event.venueName],
    ["place", place],
    ["address", event.address],
    ["price", eventPriceLine(event)],
    ["price-note", event.priceNote],
  ];
  const when = eventTimeLabel(event);
  const link = event.link.trim();

  return (
    <Panel
      tone="outline"
      className="mt-6 flex flex-col gap-2 px-4 py-4"
      data-testid="organiser-event-posted"
    >
      {when ? <p className="font-bold text-pretty">{when}</p> : null}
      {rows.map(([key, value]) =>
        value?.trim() ? (
          <p key={key} className="break-words text-pretty">
            {value.trim()}
          </p>
        ) : null,
      )}
      {link.startsWith("https://") ? (
        <a
          href={link}
          target="_blank"
          rel="noopener noreferrer nofollow"
          className="text-forest break-all underline underline-offset-2"
        >
          {link}
        </a>
      ) : link ? (
        <p className="break-all">{link}</p>
      ) : null}
      {event.about?.trim() ? (
        <p className="text-forest/80 break-words whitespace-pre-line text-pretty">
          {event.about.trim()}
        </p>
      ) : null}
    </Panel>
  );
}

function Actions({
  organiser,
  event,
}: {
  organiser: Organiser;
  event: OrganiserEvent;
}) {
  const cancel = useCancelOrganiserEvent(organiser.id);
  const [confirming, setConfirming] = useState(false);
  const [refusal, setRefusal] = useState<OrganiserRefusal | null>(null);

  // A cancel with no answer is never sent again by itself: the hook reads the list again.
  function sendCancel() {
    if (cancel.isPending) return;
    setRefusal(null);
    cancel.mutate(event.id, {
      onSuccess: () => setConfirming(false),
      onError: (error) => {
        setRefusal(organiserRefusal(error));
        setConfirming(false);
      },
    });
  }

  const edit = `/organiser/${encodeURIComponent(organiser.id)}/events/${encodeURIComponent(event.id)}/edit`;
  // Why "Change" is not there: the event's state, or the organiser's (suspended or closed).
  const noChange =
    eventChangeRefusal(event.state) ??
    (canPost(organiser)
      ? null
      : organiser.state === "closed"
        ? W.closed
        : W.suspended);

  return (
    <div className="mt-6 flex flex-col gap-3">
      {event.eventId ? (
        <ButtonLink
          variant="outline"
          block
          href={`/f/${encodeURIComponent(event.eventId)}`}
        >
          {W.openCard}
        </ButtonLink>
      ) : null}
      {canChangeEvent(organiser, event) ? (
        <ButtonLink variant="outline" block href={edit}>
          {W.change}
        </ButtonLink>
      ) : noChange ? (
        <p
          className="text-forest/75 text-sm text-pretty"
          data-testid="organiser-event-no-change"
        >
          {noChange}
        </p>
      ) : null}
      {canCancelEvent(event) ? (
        <Button
          type="button"
          variant="outline"
          block
          disabled={cancel.isPending}
          onClick={() => {
            setRefusal(null);
            setConfirming(true);
          }}
        >
          {W.cancelEvent}
        </Button>
      ) : null}
      <OrganiserWriteError refusal={refusal} onRetry={sendCancel} />

      <SheetPresence open={confirming}>
        <Sheet
          open
          onClose={() => setConfirming(false)}
          title={W.cancelConfirmTitle}
          footer={
            <div className="flex gap-3">
              <Button
                type="button"
                variant="outline"
                block
                onClick={() => setConfirming(false)}
              >
                {W.keepEvent}
              </Button>
              <Button
                type="button"
                block
                pending={cancel.isPending}
                pendingLabel={W.cancelEventYes}
                onClick={sendCancel}
              >
                {W.cancelEventYes}
              </Button>
            </div>
          }
        >
          <p className="text-pretty">{W.cancelConfirmLine}</p>
        </Sheet>
      </SheetPresence>
    </div>
  );
}

function NumbersLoading() {
  return (
    <LoadingState label={W.loadingNumbers}>
      <Skeleton className="h-20 w-full" />
    </LoadingState>
  );
}

/**
 * The numbers, counts only and never a name. One block for the current date;
 * a weekly event that has had a date before it has a second, last week's.
 */
function Numbers({
  organiserId,
  event,
}: {
  organiserId: string;
  event: OrganiserEvent;
}) {
  const current = useOrganiserEventNumbers(organiserId, event.id, null, true);
  const last = current.data ? lastWeekOn(event, current.data.on) : null;

  return (
    <section
      aria-labelledby="organiser-event-numbers"
      className="mt-8 flex flex-col gap-3"
    >
      <h2 id="organiser-event-numbers" className="text-lg font-bold">
        {W.numbersTitle}
      </h2>
      {current.isPending ? (
        <NumbersLoading />
      ) : current.data === undefined ? (
        <OrganiserRefusalBlock
          refusal={organiserRefusal(current.error)}
          onRetry={() => void current.refetch()}
        />
      ) : (
        <>
          <RefetchNotice query={current} />
          <NumbersBlock
            numbers={current.data}
            heading={last ? W.numbersNow(eventDayLabel(current.data.on)) : null}
          />
          {last ? (
            <LastWeek organiserId={organiserId} postId={event.id} on={last} />
          ) : null}
        </>
      )}
    </section>
  );
}

function LastWeek({
  organiserId,
  postId,
  on,
}: {
  organiserId: string;
  postId: string;
  on: string;
}) {
  const numbers = useOrganiserEventNumbers(organiserId, postId, on, true);
  if (numbers.isPending) return <NumbersLoading />;
  if (numbers.data === undefined) {
    const refusal = organiserRefusal(numbers.error);
    // The API says it is not one of the event's dates after all: no last week to show.
    if (refusal.kind === "fields") return null;
    return (
      <OrganiserRefusalBlock
        refusal={refusal}
        onRetry={() => void numbers.refetch()}
      />
    );
  }
  return (
    <NumbersBlock
      numbers={numbers.data}
      heading={W.numbersLastWeek(eventDayLabel(numbers.data.on))}
    />
  );
}

function NumbersBlock({
  numbers,
  heading,
}: {
  numbers: OrganiserEventNumbers;
  heading: string | null;
}) {
  // India's clock: every place an organiser can pick is in India.
  const asOf = eventStartLabel({
    startsAt: writtenInIndia(numbers.asOf) ?? "",
  });
  return (
    <Panel
      tone="outline"
      className="flex flex-col gap-1.5 px-4 py-3"
      data-testid="organiser-event-numbers-block"
    >
      {heading ? <p className="label text-forest/75">{heading}</p> : null}
      <p className="text-pretty">{W.numbers(numbers)}</p>
      {asOf ? (
        <p className="text-forest/70 text-xs">{W.updated(asOf)}</p>
      ) : null}
    </Panel>
  );
}
