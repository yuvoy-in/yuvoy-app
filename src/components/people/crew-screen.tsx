"use client";

import { useEffect, useId, useState } from "react";
import { useRouter } from "next/navigation";
import { crewMissing, useDeleteCrew } from "@/lib/people/use-crews";
import {
  CREWS_WORDS as W,
  crewCountLine,
  crewMemberName,
  type Crew,
} from "@/lib/people/crews-words";
import { Button, ButtonLink } from "@/components/ui/button";
import { CrewInvite } from "./crew-invite";
import { Initial, Refusal } from "./people-parts";
import {
  CrewBody,
  CrewGone,
  CrewTitle,
  CrewsGate,
  findCrew,
} from "./crew-parts";

/**
 * `/people/crews/{crewId}`, one crew (yuvoy-app#227): its name, who is in
 * it, and the ways to change it (the editor, for the name and the members)
 * or delete it after a second tap. A crew that is not in the list any more
 * says so, with a way back to People. `saved` is the editor's "Crew saved",
 * shown once on arriving here from it.
 */
export function CrewScreen({
  crewId,
  saved = false,
}: {
  crewId: string;
  saved?: boolean;
}) {
  const router = useRouter();
  /*
    Held here, not in the crew's view: a delete takes the crew out of the
    list before it answers, and the view goes with it. Once it is done this
    page says "Crew deleted", not that the crew is gone. Only a `204` is done:
    a `404` reads the release again and the line shows under the button; the
    list read after it decides whether the crew stays (People closed replaces
    it).
  */
  const remove = useDeleteCrew();
  const done = remove.isSuccess;
  useEffect(() => {
    if (done) router.replace("/people");
  }, [done, router]);

  return (
    <CrewsGate next={`/people/crews/${crewId}`} back={W.back}>
      {(crews) => {
        const crew = findCrew(crews, crewId);
        if (done || (!crew && remove.isPending)) {
          return (
            <>
              <p role="status" className="text-body font-bold text-pretty">
                {W.deleted}
              </p>
              <ButtonLink href="/people" size="lg" className="mt-6">
                {W.gone.action}
              </ButtonLink>
            </>
          );
        }
        if (!crew) return <CrewGone />;
        return <CrewView crew={crew} saved={saved} remove={remove} />;
      }}
    </CrewsGate>
  );
}

function CrewView({
  crew,
  saved,
  remove,
}: {
  crew: Crew;
  saved: boolean;
  remove: ReturnType<typeof useDeleteCrew>;
}) {
  const [asking, setAsking] = useState(false);
  const membersId = useId();

  return (
    <>
      <CrewTitle>{crew.name}</CrewTitle>
      <CrewBody>{crewCountLine(crew.members.length)}</CrewBody>
      {saved ? (
        <p role="status" className="mt-3 text-sm font-bold">
          {W.saved}
        </p>
      ) : null}

      <section aria-labelledby={membersId} className="mt-8">
        <h2
          id={membersId}
          className="label text-forest/75 border-paper-line border-b pb-2"
        >
          {W.pickHead}
        </h2>
        {crew.members.length === 0 ? (
          <p className="text-forest/70 text-body mt-3 text-pretty">
            {W.nobody}
          </p>
        ) : (
          <ul className="divide-paper-line divide-y">
            {crew.members.map((m) => (
              <li
                key={m.personId}
                data-testid="crew-member"
                className="flex items-center gap-3 py-3"
              >
                <Initial initial={m.initial} />
                <span className="text-sm font-bold">{crewMemberName(m)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Under the members and before the ways to change the crew, as on the
          phone. It shows only while People and plans are open and the crew
          has someone in it. */}
      <div className="mt-8 empty:hidden">
        <CrewInvite crewId={crew.crewId} memberCount={crew.members.length} />
      </div>

      <div className="mt-8 flex flex-wrap gap-3">
        <ButtonLink href={`/people/crews/${crew.crewId}/edit`} size="lg">
          {W.edit}
        </ButtonLink>
        {asking ? null : (
          <Button variant="outline" size="lg" onClick={() => setAsking(true)}>
            {W.delete}
          </Button>
        )}
      </div>

      {asking ? (
        <div
          role="group"
          aria-label={W.deleteTitle(crew.name)}
          className="border-paper-line mt-6 border-t pt-4"
        >
          <p className="text-sm font-bold">{W.deleteTitle(crew.name)}</p>
          <p className="text-forest/70 mt-1 text-sm">{W.deleteBody}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              size="sm"
              pending={remove.isPending}
              pendingLabel={W.deleting}
              onClick={() => remove.mutate(crew.crewId)}
            >
              {W.delete}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={remove.isPending}
              onClick={() => {
                remove.reset();
                setAsking(false);
              }}
            >
              {W.deleteKeep}
            </Button>
          </div>
          {crewMissing(remove.error) === "closed" ? (
            <p role="alert" className="text-terra-deep mt-2 text-sm">
              {W.closedNotDeleted}
            </p>
          ) : crewMissing(remove.error) === "unknown" ? (
            <p role="alert" className="text-terra-deep mt-2 text-sm">
              {W.notDeleted}
            </p>
          ) : remove.error ? (
            <Refusal error={remove.error} className="mt-2" />
          ) : null}
        </div>
      ) : null}
    </>
  );
}
