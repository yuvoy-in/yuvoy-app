"use client";

import { useId, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { Screen, type BackTarget } from "@/components/chrome/screen";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Panel } from "@/components/ui/panel";
import { clockOffsetMs } from "@/lib/booking/clock";
import {
  checkEventForm,
  eventBoxValue,
  indiaClock,
  repeatBounds,
  type EventKept,
} from "@/lib/organisers/event-form";
import {
  canChangeEvent,
  canPost,
  emptyEventForm,
  eventChangeRefusal,
  eventForm,
  eventInput,
  type OrganiserEventForm,
} from "@/lib/organisers/organisers";
import {
  organiserRefusal,
  type OrganiserRefusal,
} from "@/lib/organisers/refusal";
import type { Organiser, OrganiserEvent } from "@/lib/organisers/types";
import {
  useEditOrganiserEvent,
  useOrganiser,
  useOrganiserEvents,
  usePostOrganiserEvent,
} from "@/lib/organisers/use-organisers";
import { ORGANISER_WORDS as W } from "@/lib/organisers/words";
import { qk } from "@/lib/query/policy";
import { useVocabulary } from "@/lib/search/use-search-reels";
import { usePlaceList } from "@/lib/site/use-place";
import {
  Chip,
  Choice,
  EVENT_FIELD_KEYS,
  EventAbout,
  EventPlacePicker,
  EventPrice,
  withoutKeys,
} from "./organiser-event-form-parts";
import { eventIn } from "./organiser-event-screen";
import { OrganiserRefusalBlock, OrganiserWriteError } from "./organiser-gate";
import {
  OrganiserHeading,
  OrganiserLoading,
  backToOrganiser,
} from "./organiser-parts";

/**
 * The event form (yuvoy-app#224, the phone's `organiser-event-form.tsx` on
 * yuvoy-mobile dev), in its two uses:
 *
 * - `NewOrganiserEvent`, `/organiser/{id}/events/new`: "Send for checking"
 *   (or "Post" with self-publish), then the event's screen with `?sent=`.
 * - `EditOrganiserEvent`, `/organiser/{id}/events/{postId}/edit`: the whole
 *   event sent again, then the event's screen with `?saved=1`.
 *
 * Every sentence sits under its field, everything typed is kept on a refusal,
 * and the button is off while a write is out. A write with no answer is never
 * sent again by itself: the list is read again in case it went through.
 *
 * Left out from the phone: the event's picture, its toast after a change (the
 * event's screen says Saved), and its "still waiting" line with an email
 * button. Kinds of things come only from the API's vocabulary: the phone's
 * kept list has no copy here.
 */

function eventHref(id: string, postId: string): string {
  return `/organiser/${encodeURIComponent(id)}/events/${encodeURIComponent(postId)}`;
}

/** A screen that cannot show the form, with one line saying why. */
function NoForm({
  back,
  title,
  children,
}: {
  back: BackTarget;
  title: string;
  children: ReactNode;
}) {
  return (
    <Screen back={back}>
      <OrganiserHeading>{title}</OrganiserHeading>
      {children}
    </Screen>
  );
}

function Refused({ line }: { line: string }) {
  return (
    <Panel
      tone="outline"
      role="alert"
      className="mt-6 px-4 py-3"
      data-testid="organiser-event-form-refused"
    >
      <p className="text-forest/80 text-pretty">{line}</p>
    </Panel>
  );
}

/** Suspended or closed: no event can be posted or changed. */
function shutLine(organiser: Organiser): string | null {
  if (canPost(organiser)) return null;
  return organiser.state === "closed" ? W.closed : W.suspended;
}

export function NewOrganiserEvent({ id }: { id: string }) {
  const back = backToOrganiser(id);
  const organiser = useOrganiser(id, true);

  if (organiser.isPending) {
    return (
      <OrganiserLoading
        label={W.loadingOrganiser}
        back={back}
        title={W.eventFormTitle}
      />
    );
  }
  const page = organiser.data;
  if (!page) {
    return (
      <NoForm back={back} title={W.eventFormTitle}>
        <OrganiserRefusalBlock
          refusal={organiserRefusal(organiser.error)}
          onRetry={() => void organiser.refetch()}
        />
      </NoForm>
    );
  }
  const shut = shutLine(page);
  if (shut) {
    return (
      <NoForm back={back} title={W.eventFormTitle}>
        <Refused line={shut} />
      </NoForm>
    );
  }
  return (
    <Screen back={back}>
      <OrganiserHeading>{W.eventFormTitle}</OrganiserHeading>
      <EventFormBody
        organiserId={page.id}
        selfPublish={page.selfPublish}
        start={emptyEventForm(page.destinationKey)}
      />
    </Screen>
  );
}

export function EditOrganiserEvent({
  id,
  postId,
}: {
  id: string;
  postId: string;
}) {
  const back = { href: eventHref(id, postId), label: W.backToEvent };
  const organiser = useOrganiser(id, true);
  const events = useOrganiserEvents(id, true);

  if (organiser.isPending || events.isPending) {
    return (
      <OrganiserLoading
        label={W.loadingEvent}
        back={back}
        title={W.eventEditTitle}
      />
    );
  }
  for (const read of [organiser, events]) {
    if (read.data === undefined) {
      return (
        <NoForm back={back} title={W.eventEditTitle}>
          <OrganiserRefusalBlock
            refusal={organiserRefusal(read.error)}
            onRetry={() => void read.refetch()}
          />
        </NoForm>
      );
    }
  }
  const page = organiser.data;
  const event = eventIn(events.data, postId);
  if (!page) return null;
  if (!event) {
    return (
      <NoForm back={back} title={W.eventEditTitle}>
        <Refused line={W.eventNotFound} />
      </NoForm>
    );
  }
  if (!canChangeEvent(page, event)) {
    return (
      <NoForm back={back} title={W.eventEditTitle}>
        <Refused
          line={eventChangeRefusal(event.state) ?? shutLine(page) ?? W.notNow}
        />
      </NoForm>
    );
  }
  return (
    <Screen back={back}>
      <OrganiserHeading>{W.eventEditTitle}</OrganiserHeading>
      <EventFormBody
        organiserId={page.id}
        start={eventForm(event)}
        original={event}
      />
    </Screen>
  );
}

function EventFormBody({
  organiserId,
  selfPublish = false,
  start,
  original,
}: {
  organiserId: string;
  selfPublish?: boolean;
  start: OrganiserEventForm;
  original?: OrganiserEvent;
}) {
  const router = useRouter();
  const qc = useQueryClient();
  const post = usePostOrganiserEvent(organiserId);
  const edit = useEditOrganiserEvent(organiserId);
  const places = usePlaceList({ initial: null, signedIn: true, enabled: true });
  const vocabulary = useVocabulary();
  // Read once, never during a render: "now" is the server's clock, in India.
  const [now] = useState(() => Date.now() + clockOffsetMs());
  const [kept] = useState<EventKept>(() => ({
    start: original?.startsAt ?? "",
    end: original?.endsAt ?? "",
    until: original?.repeatsWeeklyUntil ?? "",
  }));
  const [form, setForm] = useState<OrganiserEventForm>(() => ({
    ...start,
    start: eventBoxValue(start.start),
    end: eventBoxValue(start.end),
  }));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [line, setLine] = useState<string | null>(null);
  const [refusal, setRefusal] = useState<OrganiserRefusal | null>(null);
  const busy = post.isPending || edit.isPending;
  const ids = useId();

  function set<K extends keyof OrganiserEventForm>(
    key: K,
    value: OrganiserEventForm[K],
  ) {
    setForm((was) => ({ ...was, [key]: value }));
    setErrors((was) => withoutKeys(was, EVENT_FIELD_KEYS[key]));
  }

  function refused(error: unknown) {
    const said = organiserRefusal(error);
    if (said.kind === "fields") setErrors({ ...said.fields });
    if (said.kind === "network") {
      // No answer: it may have gone through, so the list is read again and nothing is sent by itself.
      void qc.invalidateQueries({ queryKey: qk.organiserEvents(organiserId) });
    }
    setRefusal(said);
  }

  function send() {
    if (busy) return;
    setLine(null);
    setRefusal(null);
    const check = checkEventForm(form, kept, now);
    if (!check.ok) {
      setErrors(check.fields);
      setLine(check.line);
      return;
    }
    setErrors({});
    const body = eventInput(form, check.times);
    if (original) {
      edit.mutate(
        { postId: original.id, body },
        {
          onSuccess: () =>
            router.replace(`${eventHref(organiserId, original.id)}?saved=1`),
          onError: refused,
        },
      );
      return;
    }
    post.mutate(body, {
      onSuccess: (event) => {
        // On the list at once, so the event's screen has it before the list is read again.
        qc.setQueryData<OrganiserEvent[]>(
          qk.organiserEvents(organiserId),
          (list) =>
            list ? [event, ...list.filter((e) => e.id !== event.id)] : list,
        );
        router.replace(
          `${eventHref(organiserId, event.id)}?sent=${encodeURIComponent(event.state)}`,
        );
      },
      onError: refused,
    });
  }

  const departments = vocabulary.data?.categories ?? [];
  const markets = places.data?.markets ?? [];
  const bounds = repeatBounds(form.start, now);

  return (
    <form
      className="mt-6 flex flex-col gap-6"
      noValidate
      data-testid="organiser-event-form"
      onSubmit={(e) => {
        e.preventDefault();
        send();
      }}
    >
      <Field
        label={W.eventTitle}
        value={form.title}
        onChange={(e) => set("title", e.target.value)}
        error={errors.title}
        maxLength={140}
        className="min-w-0"
      />

      <Choice
        id={`${ids}-department`}
        label={W.eventDepartment}
        error={errors.department}
        empty={
          vocabulary.isPending
            ? null
            : departments.length === 0
              ? W.noDepartments
              : null
        }
      >
        {departments.map((department) => (
          <Chip
            key={department.key}
            on={form.department === department.key}
            onPick={() => set("department", department.key)}
          >
            {department.label}
          </Chip>
        ))}
      </Choice>

      <Field
        label={W.eventStart}
        type="datetime-local"
        value={form.start}
        min={indiaClock(now)}
        onChange={(e) => set("start", e.target.value)}
        error={errors.startsAt}
      />
      <Field
        label={W.eventEnd}
        type="datetime-local"
        value={form.end}
        min={form.start || indiaClock(now)}
        onChange={(e) => set("end", e.target.value)}
        error={errors.endsAt}
      />
      <div>
        <Field
          label={W.eventRepeat}
          type="date"
          value={form.until}
          min={bounds.min}
          max={bounds.max}
          onChange={(e) => set("until", e.target.value)}
          error={errors.repeatsWeeklyUntil}
        />
        {form.until ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="mt-2"
            onClick={() => set("until", "")}
          >
            {W.noRepeat}
          </Button>
        ) : null}
      </div>

      <EventPlacePicker
        markets={markets}
        pending={places.isPending}
        value={form.destinationKey}
        error={errors.destinationKey}
        onPick={(key) => set("destinationKey", key)}
      />

      <Field
        label={W.eventVenue}
        value={form.venueName}
        onChange={(e) => set("venueName", e.target.value)}
        error={errors.venueName}
        maxLength={160}
      />
      <Field
        label={W.eventAddress}
        value={form.address}
        onChange={(e) => set("address", e.target.value)}
        error={errors.address}
      />

      <EventPrice
        free={form.free}
        price={form.price}
        errors={errors}
        onFree={(free) => set("free", free)}
        onPrice={(price) => set("price", price)}
      />
      <Field
        label={W.eventPriceNote}
        hint={W.priceNoteHint}
        value={form.priceNote}
        maxLength={120}
        onChange={(e) => set("priceNote", e.target.value)}
        error={errors.priceNote}
      />

      <Field
        label={W.eventLink}
        type="url"
        inputMode="url"
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        placeholder={W.linkPlaceholder}
        value={form.link}
        onChange={(e) => set("link", e.target.value)}
        error={errors.link}
      />
      <EventAbout
        value={form.about}
        error={errors.about}
        onChange={(text) => set("about", text)}
      />

      <div>
        {line ? (
          <p role="alert" className="text-terra-deep mb-4 text-sm text-pretty">
            {line}
          </p>
        ) : null}
        <OrganiserWriteError refusal={refusal} onRetry={send} />
        <Button
          type="submit"
          size="lg"
          block
          className="mt-4"
          pending={busy}
          pendingLabel={original ? W.saving : W.sending}
          data-testid="organiser-event-form-send"
        >
          {original ? W.saveEvent : W.sendEvent(selfPublish)}
        </Button>
      </div>
    </form>
  );
}
