"use client";

import Link from "@/components/ui/link";
import { isPeopleClosed } from "@/lib/people/use-people";
import { useMyCrews } from "@/lib/people/use-crews";
import {
  CREWS_MOST,
  CREWS_WORDS as W,
  crewCountLine,
  crewMembersLine,
  type Crew,
} from "@/lib/people/crews-words";
import { PEOPLE_WORDS } from "@/lib/people/people-words";
import { Button, ButtonLink } from "@/components/ui/button";
import { LoadingState, Skeleton } from "@/components/states";
import { refusalText } from "./people-parts";

/**
 * The Crews section on `/people`, below the friends (yuvoy-app#227).
 *
 * Shown only to somebody with a friend or a crew: with neither there is
 * nobody to put in one. Hidden on a `404` (People closed under them, which
 * the screen above shows on its own). At 20 crews "New crew" is not offered
 * and the line says why.
 */
export function CrewsSection({ friendCount }: { friendCount: number }) {
  const crews = useMyCrews(true);

  if (crews.isPending) {
    if (friendCount === 0) return null;
    return (
      <section aria-labelledby="crews" className="mt-8">
        <Title />
        <LoadingState label={W.loading}>
          <Skeleton className="mt-3 h-14 w-full" />
        </LoadingState>
      </section>
    );
  }

  if (crews.isLoadingError) {
    if (isPeopleClosed(crews.error)) return null;
    return (
      <section aria-labelledby="crews" className="mt-8">
        <Title />
        <div role="alert" className="mt-3">
          <p className="text-sm font-bold">{W.failed}</p>
          <p className="text-forest/70 mt-1 text-sm">
            {refusalText(crews.error)}
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="mt-3"
          pending={crews.isFetching}
          pendingLabel={PEOPLE_WORDS.retrying}
          onClick={() => void crews.refetch()}
        >
          {PEOPLE_WORDS.retry}
        </Button>
      </section>
    );
  }

  const list = crews.data?.crews ?? [];
  if (friendCount === 0 && list.length === 0) return null;
  const full = list.length >= CREWS_MOST;

  return (
    <section aria-labelledby="crews" className="mt-8">
      <Title />
      {list.length === 0 ? (
        <p className="text-forest/70 text-body mt-3 text-pretty">{W.empty}</p>
      ) : (
        <ul className="divide-paper-line divide-y">
          {list.map((crew) => (
            <CrewRow key={crew.crewId} crew={crew} />
          ))}
        </ul>
      )}
      {full ? (
        <p className="text-forest/70 mt-3 text-sm text-pretty">{W.limit}</p>
      ) : (
        <ButtonLink
          href="/people/crews/new"
          variant="outline"
          size="sm"
          className="mt-3"
        >
          {W.newCrew}
        </ButtonLink>
      )}
      <p className="text-forest/70 mt-3 text-xs text-pretty">{W.foot}</p>
    </section>
  );
}

function Title() {
  return (
    <h2
      id="crews"
      className="label text-forest/75 border-paper-line border-b pb-2"
    >
      {W.head}
    </h2>
  );
}

/** One crew: its name, how many are in it and who, opening its page. */
function CrewRow({ crew }: { crew: Crew }) {
  return (
    <li data-testid="crew">
      <Link
        href={`/people/crews/${encodeURIComponent(crew.crewId)}`}
        className="hover:bg-forest/5 -mx-2 block rounded-md px-2 py-4"
      >
        <span className="block text-sm font-bold">{crew.name}</span>
        <span className="text-forest/70 mt-0.5 block text-sm">
          {crew.members.length > 0
            ? `${crewCountLine(crew.members.length)}: ${crewMembersLine(crew.members)}`
            : crewCountLine(0)}
        </span>
      </Link>
    </li>
  );
}
