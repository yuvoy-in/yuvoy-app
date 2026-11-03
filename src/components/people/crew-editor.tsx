"use client";

import { useId, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  friendsOf,
  needsAge,
  needsName,
  useMyFriends,
} from "@/lib/people/use-people";
import {
  crewMissing,
  isCrewGone,
  isCrewLimit,
  isNotFriends,
  notFriendsIds,
  useCreateCrew,
  useUpdateCrew,
} from "@/lib/people/use-crews";
import {
  CREWS_MOST,
  CREW_MEMBERS_MOST,
  CREW_NAME_MOST,
  CREWS_WORDS as W,
  crewChange,
  crewMemberName,
  crewNameLength,
  notFriendsLine,
  type Crew,
} from "@/lib/people/crews-words";
import { PEOPLE_WORDS } from "@/lib/people/people-words";
import { Button, ButtonLink } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { LoadingState, Skeleton } from "@/components/states";
import { AgeStep } from "./age-step";
import { NameStep } from "./name-step";
import { Initial, Refusal, isStepRefusal } from "./people-parts";
import {
  CrewBody,
  CrewGone,
  CrewTitle,
  CrewsGate,
  findCrew,
} from "./crew-parts";

/**
 * `/people/crews/new` and `/people/crews/{crewId}/edit` (yuvoy-app#227):
 * a crew's name and a tick list of friends, for a new crew and for changing
 * one. The crew's own members come first, then the other friends.
 *
 * Nothing is sent without a name (1 to 40 characters) and 1 to 50 friends.
 * A change sends only what changed. Refusals keep the form as it was:
 *
 *   - `not_friends` names who stopped being a friend and offers to take them
 *     out, then the traveller saves again;
 *   - `adult_confirmation_required` and `name_required` open the age or the
 *     name step here, as the friend link page does, and the form comes back
 *     as it was once the step is done;
 *   - `crew_limit_reached` says why there can be no more;
 *   - a `404` reads `GET /me/people` first: a `404` there is People closed.
 *     Then a change reads the list: a crew not in it is gone. Anything else,
 *     a new crew's `404` included, is "not saved" or "not deleted", in our
 *     words (`crewMissing` in use-crews.ts);
 *   - anything else, a lost connection included, is said under Save.
 */
export function CrewEditorScreen({ crewId }: { crewId?: string }) {
  const next = crewId ? `/people/crews/${crewId}/edit` : "/people/crews/new";
  const back = crewId
    ? { href: `/people/crews/${crewId}`, label: W.backToCrew }
    : W.back;
  return (
    <CrewsGate next={next} back={back}>
      {(crews, onUnderAge) => {
        if (crewId) {
          const crew = findCrew(crews, crewId);
          if (!crew) return <CrewGone />;
          return <CrewEditor crew={crew} onUnderAge={onUnderAge} />;
        }
        if (crews.length >= CREWS_MOST) {
          return (
            <>
              <CrewTitle>{W.newTitle}</CrewTitle>
              <CrewBody>{W.limit}</CrewBody>
              <ButtonLink href="/people" size="lg" className="mt-6">
                {W.gone.action}
              </ButtonLink>
            </>
          );
        }
        return <CrewEditor onUnderAge={onUnderAge} />;
      }}
    </CrewsGate>
  );
}

type Row = { personId: string; name: string; initial: string };

const lower = (id: string) => id.toLowerCase();

function CrewEditor({
  crew,
  onUnderAge,
}: {
  crew?: Crew;
  onUnderAge: (message: string) => void;
}) {
  const router = useRouter();
  const create = useCreateCrew();
  const update = useUpdateCrew();
  const save = crew ? update : create;
  const friends = useMyFriends(true);
  const titleId = useId();

  const [name, setName] = useState(crew?.name ?? "");
  const [picked, setPicked] = useState<string[]>(
    () => crew?.members.map((m) => m.personId) ?? [],
  );
  const [nameError, setNameError] = useState<string | undefined>();
  const [pickError, setPickError] = useState<string | null>(null);
  const [step, setStep] = useState<"age" | "name" | null>(null);
  const [leftOut, setLeftOut] = useState<string[]>([]);
  const [takenOut, setTakenOut] = useState(false);

  // The crew's own members first, then every other friend.
  const members: Row[] = (crew?.members ?? []).map((m) => ({
    personId: m.personId,
    name: crewMemberName(m),
    initial: m.initial,
  }));
  const known = new Set(members.map((m) => lower(m.personId)));
  const others: Row[] = friendsOf(friends.data?.pages)
    .filter((f) => !known.has(lower(f.personId)))
    .map((f) => ({ personId: f.personId, name: f.name, initial: f.initial }));
  const rows = [...members, ...others];

  const isPicked = (id: string) => picked.some((p) => lower(p) === lower(id));
  const isLeftOut = (id: string) => leftOut.includes(lower(id));
  const full = picked.length >= CREW_MEMBERS_MOST;

  if (step === "age") {
    return <AgeStep onDone={() => setStep(null)} onUnderAge={onUnderAge} />;
  }
  if (step === "name") return <NameStep onDone={() => setStep(null)} />;

  if (crew && isCrewGone(update.error)) return <CrewGone />;

  function toggle(id: string, on: boolean) {
    setPickError(null);
    setPicked((now) =>
      on ? [...now, id] : now.filter((p) => lower(p) !== lower(id)),
    );
  }

  function takeThemOut() {
    setPicked((now) => now.filter((p) => !isLeftOut(p)));
    setTakenOut(true);
    save.reset();
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    // After a save the page is about to change: a second submit would make
    // a second crew.
    if (save.isPending || save.isSuccess) return;
    const length = crewNameLength(name);
    const nameProblem =
      length === 0
        ? W.nameBlank
        : length > CREW_NAME_MOST
          ? W.nameLong
          : undefined;
    // A rename alone sends no memberIds (the API takes `{name}` by itself),
    // so a crew with nobody in it can still be renamed.
    const sendsMembers =
      !crew || crewChange(crew, name, picked)?.memberIds !== undefined;
    const pickProblem =
      picked.length === 0 && sendsMembers
        ? W.pickOne
        : picked.length > CREW_MEMBERS_MOST
          ? W.pickMost
          : null;
    setNameError(nameProblem);
    setPickError(pickProblem);
    if (nameProblem || pickProblem) return;
    setTakenOut(false);

    const onError = (error: unknown) => {
      if (needsAge(error)) setStep("age");
      else if (needsName(error)) setStep("name");
      else if (isNotFriends(error)) {
        setLeftOut(notFriendsIds(error));
      }
    };
    const onSaved = (saved: Crew) =>
      router.replace(`/people/crews/${saved.crewId}?saved=1`);

    if (!crew) {
      create.mutate(
        { name: name.trim(), memberIds: picked },
        { onSuccess: onSaved, onError },
      );
      return;
    }
    const patch = crewChange(crew, name, picked);
    if (!patch) {
      router.replace(`/people/crews/${crew.crewId}`);
      return;
    }
    update.mutate(
      { crewId: crew.crewId, patch },
      { onSuccess: onSaved, onError },
    );
  }

  const leftOutNames = rows
    .filter((r) => isLeftOut(r.personId))
    .map((r) => r.name);
  const stillLeftIn = picked.some((p) => isLeftOut(p));

  return (
    <form onSubmit={submit} noValidate aria-labelledby={titleId}>
      <h1
        id={titleId}
        className="font-display tracking-display leading-display text-3xl text-balance"
      >
        {crew ? W.editTitle : W.newTitle}
      </h1>
      <CrewBody>{W.foot}</CrewBody>

      <Field
        label={W.nameLabel}
        placeholder={W.namePlaceholder}
        value={name}
        onChange={(e) => {
          setName(e.target.value);
          setNameError(undefined);
        }}
        error={nameError}
        autoComplete="off"
        className="mt-6"
      />

      <fieldset className="mt-8">
        <legend className="label text-forest/75">{W.pickHead}</legend>
        <p
          aria-live="polite"
          className="text-forest/70 mt-2 text-sm tabular-nums"
        >
          {W.picked(picked.length)}
        </p>
        {full ? (
          <p className="text-forest/70 mt-1 text-sm">{W.pickMost}</p>
        ) : null}
        {pickError ? (
          <p role="alert" className="text-terra-deep mt-1 text-sm">
            {pickError}
          </p>
        ) : null}

        {rows.length > 0 ? (
          <ul className="divide-paper-line border-paper-line mt-3 divide-y border-t">
            {rows.map((row) => {
              const on = isPicked(row.personId);
              const gone = isLeftOut(row.personId);
              return (
                <li key={row.personId} data-testid="crew-pick">
                  <label className="flex cursor-pointer items-center gap-3 py-3">
                    <input
                      type="checkbox"
                      className="accent-forest size-6 shrink-0"
                      checked={on}
                      disabled={!on && (full || gone)}
                      onChange={(e) => toggle(row.personId, e.target.checked)}
                    />
                    <Initial initial={row.initial} />
                    <span className="flex-1 text-sm font-bold">{row.name}</span>
                    {gone ? (
                      <span className="text-terra-deep text-xs">
                        {W.notFriendTag}
                      </span>
                    ) : null}
                  </label>
                </li>
              );
            })}
          </ul>
        ) : null}

        {friends.isPending ? (
          <LoadingState label={PEOPLE_WORDS.loading}>
            <Skeleton className="mt-3 h-14 w-full" />
          </LoadingState>
        ) : friends.isLoadingError ? (
          <div className="mt-3">
            <Refusal error={friends.error} />
            <Button
              variant="outline"
              size="sm"
              className="mt-2"
              pending={friends.isFetching}
              pendingLabel={PEOPLE_WORDS.retrying}
              onClick={() => void friends.refetch()}
            >
              {PEOPLE_WORDS.retry}
            </Button>
          </div>
        ) : rows.length === 0 ? (
          <p className="text-forest/70 text-body mt-3 text-pretty">
            {W.noFriends}
          </p>
        ) : friends.hasNextPage ? (
          <Button
            variant="outline"
            block
            className="mt-3"
            pending={friends.isFetchingNextPage}
            pendingLabel={PEOPLE_WORDS.loadingMore}
            onClick={() => void friends.fetchNextPage()}
          >
            {PEOPLE_WORDS.more}
          </Button>
        ) : null}
      </fieldset>

      <div className="mt-8 flex flex-wrap gap-3">
        <Button
          type="submit"
          size="lg"
          pending={save.isPending}
          pendingLabel={W.saving}
        >
          {W.save}
        </Button>
        <ButtonLink
          href={crew ? `/people/crews/${crew.crewId}` : "/people"}
          variant="ghost"
          size="lg"
        >
          {W.cancel}
        </ButtonLink>
      </div>

      {isNotFriends(save.error) ? (
        <div role="alert" className="mt-4">
          <p className="text-terra-deep text-sm">
            {notFriendsLine(stillLeftIn ? leftOutNames : [])}
          </p>
          {stillLeftIn ? (
            <Button
              variant="outline"
              size="sm"
              className="mt-2"
              onClick={takeThemOut}
            >
              {W.takeOut}
            </Button>
          ) : null}
        </div>
      ) : isCrewLimit(save.error) ? (
        <p role="alert" className="text-terra-deep mt-4 text-sm">
          {W.limit}
        </p>
      ) : crewMissing(save.error) === "closed" ? (
        <p role="alert" className="text-terra-deep mt-4 text-sm">
          {W.closedNotSaved}
        </p>
      ) : crewMissing(save.error) === "unknown" ? (
        <p role="alert" className="text-terra-deep mt-4 text-sm">
          {W.notSaved}
        </p>
      ) : save.error && !isStepRefusal(save.error) ? (
        <Refusal error={save.error} className="mt-4" />
      ) : null}

      {takenOut && !save.error ? (
        <p role="status" className="mt-4 text-sm font-bold">
          {W.takenOut}
        </p>
      ) : null}
    </form>
  );
}
