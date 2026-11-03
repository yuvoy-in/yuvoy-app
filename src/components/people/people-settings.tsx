"use client";

import { useId, useState, type FormEvent } from "react";
import { useUpdatePeople, type PeoplePatch } from "@/lib/people/use-people";
import {
  PEOPLE_WORDS as W,
  type PeopleHome,
  type Sharing,
} from "@/lib/people/people-words";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { Refusal, isStepRefusal } from "./people-parts";

/**
 * What a traveller's friends see, and the request emails (yuvoy-app#222).
 * Each control says who sees it. `onStep` takes a refusal that asks for the
 * age or name step first, so the screen can open it.
 */

/** Friends or Only me, with the offer for goings made before People. */
function SharingChoice({
  value,
  onChange,
  offer,
  onOffer,
  upcoming,
}: {
  value: Sharing;
  onChange: (next: Sharing) => void;
  offer: boolean;
  onOffer: (next: boolean) => void;
  upcoming: number;
}) {
  const legendId = useId();
  const options: { value: Sharing; label: string; hint: string }[] = [
    { value: "friends", label: W.sharingFriends, hint: W.sharingFriendsHint },
    { value: "only_me", label: W.sharingOnlyMe, hint: W.sharingOnlyMeHint },
  ];
  return (
    <fieldset>
      <legend id={legendId} className="label text-forest/75">
        {W.sharingTitle}
      </legend>
      <div className="mt-3 space-y-3">
        {options.map((o) => (
          <label key={o.value} className="flex items-start gap-3">
            <input
              type="radio"
              name={`sharing-${legendId}`}
              checked={value === o.value}
              onChange={() => onChange(o.value)}
              className="accent-terra-deep size-6 shrink-0"
            />
            <span>
              <span className="block">{o.label}</span>
              <span className="text-forest/70 block text-sm">{o.hint}</span>
            </span>
          </label>
        ))}
      </div>
      {value === "friends" && upcoming > 0 ? (
        <label className="mt-4 flex items-start gap-3">
          <input
            type="checkbox"
            checked={offer}
            onChange={(e) => onOffer(e.target.checked)}
            className="accent-terra-deep size-6 shrink-0"
          />
          <span className="text-sm">{W.shareUpcoming(upcoming)}</span>
        </label>
      ) : null}
      <p className="text-forest/70 mt-3 text-xs">
        {value === "friends" ? W.sharingWhoFriends : W.sharingWhoMe}
      </p>
    </fieldset>
  );
}

function patchOf(sharing: Sharing, offer: boolean, upcoming: number) {
  const patch: PeoplePatch = { sharing };
  if (sharing === "friends" && upcoming > 0 && offer) {
    patch.shareUpcomingGoing = true;
  }
  return patch;
}

/** The first step, while `sharing` is still null. Only me is preselected. */
export function SharingFirst({
  home,
  onStep,
}: {
  home: PeopleHome;
  onStep: (error: unknown) => void;
}) {
  const update = useUpdatePeople();
  const [sharing, setSharing] = useState<Sharing>("only_me");
  const [offer, setOffer] = useState(false);
  const titleId = useId();

  function submit(e: FormEvent) {
    e.preventDefault();
    update.mutate(patchOf(sharing, offer, home.privateUpcomingGoing), {
      onError: (error) => {
        if (isStepRefusal(error)) onStep(error);
      },
    });
  }

  return (
    <form onSubmit={submit} aria-labelledby={titleId}>
      <h1
        id={titleId}
        className="font-display tracking-display leading-display text-3xl text-balance"
      >
        {W.sharingFirst.title}
      </h1>
      <p className="text-forest/70 text-body mt-3 mb-6 text-pretty">
        {W.sharingFirst.body}
      </p>
      <SharingChoice
        value={sharing}
        onChange={setSharing}
        offer={offer}
        onOffer={setOffer}
        upcoming={home.privateUpcomingGoing}
      />
      {update.error && !isStepRefusal(update.error) ? (
        <Refusal error={update.error} className="mt-4" />
      ) : null}
      <Button
        type="submit"
        size="lg"
        className="mt-6"
        pending={update.isPending}
        pendingLabel={W.name.saving}
      >
        {W.sharingFirst.action}
      </Button>
    </form>
  );
}

/** The sharing setting on the People screen, saved with its own button. */
export function SharingSetting({
  home,
  onStep,
}: {
  home: PeopleHome;
  onStep: (error: unknown) => void;
}) {
  const update = useUpdatePeople();
  const [sharing, setSharing] = useState<Sharing>(home.sharing ?? "only_me");
  const [offer, setOffer] = useState(false);

  function submit(e: FormEvent) {
    e.preventDefault();
    update.mutate(patchOf(sharing, offer, home.privateUpcomingGoing), {
      onSuccess: () => setOffer(false),
      onError: (error) => {
        if (isStepRefusal(error)) onStep(error);
      },
    });
  }

  return (
    <form onSubmit={submit} className="mt-10" aria-label={W.sharingTitle}>
      <SharingChoice
        value={sharing}
        onChange={(next) => {
          setSharing(next);
          update.reset();
        }}
        offer={offer}
        onOffer={setOffer}
        upcoming={home.privateUpcomingGoing}
      />
      {update.error && !isStepRefusal(update.error) ? (
        <Refusal error={update.error} className="mt-4" />
      ) : null}
      <div className="mt-4 flex items-center gap-4">
        <Button
          type="submit"
          variant="outline"
          size="sm"
          pending={update.isPending}
          pendingLabel={W.name.saving}
        >
          {W.sharingSave}
        </Button>
        <p role="status" className="text-forest/70 text-sm">
          {update.isSuccess ? W.saved : ""}
        </p>
      </div>
    </form>
  );
}

/** "Friend request emails", a switch saved the moment it moves. */
export function EmailsSwitch({ home }: { home: PeopleHome }) {
  const update = useUpdatePeople();
  const ids = useId();
  const on = home.requestEmails;
  return (
    <section className="mt-10" aria-labelledby={`${ids}-title`}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <p id={`${ids}-title`} className="label text-forest/75">
            {W.emailsTitle}
          </p>
          <p id={`${ids}-hint`} className="text-forest/70 mt-1.5 text-sm">
            {W.emailsHint}
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={on}
          aria-labelledby={`${ids}-title`}
          aria-describedby={`${ids}-hint`}
          aria-busy={update.isPending || undefined}
          onClick={() => {
            if (!update.isPending) update.mutate({ requestEmails: !on });
          }}
          className="flex min-h-11 min-w-11 shrink-0 items-center justify-center"
        >
          <span
            aria-hidden="true"
            className={cn(
              "ease-interaction relative inline-flex h-7 w-12 items-center rounded-full transition-colors duration-200",
              on ? "bg-forest" : "bg-forest/20",
            )}
          >
            <span
              className={cn(
                "bg-paper ease-interaction inline-block size-5 rounded-full shadow-sm transition-transform duration-200",
                on ? "translate-x-6" : "translate-x-1",
              )}
            />
          </span>
        </button>
      </div>
      {update.error ? <Refusal error={update.error} className="mt-3" /> : null}
    </section>
  );
}
