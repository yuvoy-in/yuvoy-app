"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Screen } from "@/components/chrome/screen";
import { Skeleton } from "@/components/states";
import { Button, ButtonLink } from "@/components/ui/button";
import Link from "@/components/ui/link";
import { Panel } from "@/components/ui/panel";
import {
  eventStartLabel,
  eventStateLine,
  organiserActions,
  organiserStateLine,
} from "@/lib/organisers/organisers";
import { organiserRefusal } from "@/lib/organisers/refusal";
import type { Organiser, OrganiserEvent } from "@/lib/organisers/types";
import {
  useOrganiser,
  useOrganiserEvents,
} from "@/lib/organisers/use-organisers";
import { ORGANISER_WORDS as W } from "@/lib/organisers/words";
import { DoorLink } from "./door-screen-parts";
import { clearLinked, linkedLine } from "./organiser-form-parts";
import { OrganiserRefusalBlock } from "./organiser-gate";
import {
  BACK_TO_HUB,
  OrganiserHeading,
  OrganiserLoading,
  ROW_CLASS,
  RefetchNotice,
  refusedAgain,
} from "./organiser-parts";

/**
 * `/organiser/{id}` (yuvoy-app#224, the phone's `organiser-screen.tsx`): one
 * organiser for a member of it. The thanks line after setting up (`?made=1`;
 * `?made=club` for a group's page, checked already, yuvoy-app#225),
 * the state card (its sentence, and the code large with "Copy code" while it
 * waits for a check), "Post an event" while the state allows it, "Edit page"
 * and "Helpers" for an owner, and the events in the API's order, each opening
 * its own screen. "Check people in" (the door, yuvoy-app#226) while the
 * organiser is verified, for its owner and its helpers alike. A group's form
 * that met `409 club_already_linked` opens the group's organiser here with
 * the API's sentence, once, and the sentence shows even when the organiser
 * cannot be read. Left out from the phone: the group line.
 */
export function OrganiserScreen({ id }: { id: string }) {
  const organiser = useOrganiser(id, true);
  const made = useSearchParams().get("made");
  // The sentence a group's form handed over on its 409, shown once.
  const [linked] = useState(() => linkedLine(id));
  useEffect(() => clearLinked(id), [id]);

  if (organiser.isPending) {
    return <OrganiserLoading label={W.loadingOrganiser} back={BACK_TO_HUB} />;
  }

  if (organiser.data === undefined || refusedAgain(organiser)) {
    return (
      <Screen back={BACK_TO_HUB}>
        <OrganiserHeading>{W.title}</OrganiserHeading>
        <LinkedLine text={linked} />
        <OrganiserRefusalBlock
          refusal={organiserRefusal(organiser.error)}
          onRetry={() => void organiser.refetch()}
        />
      </Screen>
    );
  }

  const page = organiser.data;
  const actions = organiserActions(page);
  const base = `/organiser/${encodeURIComponent(page.id)}`;
  // Every reader of this page is a member (owner or helper): anyone else gets a 404.
  const door = page.state === "verified";
  const madeLine =
    made === "club" || (made === "1" && page.clubId)
      ? W.clubMade(page.name)
      : made === "1"
        ? W.made
        : null;

  return (
    <Screen back={BACK_TO_HUB}>
      <OrganiserHeading>{page.name}</OrganiserHeading>
      {madeLine ? (
        <Panel
          tone="raised"
          role="status"
          className="mt-4 px-4 py-4"
          data-testid="organiser-made"
        >
          <p className="text-pretty">{madeLine}</p>
        </Panel>
      ) : null}
      <LinkedLine text={linked} />
      <RefetchNotice query={organiser} />

      <StateCard organiser={page} showsCode={actions.copyCode} />

      {actions.post || door || actions.editPage || actions.helpers ? (
        <div className="mt-6 space-y-3">
          {actions.post ? (
            <ButtonLink href={`${base}/events/new`} block>
              {W.postEvent}
            </ButtonLink>
          ) : null}
          {door ? <DoorLink variant="outline" /> : null}
          {actions.editPage ? (
            <ButtonLink href={`${base}/edit`} variant="outline" block>
              {W.editPage}
            </ButtonLink>
          ) : null}
          {actions.helpers ? (
            <ButtonLink href={`${base}/helpers`} variant="outline" block>
              {W.helpers}
            </ButtonLink>
          ) : null}
        </div>
      ) : null}

      <OrganiserEvents id={page.id} base={base} />
    </Screen>
  );
}

/** The sentence a group's form handed over, or nothing. */
function LinkedLine({ text }: { text: string | null }) {
  if (!text) return null;
  return (
    <Panel
      tone="outline"
      role="status"
      className="mt-4 px-4 py-4"
      data-testid="organiser-linked"
    >
      <p className="text-pretty">{text}</p>
    </Panel>
  );
}

function StateCard({
  organiser,
  showsCode,
}: {
  organiser: Organiser;
  showsCode: boolean;
}) {
  return (
    <Panel
      tone="outline"
      className="mt-6 px-4 py-4"
      data-testid="organiser-state-card"
    >
      <p className="label text-forest/75">{W.stateLabel(organiser.state)}</p>
      <p className="mt-2 text-pretty break-words">
        {organiserStateLine(organiser)}
      </p>
      {showsCode && organiser.verificationCode ? (
        <CodeToCopy code={organiser.verificationCode} />
      ) : null}
    </Panel>
  );
}

type Copy = "idle" | "copied" | "failed";

function CodeToCopy({ code }: { code: string }) {
  const [copy, setCopy] = useState<Copy>("idle");

  const onCopy = async () => {
    try {
      // No clipboard here throws too, and says the same.
      await navigator.clipboard.writeText(code);
      setCopy("copied");
    } catch {
      setCopy("failed");
    }
  };

  return (
    <div className="mt-4">
      <p
        className="tracking-ref text-3xl font-bold break-all slashed-zero tabular-nums select-all"
        data-testid="organiser-code"
      >
        {code}
      </p>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="mt-3"
        onClick={() => void onCopy()}
      >
        {W.copyCode}
      </Button>
      <p
        role="status"
        className="text-forest/75 mt-2 min-h-5 text-sm"
        data-testid="organiser-code-status"
      >
        {copy === "copied" ? W.copied : copy === "failed" ? W.copyFailed : ""}
      </p>
    </div>
  );
}

/** The events in the API's order, each opening its own screen. */
function OrganiserEvents({ id, base }: { id: string; base: string }) {
  const events = useOrganiserEvents(id, true);

  return (
    <section className="mt-8" aria-labelledby="organiser-events-heading">
      <h2
        id="organiser-events-heading"
        className="font-display tracking-display leading-display text-xl text-balance"
      >
        {W.events}
      </h2>
      {events.isPending ? (
        <div className="mt-3 space-y-3" aria-hidden="true">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      ) : events.data === undefined || refusedAgain(events) ? (
        <OrganiserRefusalBlock
          refusal={organiserRefusal(events.error)}
          onRetry={() => void events.refetch()}
        />
      ) : (
        <>
          <RefetchNotice query={events} />
          {events.data.length === 0 ? (
            <p className="text-forest/75 mt-3 text-pretty">{W.noEvents}</p>
          ) : (
            <ul className="mt-3 space-y-3" data-testid="organiser-events">
              {events.data.map((event) => (
                <li key={event.id}>
                  <EventRow event={event} base={base} />
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}

function EventRow({ event, base }: { event: OrganiserEvent; base: string }) {
  const when = eventStartLabel(event);
  return (
    <Link
      href={`${base}/events/${encodeURIComponent(event.id)}`}
      className={ROW_CLASS}
    >
      <span className="block font-bold break-words">{event.title}</span>
      {when ? (
        <span className="text-forest/75 mt-0.5 block text-sm">{when}</span>
      ) : null}
      <span className="text-forest/75 mt-0.5 block text-sm break-words">
        {eventStateLine(event)}
      </span>
    </Link>
  );
}
